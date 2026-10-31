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

@Controller("organizations/:organizationId/fiscal-credentials")
@UseGuards(JwtAccessGuard)
export class FiscalCredentialsController {
  constructor(private readonly credentials: FiscalCredentialsService) {}
  @Get() @Header("Cache-Control", "no-store") status(
    @Param("organizationId") org: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.credentials.status(req.auth!.sub, org);
  }
  @Get("request") @Header("Cache-Control", "no-store") request(
    @Param("organizationId") org: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.credentials.request(req.auth!.sub, org);
  }
  @Post("request") @Header("Cache-Control", "no-store") prepare(
    @Param("organizationId") org: string,
    @Req() req: AuthenticatedRequest,
    @Body() body: PrepareCredentialDto,
  ) {
    return this.credentials.prepare(req.auth!.sub, org, body);
  }
  @Post("certificate") @Header("Cache-Control", "no-store") upload(
    @Param("organizationId") org: string,
    @Req() req: AuthenticatedRequest,
    @Body() body: UploadCredentialDto,
  ) {
    assertCredentialTransport(
      req.secure,
      req.socket.remoteAddress,
      req.headers["x-forwarded-proto"],
      process.env.NODE_ENV === "production",
    );
    return this.credentials.upload(req.auth!.sub, org, body);
  }
}
