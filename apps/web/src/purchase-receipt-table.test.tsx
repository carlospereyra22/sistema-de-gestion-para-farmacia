import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import type { Purchase } from "./lib/api";
import { PurchaseReceiptTable } from "./purchase-receipt-table";

const items: Purchase["items"] = [
  {
    id: "linea-1",
    productId: "producto-1",
    orderedQuantity: 20,
    receivedQuantity: 5,
    unitCostMinor: "1000",
  },
];

it("muestra cantidades y varios lotes en filas de la recepción", () => {
  const html = renderToStaticMarkup(
    <PurchaseReceiptTable
      token="test-token"
      organizationId="test-organization"
      items={items}
      products={[]}
      lots={[
        {
          key: "lote-1",
          itemId: "linea-1",
          quantity: "7",
          lotNumber: "A1",
          expiresAt: "2027-04-01",
        },
        {
          key: "lote-2",
          itemId: "linea-1",
          quantity: "8",
          lotNumber: "B2",
          expiresAt: "2027-05-01",
        },
      ]}
      search=""
      onLotsChange={() => undefined}
      onAddLot={() => undefined}
    />,
  );

  expect(html).toContain("<table");
  expect(html).toContain("Pendiente");
  expect(html).toContain("Cant. ordenada");
  expect(html).toContain("Lote adicional");
  expect(html).toContain('title="Sin foto"');
  expect(html).toContain("25% recibido");
  expect(html).toContain(
    'aria-label="Cantidad que recibo de Producto histórico, lote 1"',
  );
  expect(html).toContain(
    'aria-label="Cantidad que recibo de Producto histórico, lote 2"',
  );
  expect(html).toContain("Agregar lote a Producto histórico");
  expect(html).toContain("Ya recibida");
  expect(html).toContain("Cant. recibida");
  expect(html).not.toContain("Recibir (un.)");
  // Los dos lotes ya cubren el pendiente: no hay nada que completar.
  expect(html).not.toContain("Recibir el máximo");
});

it("ofrece completar con el máximo mientras falte cantidad", () => {
  const html = renderToStaticMarkup(
    <PurchaseReceiptTable
      token="test-token"
      organizationId="test-organization"
      items={items}
      products={[]}
      lots={[
        {
          key: "lote-1",
          itemId: "linea-1",
          quantity: "",
          lotNumber: "",
          expiresAt: "",
        },
      ]}
      search=""
      onLotsChange={() => undefined}
      onAddLot={() => undefined}
    />,
  );

  expect(html).toContain(
    'aria-label="Recibir el máximo de Producto histórico, lote 1"',
  );
  expect(html).toContain('title="Completar con 15"');
});
