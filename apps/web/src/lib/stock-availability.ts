type Lot = {
  quantity: number;
  expiresAt: string | null;
  sellableQuantity?: number;
  expiredQuantity?: number;
  expiryStatus?: "EXPIRED" | "EXPIRING_SOON" | "AVAILABLE";
};

// Older responses and state retained during hot reload may lack availability fields.
export function withStockAvailability<T extends Lot>(lot: T, now = Date.now()) {
  const expires = lot.expiresAt ? new Date(lot.expiresAt).getTime() : null;
  const expired = expires !== null && expires < now;
  const status = expired
    ? "EXPIRED"
    : expires !== null && expires <= now + 90 * 86400000
      ? "EXPIRING_SOON"
      : "AVAILABLE";
  return {
    ...lot,
    sellableQuantity: lot.sellableQuantity ?? (expired ? 0 : lot.quantity),
    expiredQuantity: lot.expiredQuantity ?? (expired ? lot.quantity : 0),
    expiryStatus: lot.expiryStatus ?? status,
  };
}
