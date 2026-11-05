import { createRef } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { InventoryLotPicker } from "./inventory-lot-picker";
import type { StockLot } from "./lib/api";

const lot = {
  id: "lote-1",
  productId: "p",
  productName: "Aceite Capilar",
  number: "test 2",
  quantity: 400,
  sellableQuantity: 400,
  expiredQuantity: 0,
  expiryStatus: "AVAILABLE",
  expiresAt: "2027-05-18T00:00:00.000Z",
  unitCostMinor: "100",
  metadataVersion: 0,
} satisfies StockLot;
const option = {
  value: "p",
  label: "Aceite Capilar",
  detail: "100 ml",
  searchText: "Aceite Capilar",
};

const render = (productId: string, lotId: string) =>
  renderToStaticMarkup(
    <InventoryLotPicker
      stock={[lot]}
      productOptions={[option]}
      productId={productId}
      lotId={lotId}
      onProductChange={() => {}}
      onLotChange={() => {}}
      lotInputRef={createRef<HTMLInputElement>()}
    />,
  );

it("separa producto y lote, y bloquea el lote hasta elegir el producto", () => {
  const html = render("", "");
  expect(html).toContain(">Producto</label>");
  expect(html).toContain(">Lote</label>");
  expect(html).not.toContain("Producto y lote");
  expect(html).toContain('placeholder="Elegí primero el producto"');
  expect(html).toContain('disabled=""');
});

it("con el producto elegido habilita el lote", () => {
  const html = render("p", "");
  expect(html).toContain('placeholder="Elegí un lote"');
  expect(html).not.toContain('disabled=""');
});

it("muestra el lote elegido con sus unidades y vencimiento", () => {
  const html = render("p", "lote-1");
  expect(html).toContain('value="Lote test 2"');
  expect(html).toContain("400 un. · Vence 18/5/2027");
});
