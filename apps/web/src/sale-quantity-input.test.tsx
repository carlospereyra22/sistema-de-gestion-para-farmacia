import { expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { SaleQuantityInput } from "./sale-quantity-input";
import { parseSaleQuantity, isQuantityScannerBurst } from "./lib/sale-quantity";
it("accepts direct large quantities within available stock", () => {
  expect(
    isQuantityScannerBurst(
      { text: "7791234567890", start: 100, last: 160 },
      170,
    ),
  ).toBe(true);
  expect(
    isQuantityScannerBurst(
      { text: "SG123456789012", start: 100, last: 170 },
      180,
    ),
  ).toBe(true);
  expect(
    isQuantityScannerBurst({ text: "1000", start: 100, last: 130 }, 140),
  ).toBe(false);
  expect(
    isQuantityScannerBurst({ text: "12345678", start: 100, last: 2000 }, 2010),
  ).toBe(false);
  expect(
    isQuantityScannerBurst(
      { text: "7791234567890", start: 100, last: 160 },
      2000,
    ),
  ).toBe(false);
  expect(parseSaleQuantity("1000", 2000)).toBe(1000);
  expect(parseSaleQuantity("1000", 41)).toBeNull();
  for (const value of ["", "0", "-1", "1.5", "1e3", "abc"])
    expect(parseSaleQuantity(value, 2000)).toBeNull();
});
it("renders an editable named input, not a quantity label", () => {
  const html = renderToStaticMarkup(
    <SaleQuantityInput
      quantity={10}
      maximum={2000}
      name="Ketorolac"
      onCommit={() => {}}
      onInvalid={() => {}}
    />,
  );
  expect(html).toContain('aria-label="Cantidad de Ketorolac"');
  expect(html).toContain('value="10"');
  expect(html).toContain('inputMode="numeric"');
  expect(html).not.toContain('role="alert"');
});
