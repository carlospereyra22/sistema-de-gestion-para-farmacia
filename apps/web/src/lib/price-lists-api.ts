const base = import.meta.env.VITE_API_URL ?? "http://localhost:3000/api/v1";
export type PriceChange = {
  productId: string;
  expectedMinor: string | null;
  amountMinor: string | null;
};
export type EffectivePrices = {
  listName: string;
  prices: { productId: string; amountMinor: string | null; source: string }[];
};
async function request<T>(
  token: string,
  organizationId: string,
  path: string,
  data?: unknown,
  method?: "PATCH",
): Promise<T> {
  const response = await fetch(
    `${base}/organizations/${organizationId}/catalog/${path}`,
    {
      method: method ?? (data === undefined ? "GET" : "POST"),
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      ...(data === undefined ? {} : { body: JSON.stringify(data) }),
    },
  );
  const result = await response.json();
  if (!response.ok)
    throw new Error(
      typeof result.message === "string"
        ? result.message
        : "No se pudo actualizar la lista.",
    );
  return result as T;
}
export const getEffectivePrices = (
  token: string,
  org: string,
  customerId: string,
  priceListId = "",
) =>
  request<EffectivePrices>(
    token,
    org,
    `effective-prices?${new URLSearchParams({ ...(customerId ? { customerId } : {}), ...(priceListId ? { priceListId } : {}) })}`,
  );
export const saveListChanges = (
  token: string,
  org: string,
  listId: string,
  requestId: string,
  changes: PriceChange[],
) =>
  request(token, org, `price-lists/${listId}/changes`, { requestId, changes });
export const renamePriceList = (
  token: string,
  org: string,
  listId: string,
  name: string,
  fallbackPriceListId?: string | null,
) =>
  request(
    token,
    org,
    `price-lists/${listId}`,
    { name, fallbackPriceListId },
    "PATCH",
  );
export const previewListIncrease = (
  token: string,
  org: string,
  listId: string,
  productIds: string[],
  mode: "PERCENT" | "FIXED",
  value: number,
) =>
  request<(PriceChange & { name: string })[]>(
    token,
    org,
    `price-lists/${listId}/preview`,
    { productIds, mode, value },
  );

export function parsePrice(value: string): string | null {
  const normalized = value.trim().replace(",", ".");
  if (!/^\d{1,10}(\.\d{1,2})?$/.test(normalized)) return null;
  const [whole = "0", decimal = ""] = normalized.split(".");
  const result = BigInt(whole) * 100n + BigInt(decimal.padEnd(2, "0"));
  return result <= 999999999999n ? result.toString() : null;
}

export function parsePriceAdjustment(value: string): number | null {
  const text = value.trim();
  const amount = parsePrice(text.replace(/^[+-]/, ""));
  return amount === null
    ? null
    : Number(amount) * (text.startsWith("-") ? -1 : 1);
}
