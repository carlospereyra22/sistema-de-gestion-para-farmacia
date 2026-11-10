// Transferencias sin conexión (SISTEMA-71). Sin internet se puede preparar,
// despachar y recibir lo que ya estaba en tránsito. Lo que salió físicamente de
// la sucursal es definitivo: al sincronizar se registra aunque el stock haya
// cambiado mientras tanto, sin dejar nunca un lote en negativo.

export type TipoOperacionTransferencia = "PREPARAR" | "DESPACHAR" | "RECIBIR";

export const KIND_TRANSFERENCIA: Record<TipoOperacionTransferencia, string> = {
  PREPARAR: "TRANSFER_CREATE",
  DESPACHAR: "TRANSFER_DISPATCH",
  RECIBIR: "TRANSFER_RECEIVE",
};

/**
 * Renglón de una transferencia: un lote conocido por su id, o por producto y
 * número (un lote recibido sin conexión, que la PC todavía no conoce por id).
 */
export type RenglonTransferencia = {
  lotId?: string;
  productId?: string;
  lotNumber?: string;
  quantity: number;
};

type Base = {
  /** Id de la operación en la PC; al preparar también es la clave de la transferencia. */
  clientOperationId: string;
  occurredAt: string;
  deviceId: string;
};

/** Operación de transferencia hecha sin conexión, con el cuerpo de su tipo. */
export type OperacionTransferenciaSinConexion = Base &
  (
    | {
        tipo: "PREPARAR";
        cuerpo: {
          destinationBranchId: string;
          items: RenglonTransferencia[];
        };
      }
    | {
        tipo: "DESPACHAR";
        /** Id de la transferencia o la clave con que se preparó sin conexión. */
        cuerpo: { transferId: string };
      }
    | {
        tipo: "RECIBIR";
        /** Sólo una que ya estaba en tránsito cuando había conexión. */
        cuerpo: { transferId: string };
      }
  );

/**
 * Cuánto se descuenta del lote al despachar. Con conexión no puede faltar; sin
 * conexión la mercadería ya salió, así que el lote queda en cero y lo que falta
 * se informa para revisar el origen.
 */
export function descuentoDeDespacho(enLote: number, enviado: number) {
  const descontar = Math.max(0, Math.min(enLote, enviado));
  return { descontar, faltan: enviado - descontar };
}
