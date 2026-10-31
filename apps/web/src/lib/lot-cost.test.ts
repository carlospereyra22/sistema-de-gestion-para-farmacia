import { expect, it } from "vitest";
import { lotCostInput, lotCostMinor } from "./lot-cost";

it("prefills and converts lot cost exactly, including zero and cents", () => {
  expect(lotCostInput("12345678901234")).toBe("123456789012,34");
  expect(lotCostMinor("123456789012,34")).toBe("12345678901234");
  expect(lotCostMinor("0")).toBe("0");
  expect(lotCostMinor("0.01")).toBe("1");
  expect(lotCostMinor(" 700,5 ")).toBe("70050");
});

it.each(["", "-1", "1.001", "1.000,00", "1e3", "NaN", "1000000000000"])(
  "rejects invalid or ambiguous cost %s",
  (value) => {
    expect(() => lotCostMinor(value)).toThrow();
  },
);
