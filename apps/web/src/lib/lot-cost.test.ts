import { expect, it } from "vitest";
import { lotCostInput, lotCostMinor, typedCostMinor } from "./lot-cost";

it("prefills and converts lot cost exactly, including zero and cents", () => {
  expect(lotCostInput("12345678901234")).toBe("123456789012,34");
  expect(lotCostMinor("123456789012,34")).toBe("12345678901234");
  expect(lotCostMinor("0")).toBe("0");
  expect(lotCostMinor("0.01")).toBe("1");
  expect(lotCostMinor(" 700,5 ")).toBe("70050");
});

it("convierte el costo escrito con puntos de miles sin pasar por float", () => {
  expect(typedCostMinor("1.000,50")).toBe("100050");
  expect(typedCostMinor("1.234.567")).toBe("123456700");
  expect(typedCostMinor("19,99")).toBe("1999");
  expect(typedCostMinor("0,")).toBe("0");
});

it.each(["", "-1", "1.001", "1.000,00", "1e3", "NaN", "1000000000000"])(
  "rejects invalid or ambiguous cost %s",
  (value) => {
    expect(() => lotCostMinor(value)).toThrow();
  },
);
