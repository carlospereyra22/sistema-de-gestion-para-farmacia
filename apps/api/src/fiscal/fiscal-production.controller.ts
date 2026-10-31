import {
  Body,
  Controller,
  Get,
  Header,
  Param,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import { JwtAccessGuard } from "../auth/jwt-access.guard";
import type { AuthenticatedRequest } from "../auth/auth.types";
import { FiscalCredentialsService } from "./fiscal-credentials.service";
import {
  PrepareCredentialDto,
  UploadCredentialDto,
} from "./fiscal-credentials.dto";
import { assertCredentialTransport } from "./credential-transport";
import { ArcaConnectionService } from "./arca-connection.service";
import { PrismaService } from "../prisma/prisma.service";
import { IsBoolean, IsInt, IsUUID, Min, Max } from "class-validator";
import { ProductionConfigurationService } from "./production-configuration.service";
class ActivateProductionDto {
  @IsUUID() branchId!: string;
  @IsInt() @Min(1) @Max(99999) point!: number;
  @IsBoolean() exclusive!: boolean;
}

// Preparation and explicit activation. Issuance only through branch-scoped Sales routes.
@Controller("organizations/:organizationId/fiscal-production")
@UseGuards(JwtAccessGuard)
export class FiscalProductionController {
  constructor(
    private readonly credentials: FiscalCredentialsService,
    private readonly connection: ArcaConnectionService,
    private readonly prisma: PrismaService,
    private readonly configurations: ProductionConfigurationService,
  ) {}
  @Post("activate")
  @Header("Cache-Control", "no-store")
  activate(
    @Param("organizationId") org: string,
    @Req() req: AuthenticatedRequest,
    @Body() input: ActivateProductionDto,
  ) {
    this.secure(req);
    return this.configurations.activate(
      req.auth!.sub,
      org,
      input.branchId,
      input.point,
      input.exclusive,
    );
  }
  private secure(req: AuthenticatedRequest) {
    assertCredentialTransport(
      req.secure,
      req.socket.remoteAddress,
      req.headers["x-forwarded-proto"],
      process.env.NODE_ENV === "production",
    );
  }
  @Get("credentials")
  @Header("Cache-Control", "no-store")
  status(
    @Param("organizationId") org: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.credentials.status(req.auth!.sub, org, "PRODUCTION");
  }
  @Get("credentials/request")
  @Header("Cache-Control", "no-store")
  request(
    @Param("organizationId") org: string,
    @Req() req: AuthenticatedRequest,
  ) {
    this.secure(req);
    return this.credentials.request(req.auth!.sub, org, "PRODUCTION");
  }
  @Post("credentials/request")
  @Header("Cache-Control", "no-store")
  prepare(
    @Param("organizationId") org: string,
    @Req() req: AuthenticatedRequest,
    @Body() input: PrepareCredentialDto,
  ) {
    this.secure(req);
    return this.credentials.prepare(req.auth!.sub, org, input, "PRODUCTION");
  }
  @Post("credentials/certificate")
  @Header("Cache-Control", "no-store")
  upload(
    @Param("organizationId") org: string,
    @Req() req: AuthenticatedRequest,
    @Body() input: UploadCredentialDto,
  ) {
    this.secure(req);
    return this.credentials.upload(req.auth!.sub, org, input, "PRODUCTION");
  }
  // Separate calls fit the public web proxy timeout. Tokens never reach the browser.
  @Post("authenticate")
  @Header("Cache-Control", "no-store")
  async authenticate(
    @Param("organizationId") org: string,
    @Req() req: AuthenticatedRequest,
  ) {
    this.secure(req);
    await this.connection.access(req.auth!.sub, org, "setup", "PRODUCTION");
    return {
      environment: "PRODUCTION",
      authenticated: true,
      issuanceEnabled: false,
    };
  }
  @Post("points")
  @Header("Cache-Control", "no-store")
  async points(
    @Param("organizationId") org: string,
    @Req() req: AuthenticatedRequest,
  ) {
    this.secure(req);
    const access = await this.connection.access(
      req.auth!.sub,
      org,
      "setup",
      "PRODUCTION",
      true,
    );
    const points = await this.connection.points(access);
    await this.prisma.fiscalCredential.updateMany({
      where: {
        organizationId: org,
        environment: "PRODUCTION",
        version: access.version,
        representedCuit: access.cuit,
      },
      data: { verifiedAt: new Date() },
    });
    return {
      environment: "PRODUCTION",
      points: points.map((p) => ({ number: p.number })),
      issuanceEnabled: false,
    };
  }
}
