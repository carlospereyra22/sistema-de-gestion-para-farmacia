import {
  Body,
  Controller,
  Get,
  Param,
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
  @IsArray() @ArrayMinSize(1) @IsString({ each: true }) branchIds!: string[];
  @IsArray() @ArrayMinSize(1) @IsString({ each: true }) roleIds!: string[];
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

  @Patch(":userId")
  update(
    @Param("organizationId") organizationId: string,
    @Param("userId") userId: string,
    @Req() request: AuthenticatedRequest,
    @Body() body: UpdateUserDto,
  ) {
    return this.users.update(
      request.auth!.sub,
      organizationId,
      userId,
      body.active,
      body.branchIds,
      body.roleIds,
    );
  }
}
