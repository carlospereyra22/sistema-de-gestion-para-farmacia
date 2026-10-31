import { expect, it } from "vitest";
import { withStockAvailability } from "./stock-availability";
const now = Date.parse("2026-09-09T00:00:00Z");
it("keeps undated stock sellable in older responses", () => {
  expect(
    withStockAvailability({ quantity: 65, expiresAt: null }, now),
  ).toMatchObject({
    sellableQuantity: 65,
    expiredQuantity: 0,
    expiryStatus: "AVAILABLE",
  });
});
it("excludes expired units without hiding their physical quantity", () => {
  expect(
    withStockAvailability({ quantity: 2, expiresAt: "2026-08-25" }, now),
  ).toMatchObject({ quantity: 2, sellableQuantity: 0, expiredQuantity: 2 });
});
it("preserves authoritative zero availability", () => {
  expect(
    withStockAvailability(
      { quantity: 5, expiresAt: null, sellableQuantity: 0 },
      now,
    ).sellableQuantity,
  ).toBe(0);
});
it("keeps future lots available", () => {
  expect(
    withStockAvailability({ quantity: 3, expiresAt: "2026-10-01" }, now),
  ).toMatchObject({ sellableQuantity: 3, expiryStatus: "EXPIRING_SOON" });
});
