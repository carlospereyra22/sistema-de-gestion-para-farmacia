import type { ThermalTicket } from "@gestion/contracts";
import type { Sale } from "./api";
import type { VentaPendiente } from "./bandeja-ventas";

// Historial completo aunque no haya internet (SISTEMA-66): lo que el servidor
// ya tenía (copia local) más lo vendido en la PC que todavía no llegó.

/** Venta del historial; \`porEnviar\` si está guardada en la PC sin enviar. */
export type VentaDelHistorial = Sale & {
  porEnviar?: boolean;
  /** Comprobante provisorio guardado en la PC, para reimprimirlo. */
  ticketLocal?: ThermalTicket;
};

type CuerpoGuardado = {
  customerId?: string;
  items?: {
    productId?: string | null;
    description?: string;
    quantity: number;
    discountMinor?: number | string;
    unitPriceMinor?: number | string;
    expectedUnitPriceMinor?: number | string;
  }[];
  payments?: {
    method: Sale["payments"][number]["method"];
    amountMinor: number;
  }[];
};

export function comoVentaDelHistorial(
  venta: VentaPendiente,
): VentaDelHistorial {
  const cuerpo = venta.cuerpo as CuerpoGuardado;
  return {
    id: venta.id,
    documentType: venta.documentType,
    customerId: cuerpo.customerId ?? null,
    status: "COMPLETED",
    totalMinor: venta.totalMinor,
    completedAt: venta.occurredAt,
    items: (cuerpo.items ?? []).map((item, indice) => ({
      id: `${venta.id}-${indice}`,
      productId: item.productId ?? null,
      description: item.description ?? null,
      quantity: item.quantity,
      unitPriceMinor: String(
        item.expectedUnitPriceMinor ?? item.unitPriceMinor ?? "0",
      ),
      discountMinor: String(item.discountMinor ?? 0),
    })),
    payments: (cuerpo.payments ?? []).map((pago) => ({
      method: pago.method,
      amountMinor: String(pago.amountMinor),
    })),
    porEnviar: true,
    ticketLocal: venta.ticket,
  };
}

/**
 * Suma al historial las ventas de la PC (de cualquier usuario) que todavía no
 * llegaron al servidor, de la sucursal elegida. Una que ya llegó no se repite.
 */
export function historialConPendientes(
  historial: readonly Sale[],
  bandeja: readonly VentaPendiente[],
  organizationId: string,
  branchId: string,
): VentaDelHistorial[] {
  const registradas = new Set(historial.map((venta) => venta.id));
  const pendientes = bandeja
    .filter(
      (venta) =>
        // Sólo ventas: las operaciones de caja no van al historial.
        venta.operacion !== "CAJA" &&
        venta.estado !== "ENVIADA" &&
        venta.organizationId === organizationId &&
        venta.branchId === branchId &&
        !registradas.has(venta.id),
    )
    .map(comoVentaDelHistorial);
  return [...pendientes, ...historial].sort((a, b) =>
    (b.completedAt ?? "").localeCompare(a.completedAt ?? ""),
  );
}
