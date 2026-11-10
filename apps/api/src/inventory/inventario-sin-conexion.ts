// Inventario sin conexión (SISTEMA-79). Sin internet se puede ingresar stock,
// ajustar un lote, devolverle al proveedor y corregir un lote (número,
// vencimiento, costo). Al volver se registra en orden, una sola vez y con su
// hora real.
//
// Reglas (decisión del usuario, 10/11/2026):
// - Un ajuste de salida o una devolución que, al llegar, supera lo que queda
//   en el lote (otra PC vendió mientras tanto) se registra hasta lo que hay,
//   nunca en negativo, y queda un aviso con la diferencia.
// - Una corrección de lote no pisa un dato que otra PC cambió después.

/**
 * Lote al que se refiere la operación: por su id, o por producto y número si
 * se creó sin conexión (ingreso o recepción de compra) y todavía no tiene id.
 */
export type LoteDeLaOperacion = {
  lotId?: string;
  productId?: string;
  number?: string;
};

type Base = { clientOperationId: string; occurredAt: string; deviceId: string };

export type OperacionInventarioSinConexion = Base &
  (
    | {
        tipo: "INGRESO";
        cuerpo: {
          productId: string;
          supplierId: string | null;
          lotNumber: string;
          quantity: number;
          unitCostMinor: number;
          expiresAt?: string;
        };
      }
    | {
        tipo: "AJUSTE";
        cuerpo: {
          lote: LoteDeLaOperacion;
          quantity: number;
          reason: string;
          supplierId?: string | null;
          unitCostMinor?: number;
        };
      }
    | {
        tipo: "DEVOLUCION";
        cuerpo: {
          lote: LoteDeLaOperacion;
          supplierId: string | null;
          quantity: number;
          reason: string;
        };
      }
    | {
        tipo: "EDICION_LOTE";
        cuerpo: {
          lote: LoteDeLaOperacion;
          /** Sólo los datos que se cambiaron. */
          number?: string;
          expiresAt?: string | null;
          unitCostMinor?: string;
          reason: string;
        };
      }
  );

export const KIND_INVENTARIO = {
  INGRESO: "INVENTORY_RECEIPT",
  AJUSTE: "INVENTORY_ADJUSTMENT",
  DEVOLUCION: "INVENTORY_SUPPLIER_RETURN",
  EDICION_LOTE: "INVENTORY_LOT_EDIT",
} as const;

/**
 * Salida hecha sin conexión: se registra hasta lo que hay (nunca en
 * negativo). `falta` es lo que no se pudo registrar.
 */
export function hastaLoQueHay(pedido: number, disponible: number) {
  const registrado = Math.max(0, Math.min(pedido, disponible));
  return { registrado, falta: pedido - registrado };
}

/** Datos del lote que pidió cambiar la corrección, como los anota la auditoría. */
export function camposDelLote(cuerpo: {
  number?: string;
  expiresAt?: string | null;
  unitCostMinor?: string;
}) {
  return (["number", "expiresAt", "unitCostMinor"] as const).filter(
    (campo) => cuerpo[campo] !== undefined,
  );
}
