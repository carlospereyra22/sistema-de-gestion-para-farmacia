import {
  BadRequestException,
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
  IsIn,
  IsISO8601,
  IsObject,
  IsUUID,
  Min,
  Max,
  IsString,
  MinLength,
  MaxLength,
  ValidateNested,
  validate,
} from "class-validator";
import { Type, plainToInstance } from "class-transformer";
import { BranchAccessGuard } from "../auth/branch-access.guard";
import { DecidedWhenOccurred } from "../platform/subscription-gate";
import {
  CustomerBillingDto,
  UpdateCustomerBillingDto,
} from "./customer-billing.dto";
import type { AuthenticatedRequest } from "../auth/auth.types";
import { JwtAccessGuard } from "../auth/jwt-access.guard";
import {
  PartiesService,
  type OperacionClienteSinConexion,
} from "./parties.service";
import type { OperacionProveedorSinConexion } from "./proveedor-sin-conexion";
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
/** Alta o edición de un cliente hecha sin conexión (SISTEMA-70). */
class OfflineCustomerDto {
  @IsOptional() @IsIn(["ALTA", "EDICION"]) tipo?: "ALTA" | "EDICION";
  @IsOptional() @IsUUID() customerId?: string;
  @IsUUID() clientOperationId!: string;
  @IsISO8601({ strict: true }) occurredAt!: string;
  @IsUUID() deviceId!: string;
  /** El mismo cuerpo que con conexión: el del alta o el de la edición. */
  @IsObject() cuerpo!: Record<string, unknown>;
}
class SignedOfflineCustomerDto {
  @IsUUID() actorId!: string;
  @IsUUID() deviceId!: string;
  @IsString() @MaxLength(20000) payload!: string;
  @IsString() @MaxLength(200) signature!: string;
}
/** Valida la operación y su cuerpo con el DTO de su tipo, como con conexión. */
async function operacionDeCliente(
  datos: unknown,
): Promise<OperacionClienteSinConexion> {
  const opciones = { whitelist: true, forbidNonWhitelisted: true };
  const op = plainToInstance(OfflineCustomerDto, datos ?? {});
  const edicion = op.tipo === "EDICION";
  const DTO: new () => object = edicion
    ? UpdateCustomerBillingDto
    : CreateCustomerDto;
  const cuerpo: object = plainToInstance(DTO, op.cuerpo ?? {});
  if (
    (await validate(op, opciones)).length ||
    (await validate(cuerpo, opciones)).length ||
    (edicion && !op.customerId)
  )
    throw new BadRequestException(
      "El cliente guardado sin conexión tiene datos inválidos.",
    );
  return edicion
    ? {
        tipo: "EDICION",
        customerId: op.customerId!,
        clientOperationId: op.clientOperationId,
        occurredAt: op.occurredAt,
        deviceId: op.deviceId,
        cuerpo: cuerpo as UpdateCustomerBillingDto,
      }
    : {
        tipo: "ALTA",
        clientOperationId: op.clientOperationId,
        occurredAt: op.occurredAt,
        deviceId: op.deviceId,
        cuerpo: cuerpo as CreateCustomerDto,
      };
}

@Controller("organizations/:organizationId/branches/:branchId/customers")
@UseGuards(JwtAccessGuard, BranchAccessGuard)
export class PartiesOfflineController {
  constructor(private readonly parties: PartiesService) {}
  /** Cliente dado de alta o editado sin conexión, que la PC manda al volver. */
  @DecidedWhenOccurred()
  @Post("offline")
  async offline(
    @Param("organizationId") org: string,
    @Param("branchId") branch: string,
    @Req() req: AuthenticatedRequest,
    @Body() body: OfflineCustomerDto,
  ) {
    return this.parties.customerOffline(
      req.auth!.sub,
      org,
      branch,
      await operacionDeCliente(body),
    );
  }
  /** El de otro usuario de esta PC: queda a nombre de quien lo hizo. */
  @DecidedWhenOccurred()
  @Post("offline/firmada")
  async offlineSigned(
    @Param("organizationId") org: string,
    @Param("branchId") branch: string,
    @Req() req: AuthenticatedRequest,
    @Body() body: SignedOfflineCustomerDto,
  ) {
    let datos: unknown;
    try {
      datos = JSON.parse(body.payload);
    } catch {
      throw new BadRequestException("La operación firmada no se puede leer.");
    }
    const op = await operacionDeCliente(datos);
    if (op.deviceId !== body.deviceId)
      throw new BadRequestException("La operación no corresponde a esa PC.");
    return this.parties.customerOfflineSigned(
      req.auth!.sub,
      org,
      branch,
      body,
      op,
    );
  }
}

// --- Proveedores sin conexión (SISTEMA-73) ---
/** Edición hecha sin conexión: sólo los campos que se cambiaron. */
class SupplierEditOfflineDto extends SupplierProfileDto {
  @IsOptional() @IsBoolean() accountEnabled?: boolean;
  @IsOptional() @IsInt() @Min(0) @Max(3650) accountTermDays?: number | null;
}
class SupplierStateOfflineDto {
  @IsBoolean() active!: boolean;
}
const CUERPO_PROVEEDOR = {
  ALTA: CreateSupplierDto,
  EDICION: SupplierEditOfflineDto,
  ESTADO: SupplierStateOfflineDto,
} as const;
class OfflineSupplierDto {
  @IsIn(Object.keys(CUERPO_PROVEEDOR))
  tipo!: OperacionProveedorSinConexion["tipo"];
  @IsOptional() @IsUUID() supplierId?: string;
  @IsUUID() clientOperationId!: string;
  @IsISO8601({ strict: true }) occurredAt!: string;
  @IsUUID() deviceId!: string;
  /** El mismo cuerpo que con conexión, en el formato de su tipo. */
  @IsObject() cuerpo!: Record<string, unknown>;
}
/** Valida la operación y su cuerpo con el DTO de su tipo. */
async function operacionDeProveedor(
  datos: unknown,
): Promise<OperacionProveedorSinConexion> {
  const opciones = { whitelist: true, forbidNonWhitelisted: true };
  const op = plainToInstance(OfflineSupplierDto, datos ?? {});
  const DTO = CUERPO_PROVEEDOR[op.tipo] as (new () => object) | undefined;
  const cuerpo = DTO ? plainToInstance(DTO, op.cuerpo ?? {}) : null;
  if (
    (await validate(op, opciones)).length ||
    !cuerpo ||
    (await validate(cuerpo, opciones)).length ||
    (op.tipo !== "ALTA" && !op.supplierId)
  )
    throw new BadRequestException(
      "El proveedor guardado sin conexión tiene datos inválidos.",
    );
  return { ...op, cuerpo } as unknown as OperacionProveedorSinConexion;
}

@Controller("organizations/:organizationId/branches/:branchId/suppliers")
@UseGuards(JwtAccessGuard, BranchAccessGuard)
export class SuppliersOfflineController {
  constructor(private readonly parties: PartiesService) {}
  /** Proveedor dado de alta, editado, dado de baja o restaurado sin conexión. */
  @DecidedWhenOccurred()
  @Post("offline")
  async offline(
    @Param("organizationId") org: string,
    @Param("branchId") branch: string,
    @Req() req: AuthenticatedRequest,
    @Body() body: OfflineSupplierDto,
  ) {
    return this.parties.supplierOffline(
      req.auth!.sub,
      org,
      branch,
      await operacionDeProveedor(body),
    );
  }
  /** El de otro usuario de esta PC: queda a nombre de quien lo hizo. */
  @DecidedWhenOccurred()
  @Post("offline/firmada")
  async offlineSigned(
    @Param("organizationId") org: string,
    @Param("branchId") branch: string,
    @Req() req: AuthenticatedRequest,
    @Body() body: SignedOfflineCustomerDto,
  ) {
    let datos: unknown;
    try {
      datos = JSON.parse(body.payload);
    } catch {
      throw new BadRequestException("La operación firmada no se puede leer.");
    }
    const op = await operacionDeProveedor(datos);
    if (op.deviceId !== body.deviceId)
      throw new BadRequestException("La operación no corresponde a esa PC.");
    return this.parties.supplierOfflineSigned(
      req.auth!.sub,
      org,
      branch,
      body,
      op,
    );
  }
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
