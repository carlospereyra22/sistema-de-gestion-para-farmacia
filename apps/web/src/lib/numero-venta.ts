import type { Sale } from "./api";

// Número que se muestra para una venta (SISTEMA-64). Una venta con factura se
// identifica por su número de ARCA (punto-número); un ticket, por su código
// interno, que es el que imprime el ticket.

const letra = (voucherType: number) =>
  voucherType === 11 ? "C" : voucherType === 6 ? "B" : "";

const pad = (value: number, size: number) => String(value).padStart(size, "0");

export type NumeroVenta = {
  /** Lo que se muestra: "Fact. C 00001-00000007" o "7F0BCFE3". */
  texto: string;
  /** Código interno de la venta (siempre disponible para buscarla). */
  interno: string;
  /** Factura de homologación: no tiene validez fiscal. */
  prueba: boolean;
  /**
   * Ya se facturó, después de la venta (caja cerrada o comprobante interno).
   * Mientras espera la caja o si la venta se anuló, todavía no se facturó.
   */
  despues: boolean;
};

export function numeroDeVenta(
  sale: Pick<Sale, "id" | "documentType" | "fiscalTrial" | "fiscalDocuments"> &
    Partial<Pick<Sale, "status">>,
): NumeroVenta {
  const interno = sale.id.slice(0, 8).toUpperCase();
  const produccion = sale.fiscalDocuments?.[0];
  const factura = produccion ?? sale.fiscalTrial ?? undefined;
  if (sale.documentType !== "INVOICE" || !factura)
    return { texto: interno, interno, prueba: false, despues: false };
  const prueba = !produccion;
  const despues =
    Boolean(factura.deferredReason) &&
    factura.status !== "HELD" &&
    sale.status !== "CANCELLED";
  const tipo = `Fact. ${letra(factura.voucherType)}`.trim();
  if (factura.status === "AUTHORIZED" && factura.number)
    return {
      texto: `${tipo} ${pad(factura.point, 5)}-${pad(factura.number, 8)}`,
      interno,
      prueba,
      despues,
    };
  const estado =
    sale.status === "CANCELLED"
      ? "no emitida"
      : factura.status === "HELD"
        ? "en espera de caja"
        : factura.status === "REJECTED"
          ? "rechazada"
          : "pendiente";
  return { texto: `${tipo} · ${estado}`, interno, prueba, despues };
}

/**
 * ¿La venta espera que ARCA autorice su factura? Mientras haya alguna, el
 * historial se vuelve a consultar para mostrar el número apenas sale.
 */
export function facturaEnEspera(
  sale: Pick<
    Sale,
    "status" | "documentType" | "fiscalTrial" | "fiscalDocuments"
  >,
) {
  if (sale.status !== "COMPLETED" || sale.documentType !== "INVOICE")
    return false;
  const factura = sale.fiscalDocuments?.[0] ?? sale.fiscalTrial ?? undefined;
  return (
    factura?.status === "QUEUED" ||
    factura?.status === "PENDING" ||
    factura?.status === "UNCERTAIN"
  );
}

/**
 * ¿La factura de la venta recién cobrada espera a que el cobro entre a una
 * caja? Entonces la venta termina como cualquier otra: se sabe que la caja
 * está cerrada y que ARCA viene después (SISTEMA-65).
 */
export function facturaEsperaCaja(
  sale: Pick<Sale, "documentType" | "fiscalTrial" | "fiscalDocument">,
) {
  return (
    sale.documentType === "INVOICE" &&
    (sale.fiscalDocument ?? sale.fiscalTrial)?.status === "HELD"
  );
}
