import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ProductLotRow, ProductLotsDetail } from "./product-lots-detail";

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

it("con receipts muestra una fila por lote, con el detalle cerrado", () => {
  const html = renderToStaticMarkup(
    <ProductLotsDetail
      productName="ACTRON"
      lots={[mixedLot]}
      receipts={() => receiptRows}
    />,
  );
  expect(html.indexOf("Stock actual")).toBeLessThan(html.indexOf("Historial"));
  expect(html).toContain("Último costo");
  expect(html).toContain("Total 42");
  expect(html).toContain("2 movimientos");
  expect(html).toContain("$ 700,00");
  expect(html).not.toContain("juan");
  expect(html).not.toContain("+4 un.");
  expect(html.match(/<tr/g)).toHaveLength(2);
  expect(html).toContain('aria-expanded="false"');
  expect(
    renderToStaticMarkup(
      <ProductLotsDetail productName="ACTRON" lots={[mixedLot]} />,
    ),
  ).not.toContain("Historial");
});

const receiptRows = [
  {
    received: "6/11/2026 · +4 un.",
    cost: "—",
    adjustment: { reason: "Conteo" },
    supplierId: "b",
    supplierName: "carlos",
  },
  {
    received: "5/11/2026 · 1 un.",
    cost: "$ 700,00",
    supplierId: "a",
    supplierName: "juan",
  },
];

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

describe("fila de un lote con recepciones", () => {
  const render = (props: Partial<Parameters<typeof ProductLotRow>[0]> = {}) =>
    renderToStaticMarkup(
      <table>
        <tbody>
          <ProductLotRow
            lot={mixedLot}
            rows={receiptRows}
            open={false}
            onToggle={() => {}}
            {...props}
          />
        </tbody>
      </table>,
    );

  it("un solo control abre todo el detalle", () => {
    expect(render().match(/aria-expanded/g)).toHaveLength(1);
    expect(render({ open: true })).toContain(
      'aria-label="Ocultar detalle del lote L-300"',
    );
  });
  it("abierta deja cada movimiento en el bloque de su proveedor", () => {
    const html = render({ open: true });
    expect(html.match(/<tr/g)).toHaveLength(3);
    expect(html.indexOf(">juan<")).toBeLessThan(
      html.indexOf("5/11/2026 · 1 un."),
    );
    expect(html.indexOf("5/11/2026 · 1 un.")).toBeLessThan(
      html.indexOf(">carlos<"),
    );
    expect(html.indexOf(">carlos<")).toBeLessThan(
      html.indexOf("6/11/2026 · +4 un."),
    );
  });
  it("muestra el ajuste con su motivo", () => {
    const html = render({ open: true });
    expect(html.match(/Ajuste/g)).toHaveLength(1);
    expect(html).toContain('aria-label="Motivo del ajuste"');
    expect(html).toContain("Conteo");
  });
  it("identifica las devoluciones y su motivo", () => {
    const html = render({
      open: true,
      rows: [
        {
          received: "6/11/2026 · −10 un.",
          cost: "—",
          adjustment: { reason: "Vencido", returned: true },
          supplierId: "a",
          supplierName: "juan",
        },
      ],
    });
    expect(html).toContain("Devolución");
    expect(html).not.toContain("Ajuste");
    expect(html).toContain('aria-label="Motivo de la devolución"');
    expect(html).toContain("Vencido");
  });
  it("con un solo proveedor la fila cerrada dice el total y no el proveedor", () => {
    const html = render({
      lot: { ...mixedLot, quantity: 5, suppliers: [mixedLot.suppliers[0]!] },
    });
    expect(html).toContain("Total 5");
    expect(html).not.toContain("juan");
  });
  it("el último costo ignora los ajustes", () => {
    expect(render()).toContain("$ 700,00");
  });
  it("usa singular y no despliega lo que no existe", () => {
    expect(render({ rows: [receiptRows[1]!] })).toContain("1 movimiento<");
    const html = render({
      lot: { ...mixedLot, suppliers: [] },
      rows: [{ received: "—", cost: "$ 999,00" }],
    });
    expect(html).toContain("Sin movimientos");
    expect(html).toContain("$ 999,00");
    expect(html).not.toContain("aria-expanded");
  });
});

it("en Inventario oculta el proveedor sin unidades y su acción", () => {
  const html = renderToStaticMarkup(
    <ProductLotsDetail
      productName="ACTRON"
      lots={[
        {
          ...mixedLot,
          suppliers: [
            { id: "a", name: "juan", quantity: 0 },
            { id: "b", name: "carlos", quantity: 2 },
          ],
          unassignedQuantity: 40,
        },
      ]}
      actions={() => null}
      supplierActions={(_lot, supplier) => (
        <button>Devolver a {supplier?.name ?? "nadie"}</button>
      )}
    />,
  );
  expect(html).not.toContain("juan");
  expect(html).toContain("Devolver a carlos");
  expect(html).toContain("Devolver a nadie");
});

it("con un solo origen lo muestra debajo del lote", () => {
  const html = renderToStaticMarkup(
    <ProductLotsDetail
      productName="ACTRON"
      lots={[
        {
          ...mixedLot,
          suppliers: [{ id: "a", name: "juan", quantity: 0 }],
          unassignedQuantity: 34,
        },
      ]}
    />,
  );
  expect(html).toContain("Sin proveedor · 34 un.");
  expect(html).not.toContain("juan");
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
