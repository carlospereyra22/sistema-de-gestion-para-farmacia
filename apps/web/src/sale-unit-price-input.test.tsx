import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import {
  SaleUnitCostDetails,
  SaleUnitPriceInput,
} from "./sale-unit-price-input";

it("offers an accessible decimal input styled like the subtotal without a list-price title", () => {
  const html = renderToStaticMarkup(
    <SaleUnitPriceInput
      price={400000}
      maximum={405500}
      name="Actron"
      disabled={false}
      onCommit={vi.fn()}
      onInvalid={vi.fn()}
      onScan={vi.fn()}
      onFinished={vi.fn()}
    />,
  );
  expect(html).toContain('aria-label="Precio unitario de Actron"');
  expect(html).toContain('inputMode="decimal"');
  expect(html).toContain('value="4.000,00"');
  expect(html).not.toContain("title=");
  expect(html).toContain("sale-unit-price-display");
  expect(html).not.toContain("disabled");
});
it("shows actual unit costs separately by lot, including zero", () => {
  const html = renderToStaticMarkup(
    <SaleUnitCostDetails
      costs={[
        { id: "a", number: "123", unitCostMinor: "123456" },
        { id: "b", number: "456", unitCostMinor: "0" },
      ]}
    />,
  );
  expect(html).toContain("Lote 123");
  expect(html).toContain("<strong>Costo</strong>");
  expect(html).not.toContain("Costo por unidad de stock");
  expect(html).toContain("1.234,56");
  expect(html).toContain("Lote 456");
  expect(html).toContain("0,00");
});
it("does not invent a cost when no sellable lot is available", () => {
  expect(renderToStaticMarkup(<SaleUnitCostDetails costs={[]} />)).toContain(
    "Sin costo disponible",
  );
});
it("locks the price during confirmation or price loading", () => {
  const html = renderToStaticMarkup(
    <SaleUnitPriceInput
      price={100}
      maximum={100}
      name="Producto"
      disabled
      onCommit={vi.fn()}
      onInvalid={vi.fn()}
      onScan={vi.fn()}
      onFinished={vi.fn()}
    />,
  );
  expect(html).toContain('disabled=""');
});
