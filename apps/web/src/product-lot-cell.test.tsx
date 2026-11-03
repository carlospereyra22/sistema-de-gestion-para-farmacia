import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { ProductLotCell } from "./product-lot-cell";

const props = {
  productName: "ACTRON",
  open: false,
  controlsId: "lotes-1",
  onToggle: () => undefined,
};

it("con un solo lote muestra el número sin nada para desplegar", () => {
  const html = renderToStaticMarkup(
    <ProductLotCell {...props} lotNumber="L-100" total={1} />,
  );
  expect(html).toContain("L-100");
  expect(html).not.toContain("<button");
});

it("con varios lotes muestra el principal y +N para desplegar", () => {
  const html = renderToStaticMarkup(
    <ProductLotCell {...props} lotNumber="L-100" total={3} open />,
  );
  expect(html).toContain("L-100");
  expect(html).toContain("+2");
  expect(html).toContain('aria-expanded="true"');
  expect(html).toContain('aria-label="Ocultar 3 lotes de ACTRON"');
});

it("sin lotes muestra un guion", () => {
  const html = renderToStaticMarkup(<ProductLotCell {...props} total={0} />);
  expect(html).toContain("—");
  expect(html).not.toContain("<button");
});
