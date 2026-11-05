import type { LotCostReceipt } from "./api";

const money = (minor: string) =>
  new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS" }).format(
    Number(minor) / 100,
  );

const day = (value: string) =>
  new Date(value).toLocaleDateString("es-AR", {
    timeZone: "America/Argentina/Buenos_Aires",
  });

// Un lote con varios costos también se puede desplegar aunque sea el único. Se
// cuenta cuando alguna recepción no tiene dato: no se sabe si costó lo mismo.
export function lotHasManyCosts(receipts: LotCostReceipt[] = []) {
  if (receipts.length < 2) return false;
  return (
    new Set(receipts.map((receipt) => receipt.unitCostMinor)).size > 1 ||
    receipts[0]!.unitCostMinor === null
  );
}

export type LotReceiptRow = { received: string; cost: string };

// Un renglón por recepción, de la más nueva a la más vieja. Sin recepciones
// registradas (por ejemplo, transferencias) queda el costo del lote.
export function lotReceiptRows(
  receipts: LotCostReceipt[] = [],
  lotCostMinor: string,
): LotReceiptRow[] {
  if (!receipts.length) return [{ received: "—", cost: money(lotCostMinor) }];
  return receipts.map((receipt) => ({
    received: `${day(receipt.receivedAt)} · ${receipt.quantity} un.`,
    cost: receipt.unitCostMinor ? money(receipt.unitCostMinor) : "Sin dato",
  }));
}
