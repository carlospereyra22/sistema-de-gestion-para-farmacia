import type {
  CashSession,
  CustomerAccount,
  Purchase,
  ReportSummary,
} from "./api";
import type { VentaPendiente } from "./bandeja-ventas";
import { argentinaSaleDate } from "./account-debt-statement";

// Inicio sin conexión (SISTEMA-86). Los KPI que dependen de lo de todas las
// PCs (ventas) parten de la copia del servidor y le suman lo de esta PC que
// todavía no se envió. Los demás (a cobrar, deuda con proveedores, cajas y
// compras por recibir) se calculan con las copias de la PC, que ya incluyen lo
// hecho sin conexión, con el mismo criterio que el servidor.

type Cuota = { dueOn: string | null; balanceMinor: string };
type Deuda = { id: string; dues: Cuota[] };

/** Ventas de hoy de esta PC (en la sucursal) que todavía no llegaron. */
export function ventasSinEnviarDeHoy(
  bandeja: readonly VentaPendiente[],
  organizationId: string,
  branchId: string,
  hoy: string,
) {
  const ventas = bandeja.filter(
    (item) =>
      !item.operacion &&
      item.estado === "PENDIENTE" &&
      item.organizationId === organizationId &&
      item.branchId === branchId &&
      argentinaSaleDate(item.occurredAt) === hoy,
  );
  return {
    count: ventas.length,
    totalMinor: ventas.reduce((s, v) => s + BigInt(v.totalMinor), 0n),
  };
}

/** Las ventas de hoy (total, comprobantes, promedio y la curva) con las de la PC. */
export function ventasConPendientes(
  resumen: ReportSummary,
  bandeja: readonly VentaPendiente[],
  organizationId: string,
  branchId: string,
  hoy: string,
): ReportSummary {
  const extra = ventasSinEnviarDeHoy(bandeja, organizationId, branchId, hoy);
  if (!extra.count) return resumen;
  const total = BigInt(resumen.salesTodayMinor) + extra.totalMinor;
  const count = resumen.salesTodayCount + extra.count;
  return {
    ...resumen,
    salesTodayMinor: total.toString(),
    salesTodayCount: count,
    averageTicketMinor: (count ? total / BigInt(count) : 0n).toString(),
    salesTrend: resumen.salesTrend?.map((dia) =>
      dia.date === hoy
        ? {
            ...dia,
            totalMinor: (BigInt(dia.totalMinor) + extra.totalMinor).toString(),
            count: dia.count + extra.count,
          }
        : dia,
    ),
  };
}

/** A cobrar en cuentas corrientes: sólo clientes con deuda (como el servidor). */
export function aCobrar(cuentas: readonly CustomerAccount[]) {
  const deudores = cuentas.filter((c) => BigInt(c.balanceMinor) > 0n);
  return {
    count: deudores.length,
    totalMinor: deudores
      .reduce((s, c) => s + BigInt(c.balanceMinor), 0n)
      .toString(),
  };
}

const masDias = (dia: string, n: number) =>
  new Date(Date.parse(`${dia}T00:00:00Z`) + n * 86400000)
    .toISOString()
    .slice(0, 10);

/**
 * Deuda con proveedores con el mismo criterio de vencimientos que Cuentas por
 * pagar: sólo cuotas con saldo.
 */
export function deudaConProveedores(deudas: readonly Deuda[], hoy: string) {
  const cuotas = deudas.flatMap((d) =>
    d.dues
      .filter((c) => BigInt(c.balanceMinor) > 0n)
      .map((c) => ({ ...c, deuda: d.id })),
  );
  const suma = (cumple: (dia: string) => boolean) =>
    cuotas
      .reduce(
        (s, c) =>
          s +
          (c.dueOn && cumple(c.dueOn.slice(0, 10))
            ? BigInt(c.balanceMinor)
            : 0n),
        0n,
      )
      .toString();
  const en7 = masDias(hoy, 7);
  return {
    count: new Set(cuotas.map((c) => c.deuda)).size,
    totalMinor: cuotas
      .reduce((s, c) => s + BigInt(c.balanceMinor), 0n)
      .toString(),
    overdueMinor: suma((d) => d < hoy),
    todayMinor: suma((d) => d === hoy),
    next7Minor: suma((d) => d > hoy && d <= en7),
    nextDueOn:
      cuotas
        .flatMap((c) => (c.dueOn ? [c.dueOn.slice(0, 10)] : []))
        .sort()[0] ?? null,
  };
}

/** Cada caja con lo que muestra la PC: abierta o no, y su efectivo esperado. */
export function cajasConPendientes(
  cajas: NonNullable<ReportSummary["cashRegisters"]>,
  sesiones: readonly CashSession[],
) {
  return cajas.map((caja) => {
    const abierta = sesiones.find(
      (s) => s.cashRegisterId === caja.id && !s.closedAt,
    );
    return {
      ...caja,
      open: Boolean(abierta),
      expectedAmountMinor: abierta ? abierta.expectedAmountMinor : null,
    };
  });
}

/** Compras por recibir: pedidas o recibidas en parte. */
export const comprasPorRecibir = (compras: readonly Purchase[]) =>
  compras.filter(
    (c) => c.status === "ORDERED" || c.status === "PARTIALLY_RECEIVED",
  ).length;
