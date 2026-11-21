import { BadRequestException } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import {
  SIN_CLIENTE,
  diaSiguiente,
  inicioDelDia,
  rangoDeCodigo,
} from "./historial-ventas";
import { creditLineAmount } from "../fiscal/credit-lines";

// Reglas puras de la nota de crédito (SISTEMA-110). Ver docs/NOTAS_CREDITO.md.

export type RenglonVendido = {
  id: string;
  productId: string | null;
  lotId: string | null;
  quantity: number;
  unitPriceMinor: bigint;
  discountMinor: bigint;
};

export type PedidoNota = {
  saleItemId: string;
  quantity: number;
  /** Vuelve al stock vendible, al lote de la venta. */
  reponer: boolean;
};

export type RenglonNota = {
  saleItemId: string;
  productId: string | null;
  lotId: string | null;
  quantity: number;
  amountMinor: bigint;
  /** Parte del descuento de la venta que le toca a lo devuelto. */
  discountMinor: bigint;
  unitPriceMinor: bigint;
  reponer: boolean;
};

/** Motivo de una devolución creada por la liquidación de una nota anterior. */
export const MOTIVO_LIQUIDACION_ANTERIOR = /^Nota de crédito [0-9a-f-]{36}$/;

/**
 * Cuánto se devolvió ya de cada renglón. Cuenta las devoluciones y las notas de
 * crédito productivas anteriores a SISTEMA-110 (sin devolución propia). Una
 * nota anterior que se liquidó con la mercadería recibida también dejó una
 * devolución: esa no se suma dos veces.
 */
export function devueltoPorRenglon(
  devoluciones: {
    saleItemId: string;
    quantity: number;
    creditKind: string | null;
    reason: string;
  }[],
  notasAnteriores: { saleItemId: string; quantity: number }[],
) {
  const devuelto = new Map<string, number>();
  const sumar = (saleItemId: string, quantity: number) =>
    devuelto.set(saleItemId, (devuelto.get(saleItemId) ?? 0) + quantity);
  for (const item of devoluciones)
    if (item.creditKind || !MOTIVO_LIQUIDACION_ANTERIOR.test(item.reason))
      sumar(item.saleItemId, item.quantity);
  for (const item of notasAnteriores) sumar(item.saleItemId, item.quantity);
  return devuelto;
}

/**
 * Renglones de la nota con su importe. El descuento de la venta (ofertas
 * incluidas) se prorratea por acumulado: el último centavo va a la última
 * unidad devuelta, así la suma de varias notas nunca supera lo vendido.
 */
export function armarRenglonesNota(
  vendidos: RenglonVendido[],
  devuelto: Map<string, number>,
  pedidos: PedidoNota[],
): RenglonNota[] {
  if (!pedidos.length)
    throw new BadRequestException("Elegí al menos un producto.");
  if (new Set(pedidos.map((p) => p.saleItemId)).size !== pedidos.length)
    throw new BadRequestException(
      "Cada producto de la venta puede aparecer una sola vez.",
    );
  return pedidos.map((pedido) => {
    const vendido = vendidos.find((item) => item.id === pedido.saleItemId);
    if (!vendido)
      throw new BadRequestException("Algún producto no es de esta venta.");
    if (!Number.isSafeInteger(pedido.quantity) || pedido.quantity <= 0)
      throw new BadRequestException("Revisá las cantidades a devolver.");
    const previo = devuelto.get(vendido.id) ?? 0;
    if (previo + pedido.quantity > vendido.quantity)
      throw new BadRequestException(
        "La cantidad a devolver supera lo que queda sin devolver de la venta.",
      );
    if (pedido.reponer && (!vendido.productId || !vendido.lotId))
      throw new BadRequestException(
        vendido.productId
          ? "Ese producto se vendió sin lote (sin stock al sincronizar): no se puede reponer."
          : "Un concepto no tiene stock para reponer.",
      );
    const amountMinor = creditLineAmount(
      vendido.unitPriceMinor,
      vendido.discountMinor,
      vendido.quantity,
      previo,
      pedido.quantity,
    );
    return {
      saleItemId: vendido.id,
      productId: vendido.productId,
      lotId: vendido.lotId,
      quantity: pedido.quantity,
      unitPriceMinor: vendido.unitPriceMinor,
      discountMinor:
        vendido.unitPriceMinor * BigInt(pedido.quantity) - amountMinor,
      amountMinor,
      reponer: pedido.reponer,
    };
  });
}

/**
 * Cómo se devuelve lo acreditado: primero baja lo que se debe en cuenta
 * corriente de cada artículo; el resto se devuelve en plata.
 */
export function repartirNota(
  renglones: Pick<RenglonNota, "saleItemId" | "amountMinor">[],
  pendientePorRenglon: Map<string, bigint>,
) {
  const allocations: { saleItemId: string; amountMinor: number }[] = [];
  let accountMinor = 0n;
  let totalMinor = 0n;
  for (const renglon of renglones) {
    totalMinor += renglon.amountMinor;
    const pendiente = pendientePorRenglon.get(renglon.saleItemId) ?? 0n;
    const aCuenta =
      pendiente < renglon.amountMinor ? pendiente : renglon.amountMinor;
    if (aCuenta > 0n) {
      accountMinor += aCuenta;
      allocations.push({
        saleItemId: renglon.saleItemId,
        amountMinor: Number(aCuenta),
      });
    }
  }
  return {
    totalMinor,
    accountMinor,
    refundMinor: totalMinor - accountMinor,
    allocations,
  };
}

export type FiltroNotasCredito = {
  /** Fecha civil de Argentina, `YYYY-MM-DD`, inclusive. */
  from?: string;
  to?: string;
  creditKind?: "INTERNA" | "FACTURA";
  /** Comienzo del número de la nota o del código de la venta. */
  q?: string;
  /** Cliente de la venta; SIN_CLIENTE: público general. */
  customerId?: string;
};

/** Filtro del listado de notas de crédito de una sucursal. */
export function whereNotasCredito(
  organizationId: string,
  branchId: string,
  filtro: FiltroNotasCredito,
): Prisma.CustomerReturnWhereInput {
  const where: Prisma.CustomerReturnWhereInput = {
    organizationId,
    branchId,
    creditKind: filtro.creditKind ?? { not: null },
  };
  if (filtro.from || filtro.to)
    where.createdAt = {
      ...(filtro.from ? { gte: inicioDelDia(filtro.from) } : {}),
      ...(filtro.to ? { lt: diaSiguiente(filtro.to) } : {}),
    };
  if (filtro.customerId)
    where.sale = {
      customerId: filtro.customerId === SIN_CLIENTE ? null : filtro.customerId,
    };
  if (filtro.q) {
    const rango = rangoDeCodigo(filtro.q);
    // Un código que no puede existir no trae nada.
    where.OR = rango
      ? [{ id: rango }, { saleId: rango }]
      : [{ id: { in: [] } }];
  }
  return where;
}
