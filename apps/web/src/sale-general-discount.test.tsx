import { expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { SaleGeneralDiscount } from "./sale-general-discount";

it("offers percent and amount modes with an accessible input", () => {
  const html = renderToStaticMarkup(
    <SaleGeneralDiscount
      subtotalMinor={1_000_000}
      discountMinor={0}
      disabled={false}
      onApply={() => {}}
      onInvalid={() => {}}
    />,
  );
  expect(html).toContain("Descuento general");
  expect(html).toContain('aria-label="Descuento en porcentaje"');
  expect(html).toContain('aria-label="Descuento en pesos"');
  expect(html).toContain('aria-pressed="true"');
  expect(html).toContain('aria-label="Porcentaje de descuento general"');
});
