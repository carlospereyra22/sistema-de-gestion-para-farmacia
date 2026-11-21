import { useRef, useState } from "react";
import { getSaleTicket, type NotaCredito } from "./lib/api";
import { ticketNotaInterna } from "./lib/nota-credito";
import { trialTicket } from "./lib/fiscal-trial-ticket";
import { thermalTicketHtml } from "./lib/thermal-ticket";
import { printTicketFrame } from "./lib/browser-ticket-print";

/**
 * Imprime una nota de crédito por el navegador (SISTEMA-110): la C con el
 * ticket fiscal; la interna con el encabezado del comprobante de la venta.
 * Devuelve la función y el marco oculto que hay que dibujar.
 */
export function useImpresionNota({
  token,
  organizationId,
  branchId,
  onError,
}: {
  token: string;
  organizationId: string;
  branchId: string;
  onError: (mensaje: string) => void;
}) {
  const frame = useRef<HTMLIFrameElement>(null);
  // La clave cambia en cada impresión: así se puede reimprimir la misma nota.
  const [impresion, setImpresion] = useState({ html: "", vez: 0 });
  const imprimir = async (nota: NotaCredito) => {
    const html = nota.fiscal
      ? trialTicket(nota.fiscal)
      : thermalTicketHtml(
          ticketNotaInterna(
            nota,
            await getSaleTicket(token, organizationId, branchId, nota.saleId),
          ),
          "",
        );
    setImpresion((actual) => ({ html, vez: actual.vez + 1 }));
  };
  const marco = impresion.html ? (
    <iframe
      key={impresion.vez}
      ref={frame}
      title="Impresión de la nota de crédito"
      srcDoc={impresion.html}
      className="pointer-events-none fixed -left-[9999px] top-0 h-px w-[80mm]"
      onLoad={() => {
        if (frame.current)
          void printTicketFrame(frame.current).catch((cause: unknown) =>
            onError(
              cause instanceof Error ? cause.message : "No se pudo imprimir.",
            ),
          );
      }}
    />
  ) : null;
  return { imprimir, marco };
}
