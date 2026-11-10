import type { PayableInput } from "./payable-rules";
import type { PaymentInput } from "./payment-rules";

// Cuentas por pagar sin conexión (SISTEMA-73). Sin internet se registran
// deudas, pagos y anulaciones de pagos. Al volver se mandan en orden y una sola
// vez, con su hora real. Lo que choca con lo que hizo otra PC se registra con
// aviso "a revisar", salvo una deuda exactamente repetida, que se rechaza.

export type TipoOperacionPagar = "DEUDA" | "PAGO" | "ANULAR";

export const KIND_PAGAR: Record<TipoOperacionPagar, string> = {
  DEUDA: "PAYABLE_CREATE",
  PAGO: "PAYABLE_PAYMENT",
  ANULAR: "PAYABLE_PAYMENT_VOID",
};

type Base = {
  clientOperationId: string;
  occurredAt: string;
  deviceId: string;
};

/** Operación de cuentas por pagar hecha sin conexión, con el cuerpo de su tipo. */
export type OperacionPagarSinConexion = Base &
  (
    | { tipo: "DEUDA"; cuerpo: PayableInput }
    | {
        tipo: "PAGO";
        /** Id de la deuda o su clave (una cargada sin conexión o de una recepción). */
        invoiceId: string;
        cuerpo: PaymentInput;
      }
    | {
        tipo: "ANULAR";
        invoiceId: string;
        /** Id del pago o su clave (un pago cargado sin conexión). */
        paymentId: string;
        cuerpo: { reason: string };
      }
  );

type Deuda = {
  issuedOn: Date;
  amountMinor: bigint;
  dues: { dueOn: Date | null; amountMinor: bigint }[];
};

const fecha = (d: Date | null) => d?.toISOString().slice(0, 10) ?? null;

/**
 * ¿Es exactamente la misma deuda? Mismo comprobante (eso ya lo dice el
 * duplicado), misma emisión, mismo importe y los mismos vencimientos. Es la
 * misma factura cargada dos veces: no se registra de nuevo (decisión del
 * usuario, 10/11/2026).
 */
export function esLaMismaDeuda(existente: Deuda, nueva: Deuda) {
  const vencimientos = (d: Deuda) =>
    d.dues
      .map((v) => `${fecha(v.dueOn) ?? "-"}:${v.amountMinor}`)
      .sort()
      .join("|");
  return (
    fecha(existente.issuedOn) === fecha(nueva.issuedOn) &&
    existente.amountMinor === nueva.amountMinor &&
    vencimientos(existente) === vencimientos(nueva)
  );
}

/**
 * Cuánto de un pago hecho sin conexión se registra: hasta lo que se debe al
 * llegar. Lo que sobra no se registra y queda como aviso (decisión del
 * usuario, 10/11/2026).
 */
export function pagoHastaElSaldo(pago: bigint, saldo: bigint) {
  const registrar = pago < saldo ? pago : saldo > 0n ? saldo : 0n;
  return { registrar, sobra: pago - registrar };
}
