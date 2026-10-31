import { describe, expect, it } from "vitest";
import { distributeSaleDiscount } from "./sale-discount";

describe("sale discount", () => {
  it("keeps the discount on repeated updater evaluations without mutating input", () => {
    const lines = [{ subtotal: 1000000, discountMinor: 0 }];
    const update = () =>
      distributeSaleDiscount(lines, 100000, (line) => line.subtotal);
    expect(update()[0]?.discountMinor).toBe(100000);
    expect(update()[0]?.discountMinor).toBe(100000);
    expect(lines[0]?.discountMinor).toBe(0);
  });
  it("distributes exact cents without exceeding any line", () => {
    const lines = [1, 1, 1, 0].map((subtotal) => ({
      subtotal,
      discountMinor: 0,
    }));
    const result = distributeSaleDiscount(lines, 2, (line) => line.subtotal);
    expect(result.reduce((sum, line) => sum + line.discountMinor, 0)).toBe(2);
    expect(result.every((line) => line.discountMinor <= line.subtotal)).toBe(
      true,
    );
  });
  it("supports removing the discount and a full discount", () => {
    const lines = [{ subtotal: 100, discountMinor: 30 }];
    expect(
      distributeSaleDiscount(lines, 0, (line) => line.subtotal)[0]
        ?.discountMinor,
    ).toBe(0);
    expect(
      distributeSaleDiscount(lines, 100, (line) => line.subtotal)[0]
        ?.discountMinor,
    ).toBe(100);
    expect(() =>
      distributeSaleDiscount(lines, 101, (line) => line.subtotal),
    ).toThrow();
  });
});
