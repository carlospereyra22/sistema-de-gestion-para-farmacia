import type { SaleFiscalCapabilities } from "@gestion/contracts";
import type { Sale } from "./api";

// Mandar a ARCA una venta hecha con comprobante interno (SISTEMA-65). La web
// sólo anticipa lo que va a validar el servidor, que es quien decide.

export const DIAS_PARA_FACTURAR = 30;
const DIA_MS = 24 * 60 * 60 * 1000;

/** Por qué no se puede enviar la venta a ARCA, o null si se puede. */
export function motivoParaNoEnviarAArca(
  sale: Pick<Sale, "status" | "documentType" | "completedAt">,
  capabilities: SaleFiscalCapabilities | null | undefined,
  ahora: number,
): string | null {
  if (sale.status !== "COMPLETED") return "La venta está anulada.";
  if (sale.documentType !== "INTERNAL") return "La venta ya tiene factura.";
  if (
    sale.completedAt &&
    ahora - Date.parse(sale.completedAt) > DIAS_PARA_FACTURAR * DIA_MS
  )
    return `Pasaron más de ${DIAS_PARA_FACTURAR} días desde la venta: ya no se puede enviar a ARCA.`;
  if (!capabilities?.voucherTypes.length)
    return (
      capabilities?.reason ||
      "Configurá la facturación para enviar ventas a ARCA."
    );
  return null;
}
