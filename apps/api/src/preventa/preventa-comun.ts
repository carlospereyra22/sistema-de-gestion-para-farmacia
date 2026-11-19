import { ForbiddenException, NotFoundException } from "@nestjs/common";
import type { Prisma, PrismaClient } from "@prisma/client";

import { precioDeCatalogo } from "../catalogo-online/catalogo-reglas";
import { estadoCobro, type EfectoEntrega } from "./preventa-reglas";

type Cliente = Prisma.TransactionClient | PrismaClient;

/** Qué puede hacer el usuario en la preventa, según sus roles. */
export type AccesoPreventa = {
  actorId: string;
  organizationId: string;
  /** PREVENTA_SELL: toma pedidos y ve los suyos. */
  vender: boolean;
  /** PREVENTA_DELIVER: reparte y cobra. */
  repartir: boolean;
  /** PREVENTA_MANAGE: ve todo, configura, asigna y paga comisiones. */
  administrar: boolean;
  /** Ver saldos de cuenta corriente (ACCOUNT_READ). */
  verSaldos: boolean;
};

export type PermisoPreventa = "vender" | "repartir" | "administrar";

const SIN_PERMISO =
  "No tenés permiso para esta operación. Pedíselo al dueño de la farmacia.";

/**
 * Módulo aparte (SISTEMA-108): sin `preventaEnabled` la API responde 403. Con
 * él, hace falta al menos uno de los permisos de preventa.
 */
export async function accesoPreventa(
  cliente: Cliente,
  actorId: string,
  organizationId: string,
): Promise<AccesoPreventa> {
  const organizacion = await cliente.organization.findUnique({
    where: { id: organizationId },
    select: { preventaEnabled: true },
  });
  if (!organizacion?.preventaEnabled)
    throw new ForbiddenException(
      "La preventa no está habilitada para esta farmacia.",
    );
  const membership = await cliente.userOrganization.findUnique({
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
  const codigos = new Set(
    membership?.active
      ? membership.roles.flatMap(({ role }) =>
          role.permissions.map(({ permission }) => permission.code),
        )
      : [],
  );
  const acceso = {
    actorId,
    organizationId,
    vender: codigos.has("PREVENTA_SELL"),
    repartir: codigos.has("PREVENTA_DELIVER"),
    administrar: codigos.has("PREVENTA_MANAGE"),
    verSaldos: codigos.has("ACCOUNT_READ"),
  };
  if (!acceso.vender && !acceso.repartir && !acceso.administrar)
    throw new ForbiddenException(SIN_PERMISO);
  return acceso;
}

/** Exige alguno de los permisos (administrar siempre alcanza). */
export function exigir(acceso: AccesoPreventa, ...alguno: PermisoPreventa[]) {
  if (acceso.administrar) return;
  if (!alguno.some((permiso) => acceso[permiso]))
    throw new ForbiddenException(SIN_PERMISO);
}

export type AjustesPreventa = {
  exists: boolean;
  branchId: string;
  deliveryEffect: EfectoEntrega;
  sellerCanChangePrice: boolean;
  sellerSeesAllCustomers: boolean;
  showStock: boolean;
  allowOutOfStock: boolean;
  applyOffers: boolean;
  receiptNote: string | null;
  updatedAt: string | null;
};

/** Configuración guardada o, si nunca se configuró, la propuesta por defecto. */
export async function ajustesPreventa(
  cliente: Cliente,
  organizationId: string,
): Promise<AjustesPreventa> {
  const guardados = await cliente.preventaSettings.findUnique({
    where: { organizationId },
  });
  if (guardados)
    return {
      exists: true,
      branchId: guardados.branchId,
      deliveryEffect: guardados.deliveryEffect,
      sellerCanChangePrice: guardados.sellerCanChangePrice,
      sellerSeesAllCustomers: guardados.sellerSeesAllCustomers,
      showStock: guardados.showStock,
      allowOutOfStock: guardados.allowOutOfStock,
      applyOffers: guardados.applyOffers,
      receiptNote: guardados.receiptNote,
      updatedAt: guardados.updatedAt.toISOString(),
    };
  const sucursal = await cliente.branch.findFirst({
    where: { organizationId, active: true, deletedAt: null },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  if (!sucursal)
    throw new NotFoundException("La farmacia no tiene una sucursal activa.");
  return {
    exists: false,
    branchId: sucursal.id,
    deliveryEffect: "NONE",
    sellerCanChangePrice: false,
    sellerSeesAllCustomers: true,
    showStock: true,
    allowOutOfStock: true,
    applyOffers: true,
    receiptNote: null,
    updatedAt: null,
  };
}

/**
 * Listas que dan el precio a un cliente, igual que en Ventas: la suya (o
 * Precio general), su lista de respaldo y por último Precio general.
 */
export async function listasDelCliente(
  cliente: Cliente,
  organizationId: string,
  priceListId: string | null,
) {
  const general = await cliente.priceList.findFirst({
    where: { organizationId, name: "Precio general", active: true },
    select: { id: true },
  });
  const pedida = priceListId || general?.id;
  const elegida = pedida
    ? await cliente.priceList.findFirst({
        where: { id: pedida, organizationId, active: true },
        select: { id: true, fallbackPriceListId: true },
      })
    : null;
  const id = elegida?.id ?? general?.id;
  if (!id)
    throw new NotFoundException("La farmacia todavía no cargó sus precios.");
  const respaldo = elegida?.fallbackPriceListId
    ? await cliente.priceList.findFirst({
        where: {
          id: elegida.fallbackPriceListId,
          organizationId,
          active: true,
        },
        select: { id: true },
      })
    : null;
  return {
    elegida: id,
    respaldo: respaldo?.id ?? null,
    general: general?.id ?? null,
  };
}

export type Listas = Awaited<ReturnType<typeof listasDelCliente>>;

export const idsDeListas = (listas: Listas) =>
  [listas.elegida, listas.respaldo, listas.general].filter((id): id is string =>
    Boolean(id),
  );

export const precioEnListas = (
  precios: readonly { priceListId: string; amountMinor: bigint }[],
  listas: Listas,
) =>
  precioDeCatalogo(
    new Map(precios.map((p) => [p.priceListId, p.amountMinor])),
    listas,
  );

/**
 * Productos que se ofrecen en la preventa: activos, no archivados en la
 * sucursal y sin receta (como el catálogo online: un medicamento bajo receta
 * no se vende fuera del mostrador).
 */
export function filtroProductos(
  organizationId: string,
  branchId: string,
): Prisma.ProductWhereInput {
  return {
    organizationId,
    active: true,
    prescriptionRequired: false,
    branchStates: { none: { branchId, status: { not: "ACTIVE" } } },
  };
}

/** Unidades vendibles (lotes no vencidos) por producto en la sucursal. */
export async function stockPorProducto(
  cliente: Cliente,
  organizationId: string,
  branchId: string,
  productIds: readonly string[],
): Promise<Map<string, number>> {
  if (!productIds.length) return new Map();
  const hoy = new Date(new Date().toISOString().slice(0, 10));
  const grupos = await cliente.productLot.groupBy({
    by: ["productId"],
    where: {
      organizationId,
      branchId,
      productId: { in: [...productIds] },
      quantity: { gt: 0 },
      OR: [{ expiresAt: null }, { expiresAt: { gte: hoy } }],
    },
    _sum: { quantity: true },
  });
  return new Map(grupos.map((g) => [g.productId, g._sum.quantity ?? 0]));
}

/** Nombre para mostrar de cada usuario de la farmacia. */
export async function nombresDeUsuarios(
  cliente: Cliente,
  organizationId: string,
  userIds: readonly (string | null | undefined)[],
): Promise<Map<string, string>> {
  const ids = [...new Set(userIds.filter((id): id is string => Boolean(id)))];
  if (!ids.length) return new Map();
  const miembros = await cliente.userOrganization.findMany({
    where: { organizationId, userId: { in: ids } },
    select: {
      userId: true,
      displayName: true,
      user: { select: { email: true } },
    },
  });
  return new Map(
    miembros.map((m) => [m.userId, m.displayName?.trim() || m.user.email]),
  );
}

export const incluirPedido = {
  items: { orderBy: { productName: "asc" } },
  offers: { select: { label: true, name: true, discountMinor: true } },
  payments: { orderBy: { createdAt: "asc" } },
  customer: {
    select: {
      name: true,
      billingPhone: true,
      billingAddress: true,
      creditEnabled: true,
      preventaProfile: true,
    },
  },
} as const satisfies Prisma.PreventaOrderInclude;

export type PedidoCompleto = Prisma.PreventaOrderGetPayload<{
  include: typeof incluirPedido;
}>;

/** Pedido como lo ve la web. Importes como texto en centavos. */
export function serializarPedido(
  pedido: PedidoCompleto,
  nombres: ReadonlyMap<string, string>,
) {
  const perfil = pedido.customer.preventaProfile;
  return {
    id: pedido.id,
    number: pedido.number,
    status: pedido.status,
    customerId: pedido.customerId,
    customerName: pedido.customer.name,
    customerPhone: perfil?.phone || pedido.customer.billingPhone || null,
    customerCreditEnabled: pedido.customer.creditEnabled,
    deliveryAddress:
      pedido.deliveryAddress ??
      perfil?.address ??
      pedido.customer.billingAddress ??
      null,
    reference: perfil?.reference ?? null,
    latitude: perfil?.latitude?.toNumber() ?? null,
    longitude: perfil?.longitude?.toNumber() ?? null,
    sellerId: pedido.sellerId,
    sellerName: nombres.get(pedido.sellerId) ?? null,
    delivererId: pedido.delivererId,
    delivererName: pedido.delivererId
      ? (nombres.get(pedido.delivererId) ?? null)
      : null,
    notes: pedido.notes,
    deliveryNote: pedido.deliveryNote,
    totalMinor: pedido.totalMinor.toString(),
    paidMinor: pedido.paidMinor.toString(),
    paymentStatus: estadoCobro(pedido.totalMinor, pedido.paidMinor),
    deliveryEffect: pedido.deliveryEffect,
    saleId: pedido.saleId,
    stockDeducted: Boolean(pedido.stockDeductedAt),
    cancelReason: pedido.cancelReason,
    commissionRateBps: pedido.commissionRateBps,
    commissionPaid: Boolean(pedido.commissionPaymentId),
    createdAt: pedido.createdAt.toISOString(),
    assignedAt: pedido.assignedAt?.toISOString() ?? null,
    deliveredAt: pedido.deliveredAt?.toISOString() ?? null,
    cancelledAt: pedido.cancelledAt?.toISOString() ?? null,
    updatedAt: pedido.updatedAt.toISOString(),
    items: pedido.items.map((item) => ({
      productId: item.productId,
      productName: item.productName,
      quantity: item.quantity,
      listUnitPriceMinor: item.listUnitPriceMinor.toString(),
      unitPriceMinor: item.unitPriceMinor.toString(),
      discountMinor: item.discountMinor.toString(),
      totalMinor: item.totalMinor.toString(),
    })),
    offers: pedido.offers.map((oferta) => ({
      label: oferta.label,
      name: oferta.name,
      discountMinor: oferta.discountMinor.toString(),
    })),
    payments: pedido.payments.map((pago) => ({
      method: pago.method,
      amountMinor: pago.amountMinor.toString(),
      createdAt: pago.createdAt.toISOString(),
    })),
  };
}

/** Saldo de cuenta corriente por cliente (débitos menos créditos). */
export async function saldosDeClientes(
  cliente: Cliente,
  organizationId: string,
  customerIds: readonly string[],
): Promise<Map<string, bigint>> {
  if (!customerIds.length) return new Map();
  const filas = await cliente.customerAccountMovement.groupBy({
    by: ["customerId", "type"],
    where: { organizationId, customerId: { in: [...customerIds] } },
    _sum: { amountMinor: true },
  });
  const saldos = new Map<string, bigint>();
  for (const fila of filas) {
    const importe = fila._sum.amountMinor ?? 0n;
    saldos.set(
      fila.customerId,
      (saldos.get(fila.customerId) ?? 0n) +
        (fila.type === "DEBIT" ? importe : -importe),
    );
  }
  return saldos;
}
