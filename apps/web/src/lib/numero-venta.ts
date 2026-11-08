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
};

export function numeroDeVenta(
  sale: Pick<Sale, "id" | "documentType" | "fiscalTrial" | "fiscalDocuments">,
): NumeroVenta {
  const interno = sale.id.slice(0, 8).toUpperCase();
  const produccion = sale.fiscalDocuments?.[0];
  const factura = produccion ?? sale.fiscalTrial ?? undefined;
  if (sale.documentType !== "INVOICE" || !factura)
    return { texto: interno, interno, prueba: false };
  const prueba = !produccion;
  const tipo = `Fact. ${letra(factura.voucherType)}`.trim();
  if (factura.status === "AUTHORIZED" && factura.number)
    return {
      texto: `${tipo} ${pad(factura.point, 5)}-${pad(factura.number, 8)}`,
      interno,
      prueba,
    };
  return {
    texto: `${tipo} · ${factura.status === "REJECTED" ? "rechazada" : "pendiente"}`,
    interno,
    prueba,
  };
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
