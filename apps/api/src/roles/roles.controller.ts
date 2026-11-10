import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from "class-validator";

import type { AuthenticatedRequest } from "../auth/auth.types";
import { JwtAccessGuard } from "../auth/jwt-access.guard";
import { RolesService } from "./roles.service";

class CreateRoleDto {
  @IsString() @MinLength(2) @MaxLength(60) name!: string;
  @IsOptional() @IsString() @MaxLength(300) description?: string;
  @IsString() @Matches(/^[A-Z][A-Z0-9_]{1,31}$/) code!: string;
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  permissionCodes!: string[];
}

class UpdateRoleDto {
  @IsOptional() @IsString() @MinLength(2) @MaxLength(60) name?: string;
  @IsOptional() @IsString() @MaxLength(300) description?: string;
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @IsString({ each: true })
  permissionCodes?: string[];
}

class UpdateRolePermissionsDto {
  @IsArray()
  @ArrayMaxSize(100)
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
      body.description,
    );
  }

  @Patch(":roleId")
  update(
    @Param("organizationId") organizationId: string,
    @Param("roleId", ParseUUIDPipe) roleId: string,
    @Req() request: AuthenticatedRequest,
    @Body() body: UpdateRoleDto,
  ) {
    return this.roles.update(request.auth!.sub, organizationId, roleId, body);
  }

  @Patch(":roleId/permissions")
  updatePermissions(
    @Param("organizationId") organizationId: string,
    @Param("roleId", ParseUUIDPipe) roleId: string,
    @Req() request: AuthenticatedRequest,
    @Body() body: UpdateRolePermissionsDto,
  ) {
    return this.roles.updatePermissions(
      request.auth!.sub,
      organizationId,
      roleId,
      body.permissionCodes,
    );
  }
}
