import type { ThermalTicket } from "@gestion/contracts";
import type { FiscalTrial, NotaCredito, NotasCreditoVenta } from "./api";

// Vista previa de la nota de crédito (SISTEMA-110). El servidor calcula los
// importes de verdad; esto sólo muestra cuánto se va a devolver.

type Renglon = NotasCreditoVenta["items"][number];

/**
 * Importe de devolver `cantidad` unidades de un renglón, con el descuento de la
 * venta prorrateado por acumulado (igual que el servidor).
 */
export function importeRenglon(item: Renglon, cantidad: number): bigint {
  if (cantidad <= 0 || item.quantity <= 0) return 0n;
  const vendidas = BigInt(item.quantity);
  const previo = BigInt(item.quantity - item.available);
  const neto =
    BigInt(item.unitPriceMinor) * vendidas - BigInt(item.discountMinor);
  return (
    (neto * (previo + BigInt(cantidad))) / vendidas - (neto * previo) / vendidas
  );
}

/** Cantidad elegida por renglón de la venta. */
export type Seleccion = Record<string, number>;

/** Toda la venta: lo que queda sin devolver de cada renglón. */
export function todaLaVenta(items: Renglon[]): Seleccion {
  return Object.fromEntries(
    items
      .filter((item) => item.available > 0)
      .map((item) => [item.id, item.available]),
  );
}

export function totalSeleccion(items: Renglon[], seleccion: Seleccion) {
  return items.reduce(
    (total, item) => total + importeRenglon(item, seleccion[item.id] ?? 0),
    0n,
  );
}

/**
 * Renglones a pedir. "Vuelve al stock" se elige para toda la nota y se aplica
 * a lo que se puede reponer (no a conceptos ni a renglones sin lote).
 */
export function renglonesPedido(
  items: Renglon[],
  seleccion: Seleccion,
  alStock: boolean,
) {
  return items.flatMap((item) => {
    const cantidad = Math.min(seleccion[item.id] ?? 0, item.available);
    if (cantidad <= 0) return [];
    return [
      {
        saleItemId: item.id,
        quantity: cantidad,
        reponer: alStock && item.puedeReponer,
      },
    ];
  });
}

export const METODOS_DEVOLUCION = [
  { value: "CASH", label: "Efectivo" },
  { value: "CARD", label: "Tarjeta" },
  { value: "TRANSFER", label: "Transferencia" },
] as const;

export function metodoDevolucion(method: NotaCredito["refundMethod"]) {
  return (
    METODOS_DEVOLUCION.find((metodo) => metodo.value === method)?.label ??
    "Sin devolución en plata"
  );
}

/** Estado del comprobante fiscal de la nota, en palabras. */
export function estadoFiscal(fiscal: FiscalTrial): {
  texto: string;
  tono: "bien" | "atencion" | "error";
} {
  switch (fiscal.status) {
    case "AUTHORIZED":
      return { texto: "Autorizada por ARCA", tono: "bien" };
    case "REJECTED":
      return { texto: "Rechazada por ARCA", tono: "error" };
    case "QUEUED":
      return { texto: "En cola para ARCA", tono: "atencion" };
    default:
      return { texto: "Esperando respuesta de ARCA", tono: "atencion" };
  }
}

export function tituloTipo(tipo: NotasCreditoVenta["tipo"]) {
  return tipo === "INTERNA"
    ? "Nota de crédito interna"
    : tipo === "FACTURA_PRUEBA"
      ? "Nota de crédito C · prueba"
      : "Nota de crédito C";
}

/** Ticket de una nota interna, con el encabezado del comprobante de la venta. */
export function ticketNotaInterna(
  nota: NotaCredito,
  venta: ThermalTicket,
): ThermalTicket {
  return {
    kind: "credit",
    id: nota.id,
    number: nota.id.slice(0, 8).toUpperCase(),
    date: nota.createdAt,
    store: venta.store,
    branch: venta.branch,
    cashier: venta.cashier,
    customer: venta.customer,
    items: nota.items.map((item) => ({
      name: item.name,
      quantity: item.quantity,
      unitPriceMinor: (
        BigInt(item.amountMinor) / BigInt(Math.max(1, item.quantity))
      ).toString(),
      amountMinor: item.amountMinor,
    })),
    totalMinor: nota.totalMinor,
    payments: [
      ...(BigInt(nota.refundMinor) > 0n
        ? [
            {
              method: nota.refundMethod ?? "CASH",
              amountMinor: nota.refundMinor,
            },
          ]
        : []),
      ...(BigInt(nota.accountMinor) > 0n
        ? [{ method: "ACCOUNT", amountMinor: nota.accountMinor }]
        : []),
    ],
    note: `Comprobante de la venta #${venta.number} · Motivo: ${nota.reason}`,
  };
}

/** Número que se muestra: el de ARCA si la C ya lo tiene, si no el interno. */
export function comprobanteNota(nota: NotaCredito) {
  const codigo = nota.id.slice(0, 8).toUpperCase();
  if (!nota.fiscal) return { texto: "Nota interna", codigo, prueba: false };
  const prueba = nota.fiscal.environment === "HOMOLOGATION";
  return {
    texto: nota.fiscal.number
      ? `NC C ${String(nota.fiscal.point).padStart(5, "0")}-${String(nota.fiscal.number).padStart(8, "0")}`
      : "NC C · sin número",
    codigo,
    prueba,
  };
}

export type TonoEstado = "bien" | "atencion" | "error" | "neutro";

/** Estado corto para la tabla. */
export function estadoNota(nota: NotaCredito): {
  texto: string;
  tono: TonoEstado;
} {
  if (!nota.fiscal) return { texto: "Interna", tono: "neutro" };
  switch (nota.fiscal.status) {
    case "AUTHORIZED":
      return { texto: "Autorizada", tono: "bien" };
    case "REJECTED":
      return { texto: "Rechazada", tono: "error" };
    case "QUEUED":
      return { texto: "En cola", tono: "atencion" };
    default:
      return { texto: "Esperando ARCA", tono: "atencion" };
  }
}

export const CLASES_TONO: Record<TonoEstado, string> = {
  bien: "bg-emerald-100 text-emerald-700",
  atencion: "bg-amber-100 text-amber-800",
  error: "bg-rose-100 text-rose-700",
  neutro: "bg-slate-100 text-slate-600",
};

/** Cómo se devolvió: plata, cuenta corriente o las dos. */
export function resumenDevolucion(nota: NotaCredito) {
  const partes = [
    ...(BigInt(nota.refundMinor) > 0n
      ? [metodoDevolucion(nota.refundMethod)]
      : []),
    ...(BigInt(nota.accountMinor) > 0n ? ["Cuenta corriente"] : []),
  ];
  return partes.join(" + ") || "—";
}

/** Unidades devueltas y qué pasó con la mercadería. */
export function mercaderiaNota(nota: NotaCredito) {
  const unidades = nota.items.reduce((total, item) => total + item.quantity, 0);
  const repuestas = nota.items
    .filter((item) => item.restocked)
    .reduce((total, item) => total + item.quantity, 0);
  return {
    unidades,
    texto:
      repuestas === 0
        ? "Quedó apartada"
        : repuestas === unidades
          ? "Volvió al stock"
          : `${repuestas} volvieron al stock`,
  };
}

/**
 * Opciones del filtro de cliente de los historiales: Todos, Público general y
 * los clientes por nombre.
 */
export function opcionesClientes(clientes: { id: string; name: string }[]) {
  return [
    { value: "", label: "Todos" },
    { value: "SIN_CLIENTE", label: "Público general" },
    ...[...clientes]
      .sort((a, b) => a.name.localeCompare(b.name, "es"))
      .map((cliente) => ({ value: cliente.id, label: cliente.name })),
  ];
}
