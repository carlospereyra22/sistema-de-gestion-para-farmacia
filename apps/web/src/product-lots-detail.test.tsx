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

it("con receipts suma Recibido y Costo, con un renglón por recepción", () => {
  const lots = [
    {
      id: "1",
      number: "L-100",
      quantity: 4,
      expiresAt: null,
      expiryStatus: "AVAILABLE" as const,
      sellableQuantity: 4,
    },
  ];
  const html = renderToStaticMarkup(
    <ProductLotsDetail
      productName="ACTRON"
      lots={lots}
      receipts={() => [
        { received: "5/11/2026 · 1 un.", cost: "$ 700,00" },
        { received: "1/11/2026 · 10 un.", cost: "$ 0,00" },
      ]}
    />,
  );
  expect(html).toContain("Costo por unidad");
  expect(html).toContain("En stock");
  expect(html).toContain("Recibido");
  expect(html.indexOf("Recibido")).toBeLessThan(html.indexOf("Vence"));
  expect(html).toContain("5/11/2026 · 1 un.");
  expect(html).toContain("1/11/2026 · 10 un.");
  expect(html).toContain('rowSpan="2"');
  expect(
    renderToStaticMarkup(
      <ProductLotsDetail productName="ACTRON" lots={lots} />,
    ),
  ).not.toContain("Recibido");
});

const mixedLot = {
  id: "3",
  number: "L-300",
  quantity: 42,
  expiresAt: null,
  expiryStatus: "AVAILABLE" as const,
  sellableQuantity: 42,
  suppliers: [
    { id: "a", name: "juan", quantity: 41 },
    { id: "b", name: "carlos", quantity: 1 },
  ],
};

it("separa las unidades de cada proveedor con su propia acción", () => {
  const html = renderToStaticMarkup(
    <ProductLotsDetail
      productName="ACTRON"
      lots={[mixedLot]}
      actions={() => null}
      supplierActions={(_lot, supplier) => (
        <button>Devolver a {supplier?.name}</button>
      )}
    />,
  );
  expect(html).toContain(">41</td>");
  expect(html).toContain(">1</td>");
  expect(html).toContain("Devolver a juan");
  expect(html).toContain("Devolver a carlos");
});

it("muestra el stock sin proveedor para que los números sumen", () => {
  const html = renderToStaticMarkup(
    <ProductLotsDetail
      productName="ACTRON"
      lots={[
        {
          ...mixedLot,
          suppliers: [
            { id: "a", name: "juan", quantity: 1 },
            { id: "b", name: "carlos", quantity: 1 },
          ],
          unassignedQuantity: 40,
        },
      ]}
      actions={() => null}
      supplierActions={(_lot, supplier) => (
        <button>Devolver {supplier?.name ?? "sin proveedor"}</button>
      )}
    />,
  );
  expect(html).toContain("Sin proveedor");
  expect(html).toContain(">40</td>");
  expect(html).toContain("Devolver sin proveedor");
});

it("con un solo proveedor lo muestra debajo del lote", () => {
  const html = renderToStaticMarkup(
    <ProductLotsDetail
      productName="ACTRON"
      lots={[{ ...mixedLot, suppliers: [mixedLot.suppliers[0]!] }]}
    />,
  );
  expect(html).toContain("juan · 41 un.");
});
