import { describe, expect, it } from "vitest";
import { LOW_STOCK_UNITS, stockLevel } from "./stock-level";

describe("stock level", () => {
  it("marks zero or negative sellable stock as out", () => {
    expect(stockLevel(0)).toBe("out");
    expect(stockLevel(-2)).toBe("out");
  });
  it("marks one up to the threshold as low", () => {
    expect(stockLevel(1)).toBe("low");
    expect(stockLevel(LOW_STOCK_UNITS)).toBe("low");
  });
  it("marks stock above the threshold as ok", () => {
    expect(stockLevel(LOW_STOCK_UNITS + 1)).toBe("ok");
  });
});
