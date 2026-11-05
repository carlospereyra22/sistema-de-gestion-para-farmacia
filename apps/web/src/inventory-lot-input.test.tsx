import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { InventoryLotInput } from "./inventory-lot-input";
import type { StockLot } from "./lib/api";

const lot = {
  id: "1",
  productId: "p",
  productName: "Loratadina",
  number: "ABC-1",
  quantity: 12,
  sellableQuantity: 12,
  expiredQuantity: 0,
  expiryStatus: "AVAILABLE",
  expiresAt: "2027-05-30T00:00:00.000Z",
  unitCostMinor: "100",
  metadataVersion: 0,
} satisfies StockLot;

const render = (value: string, lots: StockLot[], productSelected = true) =>
  renderToStaticMarkup(
    <InventoryLotInput
      value={value}
      lots={lots}
      productSelected={productSelected}
      onChange={() => {}}
      onPick={() => {}}
    />,
  );

it("invita a elegir un lote o escribir uno nuevo cuando el producto tiene lotes", () => {
  const html = render("", [lot]);
  expect(html).toContain("Número de lote");
  expect(html).toContain('role="combobox"');
  expect(html).toContain("Elegí un lote o escribí uno nuevo");
  expect(html).toContain("required");
});

it("avisa qué pasa al recibir sobre un lote existente", () => {
  const html = render("ABC-1", [lot]);
  expect(html).toContain("Lote existente (12 un.)");
  expect(html).toContain("las unidades se suman");
  expect(html).not.toContain("Lote nuevo.");
});

it("marca como nuevo un número que el producto no tiene", () => {
  expect(render("XYZ", [lot])).toContain("Lote nuevo.");
});

it("usa el número exacto, igual que la API", () => {
  expect(render("abc-1", [lot])).toContain("Lote nuevo.");
});

it("no opina sobre el lote si todavía no hay producto elegido", () => {
  const html = render("XYZ", [], false);
  expect(html).not.toContain("Lote nuevo.");
  expect(html).not.toContain("Lote existente");
});
