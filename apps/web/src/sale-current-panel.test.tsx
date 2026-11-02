import { expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { SaleCurrentPanel } from "./sale-current-panel";

const render = (lineCount: number, checkoutDisabled = false) =>
  renderToStaticMarkup(
    <SaleCurrentPanel
      lineCount={lineCount}
      unitCount={lineCount ? 4 : 0}
      totalMinor={1_707_000}
      submitting={false}
      checkoutDisabled={checkoutDisabled}
      context={<span>Cliente</span>}
      lines={<div>Líneas</div>}
      discount={<span>Descuento general</span>}
      onClear={() => {}}
      onCheckout={() => {}}
    />,
  );

it("summarizes the cart and shows a single large total with Cobrar", () => {
  const html = render(3);
  expect(html).toContain("Venta actual");
  expect(html).toContain("3 productos en el carrito · 4 unidades");
  expect(html).toContain("Total a cobrar (4 unidades)");
  expect(html.match(/text-\[28px\]/g)).toHaveLength(1);
  expect(html).toContain("Cobrar");
  expect(html).toContain("Ctrl + Enter");
  expect(html).toContain("Vaciar venta");
});

it("invites to start and disables Cobrar on an empty sale", () => {
  const html = render(0, true);
  expect(html).toContain("Agregá productos para comenzar");
  expect(html).not.toContain("Vaciar venta");
  expect(html).toMatch(
    /<button type="button" disabled=""[^>]*sale-checkout-button/,
  );
});
