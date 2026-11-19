import { expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { CatalogProduct } from "./lib/api";
import { SaleProductDetail } from "./sale-product-detail";

const omeprazol = {
  id: "p1",
  name: "Omeprazol 20 mg x 14 cáps.",
  isMedication: true,
  activeIngredient: "Omeprazol",
  concentration: "20 mg",
  pharmaceuticalForm: "Cápsulas",
  presentation: "Caja x 14",
  barcodes: [{ code: "SG000000001006", primary: true }],
  prices: [{ amountMinor: "578000" }],
  image: null,
} as unknown as CatalogProduct;

const render = (product: CatalogProduct | undefined, available: number) =>
  renderToStaticMarkup(
    <SaleProductDetail
      token="t"
      organizationId="o"
      product={product}
      available={available}
      quantity={1}
      onQuantityChange={() => {}}
      onAdd={() => {}}
      onClear={() => {}}
      onFinished={() => {}}
      onInvalid={() => {}}
    />,
  );

const addButton = (html: string) =>
  html.match(/<button(?:(?!<button)[^])*?Agregar/)?.[0] ?? "";

it("invites to choose a product when nothing is selected", () => {
  expect(render(undefined, 0)).toContain(
    "Elegí un producto de la lista o escaneá un código.",
  );
});

it("shows the chosen product with quantity and shortcuts", () => {
  const html = render(omeprazol, 41);
  expect(html).toContain("20 mg · Caja x 14 · SG000000001006 · 41 disponibles");
  expect(html).toContain(
    'aria-label="Cantidad de Omeprazol 20 mg x 14 cáps. a agregar"',
  );
  expect(addButton(html)).not.toContain('disabled=""');
  expect(html).toContain("<kbd");
});

it("does not allow adding a product without sellable stock", () => {
  const html = render(omeprazol, 0);
  expect(html).toContain("Sin stock vendible");
  expect(addButton(html)).toContain('disabled=""');
});

it("avisa cuántas unidades del producto ya están en la venta", () => {
  const html = renderToStaticMarkup(
    <SaleProductDetail
      token="t"
      organizationId="o"
      product={omeprazol}
      available={41}
      quantity={1}
      enVenta={2}
      junto={<span>pastillas</span>}
      onQuantityChange={() => {}}
      onAdd={() => {}}
      onClear={() => {}}
      onFinished={() => {}}
      onInvalid={() => {}}
    />,
  );
  expect(html).toContain("· 2 en la venta");
  expect(html).toContain("pastillas");
  expect(render(omeprazol, 41)).not.toContain("en la venta");
});
