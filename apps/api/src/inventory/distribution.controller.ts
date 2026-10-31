import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from "class-validator";
import { JwtAccessGuard } from "../auth/jwt-access.guard";
import { BranchAccessGuard } from "../auth/branch-access.guard";
import type { AuthenticatedRequest } from "../auth/auth.types";
import { DistributionService } from "./distribution.service";

class DistributionItemDto {
  @IsUUID() lotId!: string;
  @IsInt() @Min(1) @Max(2147483647) quantity!: number;
}
class DistributionDto {
  @IsUUID() requestId!: string;
  @IsString() @MinLength(3) @MaxLength(150) destination!: string;
  @IsString() @MinLength(3) @MaxLength(300) reason!: string;
  @IsBoolean() confirmed!: boolean;
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => DistributionItemDto)
  items!: DistributionItemDto[];
}
class ReversalDto {
  @IsString() @MinLength(3) @MaxLength(300) reason!: string;
  @IsBoolean() confirmed!: boolean;
}
@Controller(
  "organizations/:organizationId/branches/:branchId/inventory/distributions",
)
@UseGuards(JwtAccessGuard, BranchAccessGuard)
export class DistributionController {
  constructor(private readonly service: DistributionService) {}
  @Get() list(
    @Req() req: AuthenticatedRequest,
    @Param("organizationId") org: string,
    @Param("branchId") branch: string,
  ) {
    return this.service.list(req.auth!.sub, org, branch);
  }
  @Post() create(
    @Req() req: AuthenticatedRequest,
    @Param("organizationId") org: string,
    @Param("branchId") branch: string,
    @Body() body: DistributionDto,
  ) {
    return this.service.create(req.auth!.sub, org, branch, body);
  }
  @Post(":id/reverse") reverse(
    @Req() req: AuthenticatedRequest,
    @Param("organizationId") org: string,
    @Param("branchId") branch: string,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() body: ReversalDto,
  ) {
    return this.service.reverse(
      req.auth!.sub,
      org,
      branch,
      id,
      body.reason,
      body.confirmed,
    );
  }
}
