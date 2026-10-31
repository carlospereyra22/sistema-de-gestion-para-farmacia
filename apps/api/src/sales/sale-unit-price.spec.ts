import { saleUnitPrice } from "./sale-unit-price";
describe("special unit price", () => {
  it("preserves list prices unless an explicit discount was requested", () => {
    expect(saleUnitPrice(405500n, undefined)).toBe(405500n);
    expect(saleUnitPrice(405500n, 400000, "405500")).toBe(400000n);
    expect(saleUnitPrice(405500n, 405500, "405500")).toBe(405500n);
    expect(saleUnitPrice(405500n, 0, "405500")).toBe(0n);
  });
  it.each([-1, 405501, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])(
    "rejects invalid overrides: %s",
    (value) => {
      expect(() => saleUnitPrice(405500n, value, "405500")).toThrow();
    },
  );
  it("requires the current authoritative list price", () => {
    expect(() => saleUnitPrice(405500n, 400000)).toThrow("precio cambió");
    expect(() => saleUnitPrice(405500n, 400000, "400000")).toThrow(
      "precio cambió",
    );
  });
});
