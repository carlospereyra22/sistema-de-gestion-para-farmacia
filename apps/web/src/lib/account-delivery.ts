import type { AccountItems } from "./api";

export function parseAccountDelivery(value: string): number | null {
  const text = value.trim();
  if (!text || text.length > 30) return null;
  let normalized = text;
  if (/^\d{1,3}(\.\d{3})+(,\d{1,2})?$/.test(text))
    normalized = text.replace(/\./g, "").replace(",", ".");
  else if (/^\d+(,\d{1,2})?$/.test(text)) normalized = text.replace(",", ".");
  else if (!/^\d+\.\d{1,2}$/.test(text)) return null;
  const [whole, fraction = ""] = normalized.split(".");
  const minor = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"));
  return minor > 0n && minor <= BigInt(Number.MAX_SAFE_INTEGER)
    ? Number(minor)
    : null;
}

// A draft suggestion only. The existing receipt endpoint revalidates every
// allocation and the account balance inside its serializable transaction.
export function prepareAccountDelivery(data: AccountItems, value: string) {
  const amountMinor = parseAccountDelivery(value);
  if (amountMinor === null)
    throw new Error("Ingresá un importe válido mayor a cero.");
  if (data.unassignedReceipts.length || data.mixedSales.length)
    throw new Error(
      "Primero conciliá los cobros y compras anteriores para preparar una entrega.",
    );
  const balance = BigInt(data.balanceMinor);
  const amount = BigInt(amountMinor);
  if (amount > balance)
    throw new Error("La entrega no puede superar el saldo pendiente.");
  const items = data.items.filter((item) => BigInt(item.pendingMinor) > 0n);
  if (
    items.reduce((sum, item) => sum + BigInt(item.pendingMinor), 0n) !==
      balance ||
    new Set(items.map((item) => item.saleItemId)).size !== items.length
  ) {
    throw new Error(
      "El detalle no coincide con el saldo. Actualizá la cuenta y revisá las asignaciones.",
    );
  }
  if (
    items.some(
      (item) => !item.createdAt || !Number.isFinite(Date.parse(item.createdAt)),
    )
  )
    throw new Error(
      "Faltan fechas de algunas ventas. Elegí los artículos manualmente.",
    );
  const ordered = [...items].sort(
    (a, b) =>
      Date.parse(a.createdAt!) - Date.parse(b.createdAt!) ||
      a.saleId.localeCompare(b.saleId) ||
      a.saleItemId.localeCompare(b.saleItemId),
  );
  let remaining = amount;
  const chosen: Record<string, string> = {};
  for (const item of ordered) {
    if (remaining === 0n) break;
    const pending = BigInt(item.pendingMinor);
    const applied = remaining < pending ? remaining : pending;
    chosen[item.saleItemId] =
      `${applied / 100n}.${String(applied % 100n).padStart(2, "0")}`;
    remaining -= applied;
  }
  return {
    chosen,
    amountMinor,
    balanceAfterMinor: (balance - amount).toString(),
  };
}
