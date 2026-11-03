import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import type { Purchase } from "./lib/api";
import { PurchaseRowActions } from "./purchase-row-actions";

const purchase: Purchase = {
  id: "compra-1",
  reference: "C-123",
  createdAt: "2026-11-02",
  supplierId: "proveedor-1",
  status: "ORDERED",
  items: [],
};

function render(
  status: Purchase["status"],
  continuing = false,
  closedAt?: string,
) {
  return renderToStaticMarkup(
    <PurchaseRowActions
      purchase={{ ...purchase, status, closedAt }}
      continuing={continuing}
      busy={false}
      onReceive={() => undefined}
      onDetail={() => undefined}
      onCancel={() => undefined}
    />,
  );
}

it("ofrece recepción y un menú de acciones para compras pendientes", () => {
  const html = render("ORDERED");
  expect(html).toContain("Recibir");
  expect(html).toContain('aria-label="Más acciones de la compra C-123"');
  expect(html).toContain('aria-expanded="false"');
});

it("continúa el borrador de recepción desde la acción principal", () => {
  expect(render("PARTIALLY_RECEIVED", true)).toContain("Continuar recepción");
});

it("muestra sólo el detalle cuando la compra ya no admite recepción", () => {
  for (const html of [
    render("RECEIVED"),
    render("PARTIALLY_RECEIVED", false, "2026-11-02"),
  ]) {
    expect(html).toContain("Ver detalle");
    expect(html).not.toContain("Más acciones de la compra");
    expect(html.match(/<button/g)).toHaveLength(1);
  }
});
