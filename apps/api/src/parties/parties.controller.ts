import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Patch,
  Delete,
  ParseUUIDPipe,
  Req,
  UseGuards,
} from "@nestjs/common";
import {
  IsOptional,
  IsBoolean,
  IsInt,
  Min,
  Max,
  IsString,
  MinLength,
  MaxLength,
  ValidateNested,
} from "class-validator";
import { Type } from "class-transformer";
import {
  CustomerBillingDto,
  UpdateCustomerBillingDto,
} from "./customer-billing.dto";
import type { AuthenticatedRequest } from "../auth/auth.types";
import { JwtAccessGuard } from "../auth/jwt-access.guard";
import { PartiesService } from "./parties.service";
class CreatePartyDto {
  @IsString() @MinLength(2) name!: string;
  @IsOptional() @IsString() document?: string;
  @IsOptional() @IsString() priceListId?: string;
}
class CreateCustomerDto extends CreatePartyDto {
  @IsOptional()
  @ValidateNested()
  @Type(() => CustomerBillingDto)
  billing?: CustomerBillingDto;
}
class SupplierProfileDto {
  @IsOptional() @IsString() @MaxLength(160) name?: string;
  @IsOptional() @IsString() @MaxLength(60) phone?: string;
  @IsOptional() @IsString() @MaxLength(160) email?: string;
  @IsOptional() @IsString() @MaxLength(160) contactName?: string;
  @IsOptional() @IsString() @MaxLength(250) address?: string;
  @IsOptional() @IsString() @MaxLength(1000) notes?: string;
}
class SupplierTermsDto extends SupplierProfileDto {
  @IsBoolean() accountEnabled!: boolean;
  @IsOptional() @IsInt() @Min(0) @Max(3650) accountTermDays?: number | null;
  @IsOptional() @IsString() expectedUpdatedAt?: string;
}
class CreateSupplierDto extends SupplierProfileDto {
  @IsString() @MinLength(2) @MaxLength(160) declare name: string;
  @IsOptional() @IsString() document?: string;
  @IsOptional() @IsBoolean() accountEnabled?: boolean;
  @IsOptional() @IsInt() @Min(0) @Max(3650) accountTermDays?: number | null;
}
@Controller("organizations/:organizationId")
@UseGuards(JwtAccessGuard)
export class PartiesController {
  constructor(private readonly parties: PartiesService) {}
  @Get("customers") customers(
    @Param("organizationId") id: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.parties.list(req.auth!.sub, id, "customers");
  }
  @Get("suppliers") suppliers(
    @Param("organizationId") id: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.parties.list(req.auth!.sub, id, "suppliers");
  }
  @Post("customers") createCustomer(
    @Param("organizationId") id: string,
    @Req() req: AuthenticatedRequest,
    @Body() body: CreateCustomerDto,
  ) {
    return this.parties.create(
      req.auth!.sub,
      id,
      "customers",
      body.name,
      body.document,
      body.priceListId,
      body.billing,
    );
  }
  @Post("suppliers") createSupplier(
    @Param("organizationId") id: string,
    @Req() req: AuthenticatedRequest,
    @Body() body: CreateSupplierDto,
  ) {
    return this.parties.create(
      req.auth!.sub,
      id,
      "suppliers",
      body.name,
      body.document,
      undefined,
      {},
      {
        accountEnabled: body.accountEnabled ?? false,
        accountTermDays: body.accountTermDays ?? null,
      },
      body,
    );
  }
  @Patch("suppliers/:supplierId/terms") updateSupplierTerms(
    @Param("organizationId") id: string,
    @Param("supplierId", ParseUUIDPipe) supplierId: string,
    @Req() req: AuthenticatedRequest,
    @Body() body: SupplierTermsDto,
  ) {
    return this.parties.updateSupplierTerms(
      req.auth!.sub,
      id,
      supplierId,
      body,
    );
  }
  @Patch("customers/:customerId/billing") updateBilling(
    @Param("organizationId") id: string,
    @Param("customerId", ParseUUIDPipe) customerId: string,
    @Req() req: AuthenticatedRequest,
    @Body() body: UpdateCustomerBillingDto,
  ) {
    return this.parties.updateBilling(req.auth!.sub, id, customerId, body);
  }
  @Delete("suppliers/:supplierId") archiveSupplier(
    @Param("organizationId") id: string,
    @Param("supplierId", ParseUUIDPipe) supplierId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.parties.setSupplierActive(req.auth!.sub, id, supplierId, false);
  }
  @Post("suppliers/:supplierId/restore") restoreSupplier(
    @Param("organizationId") id: string,
    @Param("supplierId", ParseUUIDPipe) supplierId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.parties.setSupplierActive(req.auth!.sub, id, supplierId, true);
  }
  @Delete("customers/:customerId") archiveCustomer(
    @Param("organizationId") id: string,
    @Param("customerId", ParseUUIDPipe) customerId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.parties.setCustomerActive(req.auth!.sub, id, customerId, false);
  }
  @Post("customers/:customerId/restore") restoreCustomer(
    @Param("organizationId") id: string,
    @Param("customerId", ParseUUIDPipe) customerId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.parties.setCustomerActive(req.auth!.sub, id, customerId, true);
  }
}
