import { expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { StockLot } from "./lib/api";
import { SplitBoxesDialog } from "./split-boxes-dialog";
import { ReceiptOpenBoxes } from "./purchase-receipt-table";

const lote = {
  id: "l1",
  productId: "x100",
  number: "L1",
  expiresAt: "2027-05-31",
  sellableQuantity: 3,
} as StockLot;

const vinculado = [
  { id: "x10", label: "Buscapina x10", factor: 10 },
  { id: "x20", label: "Buscapina x20", factor: 5 },
  { id: "otro", label: "Buscapina suelta", factor: null },
];
const render = (lots: StockLot[], online = true, targets = vinculado) =>
  renderToStaticMarkup(
    <SplitBoxesDialog
      boxName="Buscapina x100"
      targets={targets}
      lots={lots}
      online={online}
      onSubmit={vi.fn()}
      onClose={vi.fn()}
    />,
  );

it("abre por defecto en el vínculo y muestra el resultado", () => {
  const html = render([lote]);
  expect(html).toContain("Abrir en");
  expect(html).toContain('value="10"');
  expect(html).toContain(
    "1 caja de Buscapina x100 (lote L1, vence 05/2027) → +10 Buscapina x10, mismo lote y vencimiento.",
  );
  expect(html).toContain("Abrir 1 caja");
});

it("avisa cuando no hay cajas para abrir", () => {
  expect(render([])).toContain("No hay cajas para abrir");
});

it("sin conexión deja abrir y avisa que queda en la PC", () => {
  const html = render([lote], false);
  expect(html).toContain("se guarda en la PC");
  expect(
    html.match(/<button[^>]*>(?:(?!<\/button>).)*Abrir 1 caja/)?.[0],
  ).not.toContain('disabled=""');
});

it("en la recepción muestra cuánto suma abrir cajas", () => {
  const props = {
    name: "Buscapina x100",
    index: 0,
    maximum: 3,
    factor: 10,
    targetName: "Buscapina x10",
    onChange: vi.fn(),
  };
  expect(
    renderToStaticMarkup(<ReceiptOpenBoxes {...props} value="" />),
  ).toContain("Cada caja = 10 de Buscapina x10");
  expect(
    renderToStaticMarkup(<ReceiptOpenBoxes {...props} value="2" />),
  ).toContain("+20 Buscapina x10");
  expect(
    renderToStaticMarkup(<ReceiptOpenBoxes {...props} value="5" />),
  ).toContain("Hasta 3");
});

it("con otra presentación sin número pide las unidades por caja", () => {
  const html = render([lote], true, [vinculado[2]!]);
  expect(html).toContain("Indicá cuántas unidades trae cada caja");
});

it("sin vínculo pide elegir la presentación", () => {
  expect(render([lote], true, [])).toContain(
    "Elegí en qué presentación abrir la caja.",
  );
});
