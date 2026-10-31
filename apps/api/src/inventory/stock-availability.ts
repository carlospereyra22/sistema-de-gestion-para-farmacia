export function stockAvailability(
  lot: { quantity: number; expiresAt: Date | null },
  now = new Date(),
) {
  const expired = lot.expiresAt !== null && lot.expiresAt < now;
  const expiringSoon =
    !expired &&
    lot.expiresAt !== null &&
    lot.expiresAt.getTime() <= now.getTime() + 90 * 86400000;
  return {
    sellableQuantity: expired ? 0 : lot.quantity,
    expiredQuantity: expired ? lot.quantity : 0,
    expiryStatus: expired
      ? ("EXPIRED" as const)
      : expiringSoon
        ? ("EXPIRING_SOON" as const)
        : ("AVAILABLE" as const),
  };
}
