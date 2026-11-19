import { createHash } from "node:crypto";

/**
 * Reglas puras de la preventa (SISTEMA-108): estados del pedido, cobro,
 * comisiones y días de visita. Sin base de datos, para testearlas solas.
 */

export type EstadoPreventa =
  "PENDING" | "IN_DELIVERY" | "DELIVERED" | "CANCELLED";

export type AccionPreventa =
  | "editar"
  | "asignar"
  | "quitarDelReparto"
  | "entregar"
  | "noEntregado"
  | "cancelar"
  | "cobrar";

export type EfectoEntrega = "NONE" | "STOCK" | "SALE";

/**
 * ¿Se puede hacer esta acción con el pedido en este estado?
 * - Pendiente: se edita, se asigna a reparto, se entrega o se cancela.
 * - En reparto: se entrega, vuelve a pendiente ("no se pudo entregar" o
 *   quitarlo del reparto) o se cancela. No se edita: ya salió.
 * - Entregado: sólo se le registran cobros (si la entrega no fue una venta).
 * - Cancelado: no cambia más.
 */
export function accionPermitida(
  estado: EstadoPreventa,
  accion: AccionPreventa,
): boolean {
  switch (estado) {
    case "PENDING":
      return ["editar", "asignar", "entregar", "cancelar"].includes(accion);
    case "IN_DELIVERY":
      return [
        "asignar",
        "quitarDelReparto",
        "entregar",
        "noEntregado",
        "cancelar",
      ].includes(accion);
    case "DELIVERED":
      return accion === "cobrar";
    case "CANCELLED":
      return false;
  }
}

export type EstadoCobro = "PAGADO" | "PARCIAL" | "SIN_PAGO";

/** Cómo quedó pagado un pedido. Un pedido de $0 está pagado. */
export function estadoCobro(
  totalMinor: bigint,
  paidMinor: bigint,
): EstadoCobro {
  if (paidMinor >= totalMinor) return "PAGADO";
  return paidMinor > 0n ? "PARCIAL" : "SIN_PAGO";
}

/**
 * Comisión de un pedido: total × porcentaje, redondeada al centavo (mitad para
 * arriba). El porcentaje va en centésimos de punto (250 = 2,5 %).
 */
export function comisionMinor(totalMinor: bigint, rateBps: number): bigint {
  if (totalMinor <= 0n || rateBps <= 0) return 0n;
  return (totalMinor * BigInt(rateBps) + 5_000n) / 10_000n;
}

/**
 * Porcentaje que vale para un pedido: el propio (puesto a mano o el del pago
 * que lo liquidó) o, si no tiene, el que tenga hoy el preventista.
 */
export function porcentajeDelPedido(
  pedido: { commissionRateBps: number | null },
  vendedor: { commissionRateBps: number } | null | undefined,
): { rateBps: number; origen: "PEDIDO" | "PREVENTISTA" | "SIN_PORCENTAJE" } {
  if (pedido.commissionRateBps !== null)
    return { rateBps: pedido.commissionRateBps, origen: "PEDIDO" };
  const rate = vendedor?.commissionRateBps ?? 0;
  return { rateBps: rate, origen: rate > 0 ? "PREVENTISTA" : "SIN_PORCENTAJE" };
}

/** Porcentaje escrito ("2,5", "10") a centésimos de punto; null si no vale. */
export function porcentajeABps(texto: string): number | null {
  const limpio = texto.trim().replace(",", ".");
  if (!/^\d{1,3}(\.\d{1,2})?$/.test(limpio)) return null;
  const bps = Math.round(Number(limpio) * 100);
  return bps >= 0 && bps <= 10_000 ? bps : null;
}

/**
 * Cómo se reparte lo que paga el cliente al recibir el pedido: lo cobrado
 * (efectivo, transferencia o tarjeta) y lo que queda debiendo. Nunca se cobra
 * más que el total: el vuelto lo da el repartidor y no se registra.
 */
export function repartoDelCobro(
  totalMinor: bigint,
  cobradoMinor: bigint,
): { cobradoMinor: bigint; debeMinor: bigint } {
  if (cobradoMinor < 0n) throw new RangeError("Cobro negativo");
  const cobrado = cobradoMinor > totalMinor ? totalMinor : cobradoMinor;
  return { cobradoMinor: cobrado, debeMinor: totalMinor - cobrado };
}

/**
 * Precio que va a la venta al entregar un pedido. Se respeta el precio del
 * pedido, salvo que la lista haya bajado: entonces se cobra la lista (el
 * cliente nunca paga más que hoy). Devuelve el precio especial a pedir a
 * Ventas, o undefined si es el de lista.
 */
export function precioParaLaVenta(
  pedidoUnitMinor: bigint,
  listaHoyMinor: bigint,
): bigint | undefined {
  return pedidoUnitMinor < listaHoyMinor ? pedidoUnitMinor : undefined;
}

/**
 * Descuento de ofertas que pasa a la venta: el del pedido, sin superar el
 * subtotal con el precio que se cobra hoy.
 */
export function descuentoParaLaVenta(
  descuentoMinor: bigint,
  unitMinor: bigint,
  cantidad: number,
): bigint {
  const subtotal = unitMinor * BigInt(cantidad);
  return descuentoMinor > subtotal ? subtotal : descuentoMinor;
}

/** Días de visita: bit 0 = domingo ... bit 6 = sábado. */
export function diasValidos(mascara: number): boolean {
  return Number.isInteger(mascara) && mascara >= 0 && mascara <= 127;
}

/** ¿Se visita este día? (`dia` como Date.getDay(): 0 = domingo). */
export function seVisitaEl(mascara: number, dia: number): boolean {
  return (mascara & (1 << dia)) !== 0;
}

/** Día de la semana en Argentina (UTC-3, sin horario de verano). */
export function diaEnArgentina(ahora: Date): number {
  return new Date(ahora.getTime() - 3 * 60 * 60 * 1000).getUTCDay();
}

/** Coordenada válida: las dos o ninguna, dentro del rango. */
export function ubicacionValida(
  latitud: number | null | undefined,
  longitud: number | null | undefined,
): boolean {
  if (latitud == null && longitud == null) return true;
  if (latitud == null || longitud == null) return false;
  return (
    Number.isFinite(latitud) &&
    Number.isFinite(longitud) &&
    Math.abs(latitud) <= 90 &&
    Math.abs(longitud) <= 180
  );
}

export type RenglonPreventa = {
  productId: string;
  quantity: number;
  /** Precio pedido por el preventista (sólo para bajar el de lista). */
  unitPriceMinor?: string;
};

/** Junta renglones repetidos del mismo producto; el último precio pedido gana. */
export function unirRenglonesPreventa(
  renglones: readonly RenglonPreventa[],
): RenglonPreventa[] {
  const juntos = new Map<string, RenglonPreventa>();
  for (const renglon of renglones) {
    const previo = juntos.get(renglon.productId);
    juntos.set(renglon.productId, {
      productId: renglon.productId,
      quantity: (previo?.quantity ?? 0) + renglon.quantity,
      unitPriceMinor: renglon.unitPriceMinor ?? previo?.unitPriceMinor,
    });
  }
  return [...juntos.values()].filter(({ quantity }) => quantity > 0);
}

/**
 * Huella del contenido: el mismo requestId con otro contenido es otro pedido
 * y se rechaza (también al reenviar un pedido tomado sin señal).
 */
export function huellaPreventa(pedido: {
  customerId: string;
  items: readonly RenglonPreventa[];
  notes?: string | null;
}): string {
  const items = [...pedido.items]
    .sort((a, b) => a.productId.localeCompare(b.productId))
    .map(({ productId, quantity, unitPriceMinor }) => [
      productId,
      quantity,
      unitPriceMinor ?? null,
    ]);
  return createHash("sha256")
    .update(
      JSON.stringify({
        customerId: pedido.customerId,
        items,
        notes: pedido.notes?.trim() || null,
      }),
    )
    .digest("hex");
}
