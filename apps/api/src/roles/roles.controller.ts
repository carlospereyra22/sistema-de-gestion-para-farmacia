import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import {
  ArrayMinSize,
  IsArray,
  IsString,
  Matches,
  MinLength,
} from "class-validator";

import type { AuthenticatedRequest } from "../auth/auth.types";
import { JwtAccessGuard } from "../auth/jwt-access.guard";
import { RolesService } from "./roles.service";

class CreateRoleDto {
  @IsString() @MinLength(2) name!: string;
  @IsString() @Matches(/^[A-Z][A-Z0-9_]{1,31}$/) code!: string;
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  permissionCodes!: string[];
}

@Controller("organizations/:organizationId/roles")
@UseGuards(JwtAccessGuard)
export class RolesController {
  constructor(private readonly roles: RolesService) {}

  @Get()
  list(
    @Param("organizationId") organizationId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.roles.list(request.auth!.sub, organizationId);
  }

  @Post()
  create(
    @Param("organizationId") organizationId: string,
    @Req() request: AuthenticatedRequest,
    @Body() body: CreateRoleDto,
  ) {
    return this.roles.create(
      request.auth!.sub,
      organizationId,
      body.name,
      body.code,
      body.permissionCodes,
    );
  }
}
