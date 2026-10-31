import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import {
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
} from "class-validator";
import { JwtAccessGuard } from "../auth/jwt-access.guard";
import { BranchAccessGuard } from "../auth/branch-access.guard";
import type { AuthenticatedRequest } from "../auth/auth.types";
import { PrintQueueService } from "./print-queue.service";

class GatewayDto {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  @Matches(/^[^\p{Cc}]*$/u)
  name!: string;
}
class RotateDto {
  @IsBoolean() enabled!: boolean;
}
class PrinterDto extends GatewayDto {
  @IsUUID() gatewayId!: string;
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  @Matches(/^[^\p{Cc}]*$/u)
  windowsPrinterName!: string;
  @IsBoolean() isDefault!: boolean;
  @IsOptional() @IsUUID() cashRegisterId?: string;
}
class HeartbeatDto {
  @IsString() @MaxLength(40) @Matches(/^[a-zA-Z0-9.-]+$/) version!: string;
}
class FinishDto {
  @IsUUID() leaseId!: string;
  @IsIn(["printed", "safe_failure", "uncertain"]) outcome!:
    "printed" | "safe_failure" | "uncertain";
}

@Controller("organizations/:organizationId/branches/:branchId/printing")
@UseGuards(JwtAccessGuard, BranchAccessGuard)
export class PrintingController {
  constructor(private readonly queue: PrintQueueService) {}
  @Get("printers") printers(
    @Req() req: AuthenticatedRequest,
    @Param("organizationId", ParseUUIDPipe) organizationId: string,
    @Param("branchId", ParseUUIDPipe) branchId: string,
  ) {
    return this.queue.printers({
      actorId: req.auth!.sub,
      organizationId,
      branchId,
    });
  }
  @Post("gateways") registerGateway(
    @Req() req: AuthenticatedRequest,
    @Param("organizationId", ParseUUIDPipe) organizationId: string,
    @Param("branchId", ParseUUIDPipe) branchId: string,
    @Body() body: GatewayDto,
  ) {
    return this.queue.registerGateway(
      { actorId: req.auth!.sub, organizationId, branchId },
      body.name,
    );
  }
  @Post("gateways/:id/credential") rotate(
    @Req() req: AuthenticatedRequest,
    @Param("organizationId", ParseUUIDPipe) organizationId: string,
    @Param("branchId", ParseUUIDPipe) branchId: string,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() body: RotateDto,
  ) {
    return this.queue.rotateGateway(
      { actorId: req.auth!.sub, organizationId, branchId },
      id,
      body.enabled,
    );
  }
  @Post("printers") registerPrinter(
    @Req() req: AuthenticatedRequest,
    @Param("organizationId", ParseUUIDPipe) organizationId: string,
    @Param("branchId", ParseUUIDPipe) branchId: string,
    @Body() body: PrinterDto,
  ) {
    return this.queue.registerPrinter(
      { actorId: req.auth!.sub, organizationId, branchId },
      body,
    );
  }
  @Get("jobs/:id") status(
    @Req() req: AuthenticatedRequest,
    @Param("organizationId", ParseUUIDPipe) organizationId: string,
    @Param("branchId", ParseUUIDPipe) branchId: string,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    return this.queue.status(
      { actorId: req.auth!.sub, organizationId, branchId },
      id,
    );
  }
  @Post("jobs/:id/retry") retry(
    @Req() req: AuthenticatedRequest,
    @Param("organizationId", ParseUUIDPipe) organizationId: string,
    @Param("branchId", ParseUUIDPipe) branchId: string,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    return this.queue.retry(
      { actorId: req.auth!.sub, organizationId, branchId },
      id,
    );
  }
}

@Controller("print-gateway")
export class PrintGatewayController {
  constructor(private readonly queue: PrintQueueService) {}
  @Post("heartbeat") heartbeat(
    @Headers("authorization") authorization: string | undefined,
    @Body() body: HeartbeatDto,
  ) {
    return this.queue.heartbeat(authorization, body.version);
  }
  @Post("jobs/claim") claim(
    @Headers("authorization") authorization: string | undefined,
  ) {
    return this.queue.claim(authorization);
  }
  @Post("jobs/:id/finish") finish(
    @Headers("authorization") authorization: string | undefined,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() body: FinishDto,
  ) {
    return this.queue.finish(authorization, id, body.leaseId, body.outcome);
  }
}
