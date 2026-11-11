import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEmail,
  IsString,
  IsOptional,
  MaxLength,
  Matches,
  MinLength,
} from "class-validator";

import type { AuthenticatedRequest } from "../auth/auth.types";
import { JwtAccessGuard } from "../auth/jwt-access.guard";
import { UsersService } from "./users.service";
import { AllowWhenReadOnly } from "../platform/subscription-gate";

class CreateUserDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  @Matches(/^[^\p{Cc}]*$/u)
  displayName?: string;
  @IsEmail() email!: string;
  @IsString() @MinLength(12) password!: string;
  @IsArray() @ArrayMinSize(1) @IsString({ each: true }) branchIds!: string[];
  @IsArray() @ArrayMinSize(1) @IsString({ each: true }) roleIds!: string[];
}

class UpdateUserDto {
  @IsBoolean() active!: boolean;
  @IsOptional()
  @IsString()
  @MaxLength(120)
  @Matches(/^[^\p{Cc}]*$/u)
  displayName?: string;
  @IsArray() @ArrayMinSize(1) @IsString({ each: true }) branchIds!: string[];
  @IsArray() @ArrayMinSize(1) @IsString({ each: true }) roleIds!: string[];
}
class ResetPasswordDto {
  @IsString() @MinLength(12) @MaxLength(256) password!: string;
}
export class UserDisplayNameDto {
  @IsString() @MaxLength(120) @Matches(/^[^\p{Cc}]*$/u) displayName!: string;
}

@Controller("organizations/:organizationId/users")
@UseGuards(JwtAccessGuard)
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  list(
    @Param("organizationId") organizationId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.users.list(request.auth!.sub, organizationId);
  }

  @Get("create-options")
  createOptions(
    @Param("organizationId") organizationId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.users.getCreateOptions(request.auth!.sub, organizationId);
  }

  @Post()
  create(
    @Param("organizationId") organizationId: string,
    @Req() request: AuthenticatedRequest,
    @Body() body: CreateUserDto,
  ) {
    return this.users.create(
      request.auth!.sub,
      organizationId,
      body.email,
      body.password,
      body.branchIds,
      body.roleIds,
      body.displayName,
    );
  }

  @Patch(":userId/display-name")
  displayName(
    @Param("organizationId") organizationId: string,
    @Param("userId") userId: string,
    @Req() request: AuthenticatedRequest,
    @Body() body: UserDisplayNameDto,
  ) {
    return this.users.setDisplayName(
      request.auth!.sub,
      organizationId,
      userId,
      body.displayName,
    );
  }

  /** Sesiones abiertas de un usuario de la farmacia (SISTEMA-93). */
  @Get(":userId/sessions")
  sessions(
    @Param("organizationId", ParseUUIDPipe) organizationId: string,
    @Param("userId", ParseUUIDPipe) userId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.users.listarSesiones(request.auth!.sub, organizationId, userId);
  }

  /** Cierra todas las sesiones del usuario (dar de baja a un empleado). */
  @AllowWhenReadOnly()
  @Post(":userId/sessions/close-all")
  @HttpCode(200)
  closeAllSessions(
    @Param("organizationId", ParseUUIDPipe) organizationId: string,
    @Param("userId", ParseUUIDPipe) userId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.users.cerrarSesiones(request.auth!.sub, organizationId, userId);
  }

  @AllowWhenReadOnly()
  @Delete(":userId/sessions/:sessionId")
  closeSession(
    @Param("organizationId", ParseUUIDPipe) organizationId: string,
    @Param("userId", ParseUUIDPipe) userId: string,
    @Param("sessionId", ParseUUIDPipe) sessionId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.users.cerrarSesiones(
      request.auth!.sub,
      organizationId,
      userId,
      sessionId,
    );
  }

  @AllowWhenReadOnly()
  @Patch(":userId/password")
  resetPassword(
    @Param("organizationId") organizationId: string,
    @Param("userId") userId: string,
    @Req() request: AuthenticatedRequest,
    @Body() body: ResetPasswordDto,
  ) {
    return this.users.resetPassword(
      request.auth!.sub,
      organizationId,
      userId,
      body.password,
    );
  }
  @AllowWhenReadOnly()
  @Patch(":userId")
  update(
    @Param("organizationId") organizationId: string,
    @Param("userId") userId: string,
    @Req() request: AuthenticatedRequest,
    @Body() body: UpdateUserDto,
  ) {
    return this.users.update(request.auth!.sub, organizationId, userId, {
      active: body.active,
      branchIds: body.branchIds,
      roleIds: body.roleIds,
      displayName: body.displayName,
    });
  }
}
