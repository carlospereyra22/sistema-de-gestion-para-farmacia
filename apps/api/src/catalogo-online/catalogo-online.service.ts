import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { hash } from "@node-rs/argon2";
import { Prisma } from "@prisma/client";

import { PrismaService } from "../prisma/prisma.service";
import {
  correoNormalizado,
  repartirEntrega,
  siguienteEstado,
  slugDesdeNombre,
  slugValido,
  type AccionPedido,
  type EstadoPedido,
} from "./catalogo-reglas";
import { serializarPedido } from "./catalogo-publico.service";

export type ConfiguracionCatalogo = {
  slug: string;
  branchId: string;
  published: boolean;
  displayName: string;
  requireLogin: boolean;
  showPricesPublic: boolean;
  showOutOfStock: boolean;
  priceListId: string | null;
  pickupEnabled: boolean;
  deliveryEnabled: boolean;
  deductStockOnDelivery: boolean;
};

export type UsuarioPortalNuevo = {
  customerId: string;
  name: string;
  email: string;
  password: string;
};

export type CambioUsuarioPortal = {
  name?: string;
  active?: boolean;
  password?: string;
};

/** Acciones de la farmacia sobre un pedido (cancelar es sólo del cliente). */
export type DecisionPedido = Exclude<AccionPedido, "cancelar">;

/** 00:00 de un día civil de Argentina (UTC-3), como en Preventa. */
const inicioDelDia = (fecha: string) => new Date(`${fecha}T03:00:00.000Z`);

const pedidoConRenglones = {
  items: { orderBy: { productName: "asc" } },
} as const;

/**
 * Catálogo online del lado de la farmacia (SISTEMA-107): configuración,
 * usuarios del portal y pedidos. Configurar y dar usuarios pide
 * ORGANIZATION_MANAGE; ver pedidos, SALE_READ; resolverlos, SALE_MANAGE.
 */
@Injectable()
export class CatalogoOnlineService {
  constructor(private readonly prisma: PrismaService) {}

  async configuracion(actorId: string, organizationId: string) {
    await this.exigir(actorId, organizationId, ["ORGANIZATION_MANAGE"]);
    const actual = await this.prisma.catalogSettings.findUnique({
      where: { organizationId },
    });
    if (actual)
      return { exists: true, ...this.serializarConfiguracion(actual) };
    // Todavía no se configuró: se propone una con los datos de la farmacia.
    const [organizacion, sucursal] = await Promise.all([
      this.prisma.organization.findUniqueOrThrow({
        where: { id: organizationId },
        select: { name: true },
      }),
      this.prisma.branch.findFirst({
        where: { organizationId, active: true, deletedAt: null },
        orderBy: { createdAt: "asc" },
        select: { id: true },
      }),
    ]);
    return {
      exists: false,
      slug: slugDesdeNombre(organizacion.name),
      branchId: sucursal?.id ?? "",
      published: false,
      displayName: organizacion.name.slice(0, 80),
      requireLogin: false,
      showPricesPublic: true,
      showOutOfStock: false,
      priceListId: null,
      pickupEnabled: true,
      deliveryEnabled: false,
      deductStockOnDelivery: false,
      updatedAt: null,
    };
  }

  async guardarConfiguracion(
    actorId: string,
    organizationId: string,
    datos: ConfiguracionCatalogo,
  ) {
    await this.exigir(actorId, organizationId, ["ORGANIZATION_MANAGE"]);
    const slug = datos.slug.trim().toLowerCase();
    if (!slugValido(slug))
      throw new BadRequestException(
        "La dirección lleva entre 3 y 60 letras minúsculas, números o guiones.",
      );
    const displayName = datos.displayName.trim();
    if (!displayName)
      throw new BadRequestException("Escribí el nombre que ve el cliente.");
    if (!datos.pickupEnabled && !datos.deliveryEnabled)
      throw new BadRequestException(
        "Elegí al menos una forma de entrega: retiro o envío.",
      );
    const sucursal = await this.prisma.branch.findFirst({
      where: {
        id: datos.branchId,
        organizationId,
        active: true,
        deletedAt: null,
      },
      select: { id: true },
    });
    if (!sucursal)
      throw new BadRequestException(
        "Elegí una sucursal activa de la farmacia.",
      );
    if (datos.priceListId) {
      const lista = await this.prisma.priceList.findFirst({
        where: { id: datos.priceListId, organizationId, active: true },
        select: { id: true },
      });
      if (!lista)
        throw new BadRequestException("Elegí una lista de precios activa.");
    }
    const valores = {
      slug,
      branchId: datos.branchId,
      published: datos.published,
      displayName: displayName.slice(0, 80),
      requireLogin: datos.requireLogin,
      showPricesPublic: datos.showPricesPublic,
      showOutOfStock: datos.showOutOfStock,
      priceListId: datos.priceListId,
      pickupEnabled: datos.pickupEnabled,
      deliveryEnabled: datos.deliveryEnabled,
      deductStockOnDelivery: datos.deductStockOnDelivery,
    };
    try {
      return await this.prisma.$transaction(async (tx) => {
        const antes = await tx.catalogSettings.findUnique({
          where: { organizationId },
        });
        const guardado = await tx.catalogSettings.upsert({
          where: { organizationId },
          create: { organizationId, ...valores },
          update: valores,
        });
        await tx.auditLog.create({
          data: {
            organizationId,
            actorId,
            entityType: "CatalogSettings",
            entityId: organizationId,
            action: antes
              ? "CATALOG_SETTINGS_UPDATED"
              : "CATALOG_SETTINGS_CREATED",
            before: antes ? this.serializarConfiguracion(antes) : Prisma.DbNull,
            after: this.serializarConfiguracion(guardado),
          },
        });
        return { exists: true, ...this.serializarConfiguracion(guardado) };
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      )
        throw new ConflictException(
          "Esa dirección ya la usa otra farmacia. Elegí otra.",
        );
      throw error;
    }
  }

  async usuarios(actorId: string, organizationId: string) {
    await this.exigir(actorId, organizationId, ["ORGANIZATION_MANAGE"]);
    const usuarios = await this.prisma.catalogPortalUser.findMany({
      where: { organizationId },
      orderBy: [{ active: "desc" }, { name: "asc" }],
      include: { customer: { select: { name: true } } },
    });
    return usuarios.map((usuario) => this.serializarUsuario(usuario));
  }

  async crearUsuario(
    actorId: string,
    organizationId: string,
    datos: UsuarioPortalNuevo,
  ) {
    await this.exigir(actorId, organizationId, ["ORGANIZATION_MANAGE"]);
    const cliente = await this.prisma.customer.findFirst({
      where: { id: datos.customerId, organizationId, active: true },
      select: { id: true },
    });
    if (!cliente)
      throw new BadRequestException("Elegí un cliente activo de la farmacia.");
    const email = correoNormalizado(datos.email);
    const name = datos.name.trim();
    if (!name) throw new BadRequestException("Escribí el nombre del usuario.");
    const passwordHash = await hash(datos.password);
    try {
      return await this.prisma.$transaction(async (tx) => {
        const creado = await tx.catalogPortalUser.create({
          data: {
            organizationId,
            customerId: cliente.id,
            name: name.slice(0, 120),
            email,
            passwordHash,
          },
          include: { customer: { select: { name: true } } },
        });
        await tx.auditLog.create({
          data: {
            organizationId,
            actorId,
            entityType: "CatalogPortalUser",
            entityId: creado.id,
            action: "CATALOG_PORTAL_USER_CREATED",
            after: { email, customerId: cliente.id, name: creado.name },
          },
        });
        return this.serializarUsuario(creado);
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      )
        throw new ConflictException(
          "Ya hay un usuario del portal con ese correo.",
        );
      throw error;
    }
  }

  async cambiarUsuario(
    actorId: string,
    organizationId: string,
    userId: string,
    cambio: CambioUsuarioPortal,
  ) {
    await this.exigir(actorId, organizationId, ["ORGANIZATION_MANAGE"]);
    const passwordHash = cambio.password
      ? await hash(cambio.password)
      : undefined;
    return this.prisma.$transaction(async (tx) => {
      const antes = await tx.catalogPortalUser.findFirst({
        where: { id: userId, organizationId },
      });
      if (!antes)
        throw new NotFoundException("No encontramos ese usuario del portal.");
      const name = cambio.name?.trim();
      if (cambio.name !== undefined && !name)
        throw new BadRequestException("Escribí el nombre del usuario.");
      const actualizado = await tx.catalogPortalUser.update({
        where: { id: antes.id },
        data: {
          ...(name ? { name: name.slice(0, 120) } : {}),
          ...(cambio.active !== undefined ? { active: cambio.active } : {}),
          ...(passwordHash ? { passwordHash } : {}),
        },
        include: { customer: { select: { name: true } } },
      });
      // Desactivarlo o cambiarle la clave cierra sus sesiones abiertas.
      if (cambio.active === false || passwordHash)
        await tx.catalogPortalSession.updateMany({
          where: { portalUserId: antes.id, revokedAt: null },
          data: { revokedAt: new Date() },
        });
      await tx.auditLog.create({
        data: {
          organizationId,
          actorId,
          entityType: "CatalogPortalUser",
          entityId: antes.id,
          action: "CATALOG_PORTAL_USER_UPDATED",
          before: { name: antes.name, active: antes.active },
          after: {
            name: actualizado.name,
            active: actualizado.active,
            passwordChanged: Boolean(passwordHash),
          },
        },
      });
      return this.serializarUsuario(actualizado);
    });
  }

  async pedidos(
    actorId: string,
    organizationId: string,
    filtro: {
      estado?: EstadoPedido;
      /** Varios estados y rango de fechas: pantalla Pedidos (SISTEMA-119). */
      estados?: readonly EstadoPedido[];
      desde?: string;
      hasta?: string;
    },
  ) {
    await this.exigir(actorId, organizationId, ["SALE_READ"]);
    const [pedidos, recibidos] = await this.prisma.$transaction([
      this.prisma.catalogOrder.findMany({
        where: {
          organizationId,
          ...(filtro.estado ? { status: filtro.estado } : {}),
          ...(filtro.estados ? { status: { in: [...filtro.estados] } } : {}),
          ...(filtro.desde || filtro.hasta
            ? {
                createdAt: {
                  ...(filtro.desde ? { gte: inicioDelDia(filtro.desde) } : {}),
                  ...(filtro.hasta
                    ? {
                        lt: new Date(
                          inicioDelDia(filtro.hasta).getTime() + 86_400_000,
                        ),
                      }
                    : {}),
                },
              }
            : {}),
        },
        orderBy: { createdAt: "desc" },
        take: 200,
        include: {
          ...pedidoConRenglones,
          customer: { select: { name: true } },
          branch: { select: { name: true } },
        },
      }),
      this.prisma.catalogOrder.count({
        where: { organizationId, status: "RECEIVED" },
      }),
    ]);
    const ajustes = await this.prisma.catalogSettings.findUnique({
      where: { organizationId },
      select: { deductStockOnDelivery: true },
    });
    return {
      recibidos,
      descuentaStock: ajustes?.deductStockOnDelivery ?? false,
      items: pedidos.map((pedido) => ({
        ...serializarPedido(pedido),
        customerId: pedido.customerId,
        customerName: pedido.customer.name,
        branchName: pedido.branch.name,
      })),
    };
  }

  async decidir(
    actorId: string,
    organizationId: string,
    orderId: string,
    accion: DecisionPedido,
    datos: { expectedStatus: EstadoPedido; note?: string },
  ) {
    await this.exigir(actorId, organizationId, ["SALE_MANAGE"]);
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "CatalogOrder" WHERE id = ${orderId}::uuid FOR UPDATE`;
      const pedido = await tx.catalogOrder.findFirst({
        where: { id: orderId, organizationId },
      });
      if (!pedido) throw new NotFoundException("No encontramos ese pedido.");
      if (pedido.status !== datos.expectedStatus)
        throw new ConflictException(
          "El pedido cambió mientras lo mirabas. Actualizá y volvé a intentarlo.",
        );
      const estado = siguienteEstado(pedido.status, accion);
      if (!estado)
        throw new ConflictException("Este pedido ya no admite ese cambio.");
      const nota = datos.note?.trim() || null;
      const ahora = new Date();
      const descontar =
        accion === "entregar" &&
        Boolean(
          (
            await tx.catalogSettings.findUnique({
              where: { organizationId },
              select: { deductStockOnDelivery: true },
            })
          )?.deductStockOnDelivery,
        );
      if (descontar) await this.descontarStock(tx, pedido, actorId, ahora);
      const actualizado = await tx.catalogOrder.update({
        where: { id: pedido.id },
        data: {
          status: estado,
          ...(accion === "entregar"
            ? {
                deliveredAt: ahora,
                ...(descontar ? { stockDeductedAt: ahora } : {}),
              }
            : { decidedAt: ahora, decidedById: actorId }),
          ...(accion === "rechazar" ? { decisionNote: nota } : {}),
        },
        include: {
          ...pedidoConRenglones,
          customer: { select: { name: true } },
          branch: { select: { name: true } },
        },
      });
      await tx.auditLog.create({
        data: {
          organizationId,
          branchId: pedido.branchId,
          actorId,
          entityType: "CatalogOrder",
          entityId: pedido.id,
          action: `CATALOG_ORDER_${estado}`,
          before: { status: pedido.status },
          after: { status: estado, note: nota, stockDeducted: descontar },
        },
      });
      return {
        ...serializarPedido(actualizado),
        customerId: actualizado.customerId,
        customerName: actualizado.customer.name,
        branchName: actualizado.branch.name,
      };
    });
  }

  /**
   * Descuenta el stock de un pedido al entregarlo (si la farmacia lo eligió).
   * Mismas reglas que Ventas: primero lo que vence antes, nunca un lote
   * vencido ni stock negativo. Si falta algo, no se entrega nada.
   */
  private async descontarStock(
    tx: Prisma.TransactionClient,
    pedido: { id: string; organizationId: string; branchId: string },
    actorId: string,
    ahora: Date,
  ) {
    const renglones = await tx.catalogOrderItem.findMany({
      where: { orderId: pedido.id },
      orderBy: { productId: "asc" },
    });
    for (const renglon of renglones) {
      // Los lotes quedan bloqueados hasta terminar: nadie vende lo mismo a la vez.
      await tx.$queryRaw`SELECT id FROM "ProductLot" WHERE "organizationId" = ${pedido.organizationId}::uuid AND "branchId" = ${pedido.branchId}::uuid AND "productId" = ${renglon.productId}::uuid FOR UPDATE`;
      const lotes = await tx.productLot.findMany({
        where: {
          organizationId: pedido.organizationId,
          branchId: pedido.branchId,
          productId: renglon.productId,
          quantity: { gt: 0 },
        },
        select: { id: true, quantity: true, expiresAt: true },
      });
      const { salidas, faltante } = repartirEntrega(
        lotes,
        renglon.quantity,
        ahora,
      );
      if (faltante > 0)
        throw new ConflictException(
          `No hay stock suficiente de ${renglon.productName} para entregarlo: faltan ${faltante}. Cargá el stock o apagá "Descontar stock al entregar".`,
        );
      for (const salida of salidas) {
        await tx.productLot.update({
          where: { id: salida.lotId },
          data: { quantity: { decrement: salida.quantity } },
        });
        await tx.inventoryMovement.create({
          data: {
            organizationId: pedido.organizationId,
            branchId: pedido.branchId,
            productId: renglon.productId,
            lotId: salida.lotId,
            type: "ADJUSTMENT_OUT",
            quantity: -salida.quantity,
            actorId,
            occurredAt: ahora,
            referenceType: "CATALOG_ORDER",
            referenceId: pedido.id,
          },
        });
      }
    }
  }

  private serializarConfiguracion(
    valor: Prisma.CatalogSettingsGetPayload<object>,
  ) {
    return {
      slug: valor.slug,
      branchId: valor.branchId,
      published: valor.published,
      displayName: valor.displayName,
      requireLogin: valor.requireLogin,
      showPricesPublic: valor.showPricesPublic,
      showOutOfStock: valor.showOutOfStock,
      priceListId: valor.priceListId,
      pickupEnabled: valor.pickupEnabled,
      deliveryEnabled: valor.deliveryEnabled,
      deductStockOnDelivery: valor.deductStockOnDelivery,
      updatedAt: valor.updatedAt.toISOString(),
    };
  }

  private serializarUsuario(
    usuario: Prisma.CatalogPortalUserGetPayload<{
      include: { customer: { select: { name: true } } };
    }>,
  ) {
    return {
      id: usuario.id,
      name: usuario.name,
      email: usuario.email,
      customerId: usuario.customerId,
      customerName: usuario.customer.name,
      active: usuario.active,
      lastLoginAt: usuario.lastLoginAt?.toISOString() ?? null,
      createdAt: usuario.createdAt.toISOString(),
    };
  }

  private async exigir(
    actorId: string,
    organizationId: string,
    alguno: readonly string[],
  ) {
    // Módulo aparte (SISTEMA-107): lo habilita el panel de plataforma.
    const organizacion = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: { catalogEnabled: true },
    });
    if (!organizacion?.catalogEnabled)
      throw new ForbiddenException(
        "El catálogo online no está habilitado para esta farmacia.",
      );
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
        role.permissions.some(({ permission }) =>
          alguno.includes(permission.code),
        ),
      )
    )
      throw new ForbiddenException(
        "No tenés permiso para esta operación. Pedíselo al dueño de la farmacia.",
      );
  }
}
