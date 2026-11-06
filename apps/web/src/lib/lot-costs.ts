import type { LotAdjustment, LotCostReceipt } from "./api";

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

export function adjustmentsByLot(adjustments: LotAdjustment[] = []) {
  const byLot = new Map<string, LotAdjustment[]>();
  for (const adjustment of adjustments)
    byLot.set(adjustment.lotId, [
      ...(byLot.get(adjustment.lotId) ?? []),
      adjustment,
    ]);
  return byLot;
}

export function supplierNamesById(
  suppliers: { id: string; name: string }[] = [],
) {
  return new Map(suppliers.map((supplier) => [supplier.id, supplier.name]));
}

export type LotReceiptRow = {
  received: string;
  cost: string;
  // Sólo en ajustes y devoluciones, que pueden no tener costo.
  adjustment?: { reason: string; returned?: boolean };
  // null: sin proveedor. Vacío en el renglón que sólo trae el costo del lote.
  supplierId?: string | null;
  supplierName?: string;
};

// El renglón "—" sólo aporta el costo del lote: no es un movimiento.
export function lotHistoryEntries(rows: LotReceiptRow[]) {
  return rows.filter((row) => row.received !== "—");
}
type StockOrigin = {
  key: string;
  name: string;
  quantity: number;
  supplier: { id: string } | null;
};
// Cada proveedor con sus movimientos. Quien ya no tiene unidades aparece igual si
// tiene historial: si no, sus movimientos quedarían sin dueño.
export function lotMovementGroups(
  origins: StockOrigin[],
  rows: LotReceiptRow[],
) {
  const entries = lotHistoryEntries(rows);
  const groups = origins.map((origin) => ({
    key: origin.key,
    name: origin.name,
    quantity: origin.quantity,
    rows: entries.filter(
      (row) => (row.supplierId ?? null) === (origin.supplier?.id ?? null),
    ),
  }));
  for (const row of entries) {
    if (groups.some((group) => group.rows.includes(row))) continue;
    const key = row.supplierId ?? "sin-proveedor";
    const group = groups.find((item) => item.key === key);
    if (group) group.rows.push(row);
    else
      groups.push({
        key,
        name: row.supplierName ?? "Sin proveedor",
        quantity: 0,
        rows: [row],
      });
  }
  return groups;
}
// Un ajuste sin costo no cuenta: vale el de lo último que entró con costo.
export function lotLastCost(rows: LotReceiptRow[]) {
  return rows.find((row) => !row.adjustment || row.cost !== "—")?.cost ?? "—";
}

const signedUnits = (quantity: number) =>
  `${quantity > 0 ? "+" : "−"}${Math.abs(quantity)} un.`;

// Un renglón por recepción y por ajuste, de lo más nuevo a lo más viejo. Sin
// recepciones registradas (por ejemplo, transferencias) queda el costo del lote.
export function lotReceiptRows(
  receipts: LotCostReceipt[] = [],
  lotCostMinor: string,
  adjustments: LotAdjustment[] = [],
  supplierNames: ReadonlyMap<string, string> = new Map(),
): LotReceiptRow[] {
  const origin = (supplierId?: string | null) => ({
    supplierId: supplierId ?? null,
    supplierName: supplierId
      ? (supplierNames.get(supplierId) ?? "Proveedor")
      : "Sin proveedor",
  });
  const dated = [
    ...receipts.map((receipt) => ({
      at: receipt.receivedAt,
      row: {
        received: `${day(receipt.receivedAt)} · ${receipt.quantity} un.`,
        cost: receipt.unitCostMinor ? money(receipt.unitCostMinor) : "Sin dato",
        ...origin(receipt.supplierId),
      } as LotReceiptRow,
    })),
    ...adjustments.map((adjustment) => ({
      at: adjustment.adjustedAt,
      row: {
        received: `${day(adjustment.adjustedAt)} · ${signedUnits(adjustment.quantity)}`,
        cost: adjustment.unitCostMinor ? money(adjustment.unitCostMinor) : "—",
        adjustment: {
          reason: adjustment.reason,
          returned: adjustment.kind === "RETURN",
        },
        ...origin(adjustment.supplierId),
      } as LotReceiptRow,
    })),
  ].sort((left, right) => right.at.localeCompare(left.at));
  const rows = dated.map((item) => item.row);
  return receipts.length
    ? rows
    : [...rows, { received: "—", cost: money(lotCostMinor) }];
}
