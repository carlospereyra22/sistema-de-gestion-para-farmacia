import type { MedioPago } from "./ofertas-motor";

/**
 * Cobro con ofertas por medio de pago (SISTEMA-103). El total de la venta
 * depende de cómo se paga, así que la ventana de cobro calcula con los pagos
 * ya cargados más el importe que se está cargando.
 */
export type PagoCobro = { method: MedioPago; amountMinor: number };

const sumar = (pagos: readonly PagoCobro[]) =>
  pagos.reduce((suma, pago) => suma + pago.amountMinor, 0);

/**
 * Importe con el que `metodo` salda la venta: el que hace que lo pagado sea
 * igual al total con el descuento que corresponde a ese pago. `totalCon`
 * calcula el total de la venta con unos pagos. El descuento cambia menos que
 * el importe (es un porcentaje de una parte), así que la cuenta converge en
 * pocas vueltas.
 */
export function saldoConMedio(
  pagos: readonly PagoCobro[],
  metodo: MedioPago,
  totalCon: (pagos: readonly PagoCobro[]) => number,
): number {
  const pagado = sumar(pagos);
  let monto = Math.max(totalCon(pagos) - pagado, 0);
  for (let vuelta = 0; vuelta < 30; vuelta += 1) {
    const siguiente = Math.max(
      totalCon([...pagos, { method: metodo, amountMinor: monto }]) - pagado,
      0,
    );
    if (siguiente === monto) return monto;
    monto = siguiente;
  }
  return monto;
}

/**
 * Pagos con los que se calcula el total mientras el cobro está abierto: los
 * cargados y el que se está cargando. Sin importe escrito (o con más de lo
 * que falta, que es vuelto) cuenta lo que salda la venta.
 */
export function pagosDelCobro({
  pagos,
  metodo,
  montoEscrito,
  totalCon,
}: {
  pagos: readonly PagoCobro[];
  metodo: MedioPago;
  montoEscrito?: number;
  totalCon: (pagos: readonly PagoCobro[]) => number;
}): PagoCobro[] {
  // La cuenta corriente se carga entera al elegirla.
  if (metodo === "ACCOUNT") return [...pagos];
  const saldo = saldoConMedio(pagos, metodo, totalCon);
  const monto =
    montoEscrito === undefined ? saldo : Math.min(montoEscrito, saldo);
  return monto > 0
    ? [...pagos, { method: metodo, amountMinor: monto }]
    : [...pagos];
}
