import type { ThermalTicket } from "@gestion/contracts";
import { almacenLocal } from "./almacen-local";
import { VIGENCIA_SIN_CONEXION_MS } from "./cache-local";

// Venta cobrada sin conexión (SISTEMA-64): lo que se decide en la PC antes de
// guardarla en la bandeja. El servidor la revalida al recibirla (SISTEMA-63).

const CLAVE_PC = "gestion:pc";

/** Identificador de esta PC, para saber de dónde vino cada venta. */
export function idDeEstaPc(): string {
  try {
    const guardado = localStorage.getItem(CLAVE_PC);
    if (guardado) return guardado;
    const nuevo = crypto.randomUUID();
    localStorage.setItem(CLAVE_PC, nuevo);
    return nuevo;
  } catch {
    return crypto.randomUUID();
  }
}

let desfaseReloj = 0;

/** Ajusta la hora con la del servidor (encabezado Date de sus respuestas). */
export function registrarHoraServidor(
  encabezadoDate: string | null,
  ahora = Date.now(),
) {
  const servidor = encabezadoDate ? Date.parse(encabezadoDate) : NaN;
  if (Number.isFinite(servidor)) desfaseReloj = servidor - ahora;
}

/** Hora actual según el servidor (la de la PC puede estar mal). */
export function ahoraSegunServidor(ahora = Date.now()) {
  return new Date(ahora + desfaseReloj);
}

/** Motivo por el que no se puede cobrar sin conexión, o null si se puede. */
export function motivoParaNoVenderSinConexion(datos: {
  ultimaSincronizacion: number | undefined;
  ahora: number;
  acceso: "FULL" | "READ_ONLY" | "BLOCKED" | undefined;
  metodos: readonly string[];
}): string | null {
  if (
    !datos.ultimaSincronizacion ||
    datos.ahora - datos.ultimaSincronizacion > VIGENCIA_SIN_CONEXION_MS
  )
    return "Pasaron más de 24 horas sin conexión con el servidor. Para seguir vendiendo hace falta que vuelva internet.";
  if (datos.acceso === "READ_ONLY" || datos.acceso === "BLOCKED")
    return "La farmacia está en solo lectura o bloqueada: sin conexión no se pueden registrar ventas.";
  if (datos.metodos.includes("ACCOUNT"))
    return "La cuenta corriente sin conexión todavía no está disponible. Cobrá con otro medio o esperá a que vuelva internet.";
  return null;
}

/** Encabezado del ticket que se usó en el último ticket con conexión. */
export type EncabezadoTicket = Pick<ThermalTicket, "store" | "branch">;

const claveEncabezado = (organizationId: string, branchId: string) =>
  `encabezado|${organizationId}|${branchId}`;

export async function recordarEncabezado(
  organizationId: string,
  branchId: string,
  ticket: Pick<ThermalTicket, "store" | "branch">,
) {
  await almacenLocal().guardar(claveEncabezado(organizationId, branchId), {
    store: ticket.store,
    branch: ticket.branch,
  });
}

export function encabezadoGuardado(organizationId: string, branchId: string) {
  return almacenLocal().leer<EncabezadoTicket>(
    claveEncabezado(organizationId, branchId),
  );
}

export const LEYENDA_PROVISORIO = "COMPROBANTE PROVISORIO · SIN CONEXIÓN";

/** Ticket que se imprime al cobrar sin conexión, igual al del servidor. */
export function ticketProvisorio(datos: {
  id: string;
  occurredAt: string;
  encabezado: EncabezadoTicket;
  cajero?: string;
  cliente: string;
  lineas: {
    nombre: string;
    cantidad: number;
    unitarioMinor: number;
    descuentoMinor: number;
  }[];
  pagos: { method: string; amountMinor: number }[];
  factura: boolean;
}): ThermalTicket {
  const subtotal = datos.lineas.reduce(
    (suma, linea) => suma + linea.unitarioMinor * linea.cantidad,
    0,
  );
  const descuento = datos.lineas.reduce(
    (suma, linea) => suma + linea.descuentoMinor,
    0,
  );
  const total = subtotal - descuento;
  const pagado = datos.pagos.reduce((suma, pago) => suma + pago.amountMinor, 0);
  const efectivo = datos.pagos
    .filter((pago) => pago.method === "CASH")
    .reduce((suma, pago) => suma + pago.amountMinor, 0);
  return {
    kind: "sale",
    id: datos.id,
    number: datos.id.slice(0, 8).toUpperCase(),
    date: datos.occurredAt,
    store: datos.encabezado.store,
    branch: datos.encabezado.branch,
    cashier: datos.cajero,
    customer: datos.cliente,
    items: datos.lineas.map((linea) => ({
      name: linea.nombre,
      quantity: linea.cantidad,
      unitPriceMinor: String(linea.unitarioMinor),
      amountMinor: String(linea.unitarioMinor * linea.cantidad),
    })),
    subtotalMinor: String(subtotal),
    discountMinor: String(descuento),
    totalMinor: String(total),
    payments: datos.pagos.map((pago) => ({
      method: pago.method,
      amountMinor: String(pago.amountMinor),
    })),
    ...(efectivo > 0
      ? {
          receivedMinor: String(efectivo),
          changeMinor: String(Math.max(0, pagado - total)),
        }
      : {}),
    note: datos.factura
      ? `${LEYENDA_PROVISORIO} · La factura se emite al volver internet.`
      : LEYENDA_PROVISORIO,
  };
}
