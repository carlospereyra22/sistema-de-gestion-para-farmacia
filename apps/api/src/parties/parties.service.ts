import {
  ForbiddenException,
  ConflictException,
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { Prisma } from "@prisma/client";
import { supplierProfile, type SupplierProfile } from "./supplier-profile";
import {
  billingData,
  CustomerBillingDto,
  UpdateCustomerBillingDto,
} from "./customer-billing.dto";
import {
  assertCustomerDocumentAvailable,
  normalizeCustomerDocument,
} from "./customer-identity";
import {
  contextoSinConexion,
  guardarOperacionSinConexion,
  operacionYaRegistrada,
} from "../common/offline/registro-sin-conexion";
import { verificarOperacionDeOtro } from "../sales/operacion-firmada";
import {
  KIND_PROVEEDOR,
  camposPisados,
  type OperacionProveedorSinConexion,
} from "./proveedor-sin-conexion";

/** Alta o edición de cliente hecha sin conexión (SISTEMA-70). */
export type OperacionClienteSinConexion = {
  clientOperationId: string;
  occurredAt: string;
  deviceId: string;
} & (
  | {
      tipo: "ALTA";
      cuerpo: {
        name: string;
        document?: string;
        priceListId?: string;
        billing?: CustomerBillingDto;
      };
    }
  | { tipo: "EDICION"; customerId: string; cuerpo: UpdateCustomerBillingDto }
);

@Injectable()
export class PartiesService {
  constructor(private readonly prisma: PrismaService) {}
  async list(
    actorId: string,
    organizationId: string,
    type: "customers" | "suppliers",
  ) {
    await this.assert(actorId, organizationId, "PARTY_READ");
    return type === "customers"
      ? this.prisma.customer
          .findMany({
            where: { organizationId },
            orderBy: { name: "asc" },
          })
          .then((customers) =>
            customers.map((customer) => ({
              ...customer,
              creditLimitMinor: customer.creditLimitMinor?.toString() ?? null,
            })),
          )
      : this.prisma.supplier.findMany({
          where: { organizationId },
          orderBy: { name: "asc" },
        });
  }
  async create(
    actorId: string,
    organizationId: string,
    type: "customers" | "suppliers",
    name: string,
    document?: string,
    priceListId?: string,
    billing: CustomerBillingDto = {},
    terms = { accountEnabled: false, accountTermDays: null as number | null },
    profile: SupplierProfile = {},
  ) {
    await this.assert(actorId, organizationId, "PARTY_MANAGE");
    if (
      type === "customers" &&
      priceListId &&
      !(await this.prisma.priceList.findFirst({
        where: { id: priceListId, organizationId, active: true },
      }))
    )
      throw new NotFoundException("La lista de precios no está disponible.");
    return type === "customers"
      ? this.prisma.$transaction(async (tx) => {
          await assertCustomerDocumentAvailable(tx, organizationId, [
            document,
            billing?.billingTaxId,
          ]);
          const customer = await tx.customer.create({
            data: {
              organizationId,
              name: name.trim(),
              document: document?.trim(),
              priceListId,
              ...billingData(billing ?? {}),
            },
          });
          await tx.auditLog.create({
            data: {
              organizationId,
              actorId,
              entityType: "CUSTOMER",
              entityId: customer.id,
              action: "CUSTOMER_CREATED",
            },
          });
          return {
            ...customer,
            creditLimitMinor: customer.creditLimitMinor?.toString() ?? null,
          };
        })
      : this.prisma.$transaction(async (tx) => {
          this.validateSupplierTerms(terms);
          const fields = supplierProfile({ ...profile, name });
          const supplier = await tx.supplier.create({
            data: {
              organizationId,
              name: name.trim(),
              taxId: document?.trim(),
              ...terms,
              ...fields,
            },
          });
          await tx.auditLog.create({
            data: {
              organizationId,
              actorId,
              entityType: "SUPPLIER",
              entityId: supplier.id,
              action: "SUPPLIER_CREATED",
              after: { ...terms, ...fields },
            },
          });
          return supplier;
        });
  }
  /**
   * Cliente dado de alta sin conexión (SISTEMA-70). Su id es la clave de la
   * operación en la PC, así las ventas y cobros que se le hicieron sin conexión
   * lo encuentran. Si repite un DNI/CUIT se crea igual y queda aviso para
   * unificar; una lista de precios que ya no está se deja de lado con aviso.
   */
  async createCustomerOffline(
    actorId: string,
    organizationId: string,
    branchId: string,
    op: {
      clientOperationId: string;
      occurredAt: string;
      deviceId: string;
      cuerpo: {
        name: string;
        document?: string;
        priceListId?: string;
        billing?: CustomerBillingDto;
      };
    },
    reenviadaPor?: string,
  ) {
    await this.assert(actorId, organizationId, "PARTY_MANAGE");
    const contexto = await contextoSinConexion(this.prisma, organizationId, {
      operationId: op.clientOperationId,
      kind: "CUSTOMER_CREATE",
      occurredAt: op.occurredAt,
      deviceId: op.deviceId,
      negocio: op.cuerpo,
      reenviadaPor,
    });
    const { name, document, billing = {} } = op.cuerpo;
    return this.prisma.$transaction(async (tx) => {
      const registrada = await operacionYaRegistrada(
        tx,
        organizationId,
        contexto,
      );
      if (registrada) return registrada;
      if (await tx.customer.findUnique({ where: { id: op.clientOperationId } }))
        throw new ConflictException("Ese cliente ya existe con otros datos.");
      let priceListId = op.cuerpo.priceListId;
      if (
        priceListId &&
        !(await tx.priceList.findFirst({
          where: { id: priceListId, organizationId, active: true },
        }))
      ) {
        contexto.avisos.push({
          kind: "LISTA_INACTIVA",
          detail: {
            cliente: name.trim(),
            motivo:
              "La lista de precios del cliente ya no está activa: se creó sin lista.",
          },
        });
        priceListId = undefined;
      }
      try {
        await assertCustomerDocumentAvailable(tx, organizationId, [
          document,
          billing.billingTaxId,
        ]);
      } catch (cause) {
        if (!(cause instanceof ConflictException)) throw cause;
        contexto.avisos.push({
          kind: "CLIENTE_DUPLICADO",
          detail: {
            cliente: name.trim(),
            motivo: `${cause.message} Se creó igual porque se usó sin conexión: unificalos.`,
          },
        });
      }
      const customer = await tx.customer.create({
        data: {
          id: op.clientOperationId,
          createdAt: contexto.occurredAt,
          organizationId,
          name: name.trim(),
          document: document?.trim(),
          priceListId,
          ...billingData(billing),
        },
      });
      await tx.auditLog.create({
        data: {
          organizationId,
          branchId,
          actorId,
          entityType: "CUSTOMER",
          entityId: customer.id,
          action: "CUSTOMER_CREATED",
          after: { origen: "SIN_CONEXION", deviceId: op.deviceId },
        },
      });
      return guardarOperacionSinConexion(tx, contexto, {
        organizationId,
        branchId,
        actorId,
        entityId: customer.id,
      });
    });
  }
  /** Alta o edición de cliente hecha sin conexión (SISTEMA-70). */
  customerOffline(
    actorId: string,
    organizationId: string,
    branchId: string,
    op: OperacionClienteSinConexion,
    reenviadaPor?: string,
  ) {
    return op.tipo === "EDICION"
      ? this.updateCustomerOffline(
          actorId,
          organizationId,
          branchId,
          op,
          reenviadaPor,
        )
      : this.createCustomerOffline(
          actorId,
          organizationId,
          branchId,
          op,
          reenviadaPor,
        );
  }
  /**
   * Edición de un cliente hecha sin conexión: se aplican los campos que se
   * cambiaron. Si otra PC cambió alguno de esos campos después, queda ese
   * cambio (el más reciente) y se avisa. Un DNI/CUIT repetido o una lista que
   * ya no está se avisan, como en el alta.
   */
  async updateCustomerOffline(
    actorId: string,
    organizationId: string,
    branchId: string,
    op: Extract<OperacionClienteSinConexion, { tipo: "EDICION" }>,
    reenviadaPor?: string,
  ) {
    await this.assert(actorId, organizationId, "PARTY_MANAGE");
    const input = op.cuerpo;
    if (
      input.name !== undefined &&
      (input.name.trim().length < 2 || input.name.trim().length > 160)
    )
      throw new BadRequestException(
        "El nombre o razón social debe tener entre 2 y 160 caracteres.",
      );
    const contexto = await contextoSinConexion(this.prisma, organizationId, {
      operationId: op.clientOperationId,
      kind: "CUSTOMER_UPDATE",
      occurredAt: op.occurredAt,
      deviceId: op.deviceId,
      negocio: { customerId: op.customerId, cuerpo: input },
      reenviadaPor,
    });
    return this.prisma.$transaction(async (tx) => {
      const registrada = await operacionYaRegistrada(
        tx,
        organizationId,
        contexto,
      );
      if (registrada) return registrada;
      await tx.$queryRaw`SELECT id FROM "Organization" WHERE id = ${organizationId}::uuid FOR UPDATE`;
      const customer = await tx.customer.findFirst({
        where: { id: op.customerId, organizationId },
      });
      if (!customer)
        throw new NotFoundException(
          "El cliente no está disponible en esta organización.",
        );
      const pedidos: Record<string, string | null> = {
        ...(input.priceListId !== undefined
          ? { priceListId: input.priceListId || null }
          : {}),
        ...billingData(input),
        ...(input.name !== undefined ? { name: input.name.trim() } : {}),
      };
      // Campos que otra PC cambió después de esta edición: quedan como están.
      const registros = await tx.auditLog.findMany({
        where: {
          organizationId,
          entityType: "CUSTOMER",
          entityId: op.customerId,
          action: "CUSTOMER_BILLING_UPDATED",
        },
        select: { createdAt: true, after: true },
      });
      const pisados = new Set<string>();
      for (const registro of registros) {
        const after = registro.after;
        if (!after || typeof after !== "object" || Array.isArray(after))
          continue;
        const cuando =
          typeof after.occurredAt === "string"
            ? new Date(after.occurredAt)
            : registro.createdAt;
        if (cuando <= contexto.occurredAt || !Array.isArray(after.fields))
          continue;
        for (const campo of after.fields)
          if (typeof campo === "string" && campo in pedidos) pisados.add(campo);
      }
      for (const campo of pisados) delete pedidos[campo];
      if (pisados.size)
        contexto.avisos.push({
          kind: "CONFIGURACION_PISADA",
          detail: {
            cliente: customer.name,
            motivo: `Otra PC cambió después: ${[...pisados].join(", ")}. Quedó ese cambio, que es el más reciente.`,
          },
        });
      const lista = pedidos.priceListId;
      if (
        lista &&
        !(await tx.priceList.findFirst({
          where: { id: lista, organizationId, active: true },
        }))
      ) {
        delete pedidos.priceListId;
        contexto.avisos.push({
          kind: "LISTA_INACTIVA",
          detail: {
            cliente: customer.name,
            motivo:
              "La lista de precios elegida ya no está activa: el cliente quedó con la que tenía.",
          },
        });
      }
      const cuit = pedidos.billingTaxId;
      if (
        cuit &&
        normalizeCustomerDocument(cuit) !==
          normalizeCustomerDocument(customer.billingTaxId)
      )
        try {
          await assertCustomerDocumentAvailable(
            tx,
            organizationId,
            [cuit],
            op.customerId,
          );
        } catch (cause) {
          if (!(cause instanceof ConflictException)) throw cause;
          contexto.avisos.push({
            kind: "CLIENTE_DUPLICADO",
            detail: {
              cliente: customer.name,
              motivo: `${cause.message} Se guardó igual porque se cargó sin conexión: unificalos.`,
            },
          });
        }
      if (Object.keys(pedidos).length) {
        await tx.customer.update({
          where: { id: op.customerId, organizationId },
          data: pedidos,
        });
        await tx.auditLog.create({
          data: {
            organizationId,
            branchId,
            actorId,
            entityType: "CUSTOMER",
            entityId: op.customerId,
            action: "CUSTOMER_BILLING_UPDATED",
            after: {
              fields: Object.keys(pedidos),
              occurredAt: contexto.occurredAt.toISOString(),
              origen: "SIN_CONEXION",
              deviceId: op.deviceId,
            },
          },
        });
      }
      return guardarOperacionSinConexion(tx, contexto, {
        organizationId,
        branchId,
        actorId,
        entityId: op.customerId,
      });
    });
  }
  async customerOfflineSigned(
    senderId: string,
    organizationId: string,
    branchId: string,
    firma: {
      actorId: string;
      deviceId: string;
      payload: string;
      signature: string;
    },
    op: OperacionClienteSinConexion,
  ) {
    if (firma.actorId === senderId)
      return this.customerOffline(senderId, organizationId, branchId, op);
    await verificarOperacionDeOtro(this.prisma, {
      ...firma,
      senderId,
      organizationId,
      branchId,
    });
    try {
      await this.assert(firma.actorId, organizationId, "PARTY_MANAGE");
    } catch {
      throw new BadRequestException(
        "Quien cargó el cliente ya no puede manejar clientes. Revisalo a mano.",
      );
    }
    return this.customerOffline(
      firma.actorId,
      organizationId,
      branchId,
      op,
      senderId,
    );
  }
  /**
   * Alta, edición, baja o restauración de un proveedor hecha sin conexión
   * (SISTEMA-73), que la PC manda al volver. Se registra una sola vez, con su
   * hora real y en una sola transacción con sus avisos.
   */
  async supplierOffline(
    actorId: string,
    organizationId: string,
    branchId: string,
    op: OperacionProveedorSinConexion,
    reenviadaPor?: string,
  ) {
    await this.assert(actorId, organizationId, "PARTY_MANAGE");
    if (op.tipo !== "ESTADO") this.validateSupplierTerms(op.cuerpo, true);
    const contexto = await contextoSinConexion(this.prisma, organizationId, {
      operationId: op.clientOperationId,
      kind: KIND_PROVEEDOR[op.tipo],
      occurredAt: op.occurredAt,
      deviceId: op.deviceId,
      negocio:
        op.tipo === "ALTA"
          ? { tipo: op.tipo, cuerpo: op.cuerpo }
          : { tipo: op.tipo, supplierId: op.supplierId, cuerpo: op.cuerpo },
      reenviadaPor,
    });
    const marca = {
      origen: "SIN_CONEXION",
      deviceId: op.deviceId,
      occurredAt: contexto.occurredAt.toISOString(),
    };
    return this.prisma.$transaction(async (tx) => {
      const registrada = await operacionYaRegistrada(
        tx,
        organizationId,
        contexto,
      );
      if (registrada) return registrada;
      let entityId: string;
      if (op.tipo === "ALTA") {
        // Su id es la clave de la PC: las compras y deudas hechas sin conexión
        // con este proveedor lo encuentran.
        if (
          await tx.supplier.findUnique({ where: { id: op.clientOperationId } })
        )
          throw new ConflictException(
            "Ese proveedor ya existe con otros datos.",
          );
        const { name, document, accountEnabled, accountTermDays, ...perfil } =
          op.cuerpo;
        const terms = {
          accountEnabled: accountEnabled ?? false,
          accountTermDays: accountEnabled ? (accountTermDays ?? null) : null,
        };
        const fields = supplierProfile({ ...perfil, name });
        const supplier = await tx.supplier.create({
          data: {
            id: op.clientOperationId,
            createdAt: contexto.occurredAt,
            organizationId,
            name: name.trim(),
            taxId: document?.trim(),
            ...terms,
            ...fields,
          },
        });
        await tx.auditLog.create({
          data: {
            organizationId,
            branchId,
            actorId,
            entityType: "SUPPLIER",
            entityId: supplier.id,
            action: "SUPPLIER_CREATED",
            after: { ...terms, ...fields, ...marca },
          },
        });
        entityId = supplier.id;
      } else {
        await tx.$queryRaw`SELECT id FROM "Supplier" WHERE id=${op.supplierId}::uuid AND "organizationId"=${organizationId}::uuid FOR UPDATE`;
        const supplier = await tx.supplier.findFirst({
          where: { id: op.supplierId, organizationId },
        });
        if (!supplier)
          throw new NotFoundException(
            "El proveedor no está disponible en esta organización.",
          );
        entityId = supplier.id;
        const registros = await tx.auditLog.findMany({
          where: {
            organizationId,
            entityType: "SUPPLIER",
            entityId: supplier.id,
            action: {
              in:
                op.tipo === "ESTADO"
                  ? ["SUPPLIER_ARCHIVED", "SUPPLIER_RESTORED"]
                  : ["SUPPLIER_TERMS_UPDATED"],
            },
          },
          select: { createdAt: true, before: true, after: true },
        });
        if (op.tipo === "ESTADO") {
          const { active } = op.cuerpo;
          if (camposPisados(registros, contexto.occurredAt, ["active"]).length)
            contexto.avisos.push({
              kind: "CONFIGURACION_PISADA",
              detail: {
                proveedor: supplier.name,
                motivo: `Otra PC ${supplier.active ? "restauró" : "dio de baja"} este proveedor después: quedó ese cambio, que es el más reciente.`,
              },
            });
          else if (supplier.active !== active) {
            await tx.supplier.update({
              where: { id: supplier.id, organizationId },
              data: { active },
            });
            await tx.auditLog.create({
              data: {
                organizationId,
                branchId,
                actorId,
                entityType: "SUPPLIER",
                entityId: supplier.id,
                action: active ? "SUPPLIER_RESTORED" : "SUPPLIER_ARCHIVED",
                before: { active: supplier.active },
                after: { active, ...marca },
              },
            });
          }
        } else {
          const { accountEnabled, accountTermDays, ...perfil } = op.cuerpo;
          const pedidos: Record<string, string | number | boolean | null> = {
            ...supplierProfile(perfil),
            ...(accountEnabled !== undefined ? { accountEnabled } : {}),
            ...(accountTermDays !== undefined ? { accountTermDays } : {}),
          };
          const pisados = camposPisados(
            registros,
            contexto.occurredAt,
            Object.keys(pedidos),
          );
          for (const campo of pisados) delete pedidos[campo];
          if (pisados.length)
            contexto.avisos.push({
              kind: "CONFIGURACION_PISADA",
              detail: {
                proveedor: supplier.name,
                motivo: `Otra PC cambió después: ${pisados.join(", ")}. Quedó ese cambio, que es el más reciente.`,
              },
            });
          // Sin cuenta corriente no hay plazo, como con conexión.
          const habilitada =
            typeof pedidos.accountEnabled === "boolean"
              ? pedidos.accountEnabled
              : supplier.accountEnabled;
          if (!habilitada && "accountEnabled" in pedidos)
            pedidos.accountTermDays = null;
          if (!habilitada && "accountTermDays" in pedidos)
            pedidos.accountTermDays = null;
          if (!supplier.active)
            contexto.avisos.push({
              kind: "PROVEEDOR_INACTIVO",
              detail: {
                proveedor: supplier.name,
                motivo:
                  "El proveedor estaba dado de baja cuando llegó la edición: se guardó igual.",
              },
            });
          if (Object.keys(pedidos).length) {
            const before = Object.fromEntries(
              Object.keys(pedidos).map((campo) => [
                campo,
                (supplier as Record<string, unknown>)[campo] ?? null,
              ]),
            ) as Prisma.InputJsonObject;
            await tx.supplier.update({
              where: { id: supplier.id, organizationId },
              data: pedidos as Prisma.SupplierUpdateInput,
            });
            await tx.auditLog.create({
              data: {
                organizationId,
                branchId,
                actorId,
                entityType: "SUPPLIER",
                entityId: supplier.id,
                action: "SUPPLIER_TERMS_UPDATED",
                before,
                after: { ...pedidos, fields: Object.keys(pedidos), ...marca },
              },
            });
          }
        }
      }
      return guardarOperacionSinConexion(tx, contexto, {
        organizationId,
        branchId,
        actorId,
        entityId,
      });
    });
  }
  async supplierOfflineSigned(
    senderId: string,
    organizationId: string,
    branchId: string,
    firma: {
      actorId: string;
      deviceId: string;
      payload: string;
      signature: string;
    },
    op: OperacionProveedorSinConexion,
  ) {
    if (firma.actorId === senderId)
      return this.supplierOffline(senderId, organizationId, branchId, op);
    await verificarOperacionDeOtro(this.prisma, {
      ...firma,
      senderId,
      organizationId,
      branchId,
    });
    try {
      await this.assert(firma.actorId, organizationId, "PARTY_MANAGE");
    } catch {
      throw new BadRequestException(
        "Quien cargó el proveedor ya no puede manejar proveedores. Revisalo a mano.",
      );
    }
    return this.supplierOffline(
      firma.actorId,
      organizationId,
      branchId,
      op,
      senderId,
    );
  }
  private validateSupplierTerms(
    input: {
      accountEnabled?: boolean;
      accountTermDays?: number | null;
    },
    /** Sin conexión, la edición sólo trae los campos que cambiaron. */
    parcial = false,
  ) {
    if (
      (parcial && input.accountEnabled === undefined
        ? false
        : typeof input.accountEnabled !== "boolean") ||
      (input.accountTermDays != null &&
        (!Number.isInteger(input.accountTermDays) ||
          input.accountTermDays < 0 ||
          input.accountTermDays > 3650))
    )
      throw new BadRequestException(
        "Revisá la condición y el plazo del proveedor.",
      );
  }
  async updateSupplierTerms(
    actorId: string,
    organizationId: string,
    supplierId: string,
    input: SupplierProfile & {
      accountEnabled: boolean;
      accountTermDays?: number | null;
      expectedUpdatedAt?: string;
    },
  ) {
    await this.assert(actorId, organizationId, "PARTY_MANAGE");
    this.validateSupplierTerms(input);
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Supplier" WHERE id=${supplierId}::uuid AND "organizationId"=${organizationId}::uuid FOR UPDATE`;
      const before = await tx.supplier.findFirst({
        where: { id: supplierId, organizationId, active: true },
      });
      if (!before) throw new NotFoundException("Proveedor no disponible.");
      if (input.expectedUpdatedAt !== before.updatedAt.toISOString())
        throw new ConflictException(
          "El proveedor cambió. Actualizá antes de guardar.",
        );
      const data = {
        ...supplierProfile(input),
        accountEnabled: input.accountEnabled,
        accountTermDays: input.accountEnabled
          ? (input.accountTermDays ?? null)
          : null,
      };
      const result = await tx.supplier.update({
        where: { id: supplierId },
        data,
      });
      await tx.auditLog.create({
        data: {
          organizationId,
          actorId,
          entityType: "SUPPLIER",
          entityId: supplierId,
          action: "SUPPLIER_TERMS_UPDATED",
          before: {
            name: before.name,
            phone: before.phone,
            email: before.email,
            contactName: before.contactName,
            address: before.address,
            notes: before.notes,
            accountEnabled: before.accountEnabled,
            accountTermDays: before.accountTermDays,
          },
          after: data,
        },
      });
      return result;
    });
  }
  async updateBilling(
    actorId: string,
    organizationId: string,
    customerId: string,
    input: UpdateCustomerBillingDto,
  ) {
    await this.assert(actorId, organizationId, "PARTY_MANAGE");
    if (
      input.name !== undefined &&
      (typeof input.name !== "string" ||
        input.name.trim().length < 2 ||
        input.name.trim().length > 160)
    ) {
      throw new BadRequestException(
        "El nombre o razón social debe tener entre 2 y 160 caracteres.",
      );
    }
    return this.prisma.$transaction(async (tx) => {
      // Lock before reading the current profile, so concurrent edits see the latest document.
      if (input.billingTaxId !== undefined)
        await tx.$queryRaw`SELECT id FROM "Organization" WHERE id = ${organizationId}::uuid FOR UPDATE`;
      const customer = await tx.customer.findFirst({
        where: { id: customerId, organizationId },
      });
      if (!customer)
        throw new NotFoundException(
          "El cliente no está disponible en esta organización.",
        );
      if (
        input.billingTaxId !== undefined &&
        normalizeCustomerDocument(input.billingTaxId) !==
          normalizeCustomerDocument(customer.billingTaxId)
      )
        await assertCustomerDocumentAvailable(
          tx,
          organizationId,
          [input.billingTaxId],
          customerId,
        );
      const data = {
        ...(input.priceListId !== undefined
          ? { priceListId: input.priceListId || null }
          : {}),
        ...billingData(input),
        ...(input.name !== undefined ? { name: input.name.trim() } : {}),
      };
      if (
        input.priceListId &&
        !(await tx.priceList.findFirst({
          where: { id: input.priceListId, organizationId, active: true },
        }))
      ) {
        throw new NotFoundException("La lista de precios no está disponible.");
      }
      await tx.customer.update({
        where: { id: customerId, organizationId },
        data,
      });
      await tx.auditLog.create({
        data: {
          organizationId,
          actorId,
          entityType: "CUSTOMER",
          entityId: customerId,
          action: "CUSTOMER_BILLING_UPDATED",
          after: { fields: Object.keys(data) },
        },
      });
      return { ok: true };
    });
  }
  async setSupplierActive(
    actorId: string,
    organizationId: string,
    supplierId: string,
    active: boolean,
  ) {
    await this.assert(actorId, organizationId, "PARTY_MANAGE");
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Supplier" WHERE id=${supplierId}::uuid AND "organizationId"=${organizationId}::uuid FOR UPDATE`;
      const supplier = await tx.supplier.findFirst({
        where: { id: supplierId, organizationId },
      });
      if (!supplier) throw new NotFoundException("Proveedor no disponible.");
      if (supplier.active === active) return { ok: true };
      await tx.supplier.update({
        where: { id: supplierId, organizationId },
        data: { active },
      });
      await tx.auditLog.create({
        data: {
          organizationId,
          actorId,
          entityType: "SUPPLIER",
          entityId: supplierId,
          action: active ? "SUPPLIER_RESTORED" : "SUPPLIER_ARCHIVED",
          before: { active: supplier.active },
          after: { active },
        },
      });
      return { ok: true };
    });
  }
  async setCustomerActive(
    actorId: string,
    organizationId: string,
    customerId: string,
    active: boolean,
  ) {
    await this.assert(actorId, organizationId, "PARTY_MANAGE");
    return this.prisma.$transaction(
      async (tx) => {
        const customer = await tx.customer.findFirst({
          where: { id: customerId, organizationId },
          include: { accountMovements: true },
        });
        if (!customer)
          throw new NotFoundException(
            "El cliente no está disponible en esta organización.",
          );
        if (customer.active === active) return { ok: true };
        const balance = customer.accountMovements.reduce(
          (sum, movement) =>
            sum +
            (movement.type === "DEBIT"
              ? movement.amountMinor
              : -movement.amountMinor),
          0n,
        );
        if (!active && balance !== 0n)
          throw new BadRequestException(
            "El cliente tiene saldo pendiente o saldo a favor. Regularizá su cuenta corriente antes de eliminarlo.",
          );
        await tx.customer.update({
          where: { id: customerId, organizationId },
          data: { active },
        });
        await tx.auditLog.create({
          data: {
            organizationId,
            actorId,
            entityType: "CUSTOMER",
            entityId: customerId,
            action: active ? "CUSTOMER_RESTORED" : "CUSTOMER_ARCHIVED",
            before: { active: customer.active },
            after: { active },
          },
        });
        return { ok: true };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }
  private async assert(actorId: string, organizationId: string, code: string) {
    const membership = await this.prisma.userOrganization.findUnique({
      where: { userId_organizationId: { userId: actorId, organizationId } },
      include: {
        roles: {
          include: {
            role: {
              include: { permissions: { include: { permission: true } } },
            },
          },
        },
      },
    });
    if (
      !membership?.active ||
      !membership.roles.some(({ role }) =>
        role.permissions.some(({ permission }) => permission.code === code),
      )
    )
      throw new ForbiddenException(
        "No tenés permiso para esta operación. Pedíselo al dueño de la farmacia.",
      );
  }
}
