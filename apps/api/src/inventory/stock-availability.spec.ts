import { stockAvailability } from "./stock-availability";

describe("Stock availability", () => {
  const now = new Date("2026-09-09T01:00:00Z");
  it("preserves physical expired stock but excludes it from sale", () => {
    const lot = { quantity: 2, expiresAt: new Date("2026-08-25T00:00:00Z") };
    expect(stockAvailability(lot, now)).toEqual({
      sellableQuantity: 0,
      expiredQuantity: 2,
      expiryStatus: "EXPIRED",
    });
    expect(lot.quantity).toBe(2);
  });
  it("allows undated and future stock", () => {
    expect(stockAvailability({ quantity: 3, expiresAt: null }, now)).toEqual({
      sellableQuantity: 3,
      expiredQuantity: 0,
      expiryStatus: "AVAILABLE",
    });
    expect(
      stockAvailability({ quantity: 4, expiresAt: new Date("2027-01-01") }, now)
        .sellableQuantity,
    ).toBe(4);
  });
  it("warns about approaching expiration without blocking sales", () => {
    expect(
      stockAvailability(
        { quantity: 1, expiresAt: new Date("2026-10-01") },
        now,
      ),
    ).toEqual({
      sellableQuantity: 1,
      expiredQuantity: 0,
      expiryStatus: "EXPIRING_SOON",
    });
  });
  it("excludes expired lots from mixed availability", () => {
    const lots = [
      { quantity: 2, expiresAt: new Date("2026-08-25") },
      { quantity: 3, expiresAt: null },
    ];
    expect(
      lots.reduce(
        (sum, lot) => sum + stockAvailability(lot, now).sellableQuantity,
        0,
      ),
    ).toBe(3);
  });
});
