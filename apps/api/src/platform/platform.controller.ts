import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import { IsString, Matches } from "class-validator";

import type { AuthenticatedRequest } from "../auth/auth.types";
import { PlatformAdminGuard } from "./platform-admin.guard";
import { PlatformIdentityService } from "./platform-identity.service";
import { PlatformVerificationOptional } from "./platform-verification-optional.decorator";

class PlatformCodeDto {
  @IsString()
  @Matches(/^\d{6}$/, { message: "Ingresá los 6 dígitos del código." })
  code!: string;
}

@Controller("platform")
@UseGuards(PlatformAdminGuard)
export class PlatformController {
  constructor(private readonly identity: PlatformIdentityService) {}

  @Get("session")
  @PlatformVerificationOptional()
  session(@Req() request: AuthenticatedRequest) {
    const { sub, sessionId } = request.auth!;
    return this.identity.session(sub, sessionId);
  }

  @Post("totp/enroll")
  @HttpCode(200)
  @PlatformVerificationOptional()
  enroll(@Req() request: AuthenticatedRequest) {
    const { sub, email } = request.auth!;
    return this.identity.enroll(sub, email);
  }

  @Post("totp/confirm")
  @HttpCode(200)
  @PlatformVerificationOptional()
  confirm(@Req() request: AuthenticatedRequest, @Body() body: PlatformCodeDto) {
    const { sub, sessionId } = request.auth!;
    return this.identity.confirm(sub, sessionId, body.code);
  }

  @Post("totp/verify")
  @HttpCode(200)
  @PlatformVerificationOptional()
  verify(@Req() request: AuthenticatedRequest, @Body() body: PlatformCodeDto) {
    const { sub, sessionId } = request.auth!;
    return this.identity.verify(sub, sessionId, body.code);
  }

  @Get("audit")
  audit() {
    return this.identity.audit();
  }
}
