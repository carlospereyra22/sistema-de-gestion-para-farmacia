import type { CatalogProduct, StockLot } from "./api";
import type { AccountDueRow } from "./account-due-dates";
export type WorkspaceAlert = {
  id: string;
  title: string;
  detail: string;
  category: "accounts" | "stock";
  urgent: boolean;
};
export function accountAlerts(rows: AccountDueRow[]): WorkspaceAlert[] {
  return rows
    .filter(
      (row) =>
        row.status === "OVERDUE" &&
        row.pendingMinor !== null &&
        BigInt(row.pendingMinor) > 0n,
    )
    .sort(
      (a, b) =>
        b.daysOverdue - a.daysOverdue || a.saleId.localeCompare(b.saleId),
    )
    .map((row) => ({
      id: `due:${row.saleId}`,
      title: `${row.customerName} · cuenta vencida`,
      detail: `Venta ${row.saleId.slice(0, 8)} · ${row.daysOverdue} día${row.daysOverdue === 1 ? "" : "s"} de atraso · ${(Number(row.pendingMinor) / 100).toLocaleString("es-AR", { style: "currency", currency: "ARS" })} pendiente`,
      category: "accounts",
      urgent: true,
    }));
}
export function stockAlerts(
  products: Pick<CatalogProduct, "id" | "name" | "active">[],
  lots: StockLot[],
  minimum: number,
): WorkspaceAlert[] {
  const alerts: WorkspaceAlert[] = [];
  const active = new Set(
    products.filter((product) => product.active).map((product) => product.id),
  );
  const quantities = new Map<string, number>();
  for (const lot of lots)
    quantities.set(
      lot.productId,
      (quantities.get(lot.productId) ?? 0) + lot.sellableQuantity,
    );
  for (const product of products.filter((product) => product.active)) {
    const quantity = quantities.get(product.id) ?? 0;
    if (quantity <= minimum)
      alerts.push({
        id: `stock:${product.id}`,
        title: product.name,
        detail:
          quantity === 0
            ? "Sin stock disponible para vender."
            : `Stock bajo: ${quantity} unidades disponibles · mínimo de aviso ${minimum}.`,
        category: "stock",
        urgent: quantity === 0,
      });
  }
  for (const lot of lots) {
    if (
      !active.has(lot.productId) ||
      lot.quantity <= 0 ||
      lot.expiryStatus === "AVAILABLE"
    )
      continue;
    alerts.push({
      id: `expiry:${lot.id}`,
      title: lot.productName,
      detail: `Lote ${lot.number} · ${lot.expiryStatus === "EXPIRED" ? "vencido" : "vence dentro de 90 días"}${lot.expiresAt ? ` · ${lot.expiresAt.slice(0, 10).split("-").reverse().join("/")}` : ""}.`,
      category: "stock",
      urgent: lot.expiryStatus === "EXPIRED",
    });
  }
  return alerts.sort(
    (a, b) =>
      Number(b.urgent) - Number(a.urgent) || a.title.localeCompare(b.title),
  );
}
