import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { ProductLotsDetail } from "./product-lots-detail";

it("muestra lote, vencimiento, unidades y estado de cada lote", () => {
  const html = renderToStaticMarkup(
    <ProductLotsDetail
      productName="ACTRON"
      lots={[
        {
          id: "1",
          number: "L-100",
          quantity: 4,
          expiresAt: "2026-10-01T00:00:00.000Z",
          expiryStatus: "EXPIRED",
          sellableQuantity: 0,
        },
        {
          id: "2",
          number: "L-200",
          quantity: 15,
          expiresAt: null,
          expiryStatus: "AVAILABLE",
          sellableQuantity: 15,
        },
      ]}
    />,
  );
  expect(html).toContain('aria-label="Lotes de ACTRON"');
  expect(html).toContain("L-100");
  expect(html).toContain("1/10/2026");
  expect(html).toContain("Vencido · no vendible");
  expect(html).toContain("Sin fecha");
  expect(html).toContain("Disponible");
  expect(html.match(/<tr>/g)).toHaveLength(3);
  expect(html).not.toContain("por los filtros");
});

it("muestra 5 lotes de entrada, ofrece ver el resto y avisa los ocultos por filtros", () => {
  const html = renderToStaticMarkup(
    <ProductLotsDetail
      productName="ACTRON"
      hidden={2}
      lots={Array.from({ length: 7 }, (_, index) => ({
        id: `${index}`,
        number: `L-${index}`,
        quantity: 1,
        expiresAt: null,
        expiryStatus: "AVAILABLE" as const,
        sellableQuantity: 1,
      }))}
    />,
  );
  expect(html.match(/<tr>/g)).toHaveLength(6);
  expect(html).toContain("L-4");
  expect(html).not.toContain("L-5");
  expect(html).toContain("Ver 2 lotes más");
  expect(html).toContain("2 lotes más no se muestran por los filtros.");
});
