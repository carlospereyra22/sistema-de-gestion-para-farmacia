import { Prisma } from "@prisma/client";

import type { OfertaMotor } from "./ofertas-motor";

type Cliente = Prisma.TransactionClient;

export const incluirOferta = {
  targets: true,
  tiers: true,
  branches: true,
  priceLists: true,
} satisfies Prisma.OfferInclude;

export type OfertaConRelaciones = Prisma.OfferGetPayload<{
  include: typeof incluirOferta;
}>;

/** Cada categoría con todas sus subcategorías (incluida ella misma). */
export async function arbolCategorias(
  cliente: Cliente,
  organizationId: string,
): Promise<(id: string) => string[]> {
  const categorias = await cliente.category.findMany({
    where: { organizationId },
    select: { id: true, parentId: true },
  });
  const hijos = new Map<string, string[]>();
  for (const categoria of categorias)
    if (categoria.parentId)
      hijos.set(categoria.parentId, [
        ...(hijos.get(categoria.parentId) ?? []),
        categoria.id,
      ]);
  return (id) => {
    const resultado: string[] = [];
    const pendientes = [id];
    while (pendientes.length) {
      const actual = pendientes.pop()!;
      if (resultado.includes(actual)) continue;
      resultado.push(actual);
      pendientes.push(...(hijos.get(actual) ?? []));
    }
    return resultado;
  };
}

/** Unidades ya vendidas con cada oferta (ventas no anuladas). */
export async function unidadesUsadas(
  cliente: Cliente,
  organizationId: string,
  offerIds: readonly string[],
): Promise<Map<string, number>> {
  if (!offerIds.length) return new Map();
  const filas = await cliente.saleOffer.groupBy({
    by: ["offerId"],
    where: {
      organizationId,
      offerId: { in: [...offerIds] },
      sale: { status: "COMPLETED" },
    },
    _sum: { units: true },
  });
  return new Map(filas.map((fila) => [fila.offerId, fila._sum.units ?? 0]));
}

export function ofertaMotor(
  oferta: OfertaConRelaciones,
  categorias: (id: string) => string[],
  usadas: number,
): OfertaMotor {
  return {
    id: oferta.id,
    version: oferta.version,
    name: oferta.name,
    type: oferta.type,
    status: oferta.status,
    priority: oferta.priority,
    combinable: oferta.combinable,
    createdAt: oferta.createdAt.toISOString(),
    startsAt: oferta.startsAt.toISOString(),
    endsAt: oferta.endsAt?.toISOString() ?? null,
    weekdays: oferta.weekdays,
    dayStartMinute: oferta.dayStartMinute,
    dayEndMinute: oferta.dayEndMinute,
    branchIds: oferta.allBranches
      ? null
      : oferta.branches.map((item) => item.branchId),
    priceListIds: oferta.allPriceLists
      ? null
      : oferta.priceLists.map((item) => item.priceListId),
    productKind: oferta.productKind,
    maxUnitsPerSale: oferta.maxUnitsPerSale,
    remainingUnits:
      oferta.maxUnitsTotal === null
        ? null
        : Math.max(oferta.maxUnitsTotal - usadas, 0),
    percentBps: oferta.percentBps,
    amountMinor: oferta.amountMinor,
    fixedPriceMinor: oferta.fixedPriceMinor,
    buyQuantity: oferta.buyQuantity,
    payQuantity: oferta.payQuantity,
    nthUnit: oferta.nthUnit,
    bundlePriceMinor: oferta.bundlePriceMinor,
    paymentMethods: oferta.paymentMethods,
    allProducts: oferta.allProducts,
    minPurchaseMinor: oferta.minPurchaseMinor,
    tiers: [...oferta.tiers]
      .sort((a, b) => a.minQuantity - b.minQuantity)
      .map((tier) => ({
        minQuantity: tier.minQuantity,
        percentBps: tier.percentBps,
        amountMinor: tier.amountMinor,
      })),
    targets: oferta.targets.map((target) => {
      const id = target.productId ?? target.categoryId ?? target.laboratoryId;
      return {
        kind: target.kind,
        id: id ?? "",
        exclude: target.exclude,
        quantity: target.quantity,
        ...(target.kind === "CATEGORY" && target.categoryId
          ? { categoryIds: categorias(target.categoryId) }
          : {}),
      };
    }),
  };
}

/**
 * Ofertas publicadas que pueden aplicar desde `desde` (las vencidas antes no).
 * Con `bloquear`, las que tienen tope total quedan bloqueadas hasta el fin de
 * la transacción: dos ventas a la vez no pasan el tope.
 */
export async function cargarOfertasMotor(
  cliente: Cliente,
  organizationId: string,
  opciones: { desde: Date; bloquear?: boolean },
): Promise<OfertaMotor[]> {
  const ofertas = await cliente.offer.findMany({
    where: {
      organizationId,
      status: "PUBLISHED",
      OR: [{ endsAt: null }, { endsAt: { gt: opciones.desde } }],
    },
    include: incluirOferta,
    orderBy: { createdAt: "asc" },
  });
  if (!ofertas.length) return [];
  const conTope = ofertas
    .filter((oferta) => oferta.maxUnitsTotal !== null)
    .map((oferta) => oferta.id);
  if (opciones.bloquear && conTope.length)
    await cliente.$queryRaw`SELECT id FROM "Offer" WHERE id = ANY(${conTope}::uuid[]) ORDER BY id FOR UPDATE`;
  const [categorias, usadas] = await Promise.all([
    arbolCategorias(cliente, organizationId),
    unidadesUsadas(cliente, organizationId, conTope),
  ]);
  return ofertas.map((oferta) =>
    ofertaMotor(oferta, categorias, usadas.get(oferta.id) ?? 0),
  );
}

/** Parámetros de la oferta para la instantánea de la venta. */
export function parametrosOferta(oferta: OfertaMotor): Prisma.InputJsonObject {
  return {
    percentBps: oferta.percentBps,
    amountMinor: oferta.amountMinor?.toString() ?? null,
    fixedPriceMinor: oferta.fixedPriceMinor?.toString() ?? null,
    buyQuantity: oferta.buyQuantity,
    payQuantity: oferta.payQuantity,
    nthUnit: oferta.nthUnit,
    bundlePriceMinor: oferta.bundlePriceMinor?.toString() ?? null,
    tiers: oferta.tiers.map((tier) => ({
      minQuantity: tier.minQuantity,
      percentBps: tier.percentBps,
      amountMinor: tier.amountMinor?.toString() ?? null,
    })),
    combinable: oferta.combinable,
    priority: oferta.priority,
    maxUnitsPerSale: oferta.maxUnitsPerSale,
    ...(oferta.paymentMethods?.length
      ? { paymentMethods: [...oferta.paymentMethods] }
      : {}),
    ...(oferta.minPurchaseMinor
      ? { minPurchaseMinor: oferta.minPurchaseMinor.toString() }
      : {}),
  };
}
