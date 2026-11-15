import { expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { CatalogProduct } from "./lib/api";
import { SplitLinkOptions, SplitLinkToggle } from "./split-link-fields";

const producto = (id: string, name: string, presentation: string) =>
  ({
    id,
    name,
    presentation,
    laboratory: { id: "opella", name: "Opella" },
    active: true,
  }) as CatalogProduct;
const caja = producto("x100", "BUSCAPINA DUO", "comp.rec.x 100");
const blister = producto("x10", "BUSCAPINA DUO", "blíster comp.rec.x 10");

const render = (targetId: string, factor: string) =>
  renderToStaticMarkup(
    <SplitLinkOptions
      enabled
      product={caja}
      products={[caja, blister]}
      targetId={targetId}
      factor={factor}
      disabled={false}
      onEnabled={vi.fn()}
      onTarget={vi.fn()}
      onFactor={vi.fn()}
    />,
  );

it("muestra la tarjeta para activar la opción", () => {
  const html = renderToStaticMarkup(
    <SplitLinkToggle enabled={false} disabled={false} onEnabled={vi.fn()} />,
  );
  expect(html).toContain("Se abre en unidades");
});

it("sugiere el blíster con su número cuando no hay producto elegido", () => {
  const html = render("", "");
  expect(html).toContain("Sugerido:");
  expect(html).toContain("BUSCAPINA DUO · blíster comp.rec.x 10 · 10 por caja");
});

it("con el producto elegido no sugiere y no agrega texto de ayuda", () => {
  const html = render("x10", "10");
  expect(html).not.toContain("Sugerido:");
  expect(html).toContain("Producto que se arma al abrir");
  expect(html).not.toContain("guardar no cambia");
});

it("no muestra opciones con la casilla apagada", () => {
  expect(
    renderToStaticMarkup(
      <SplitLinkOptions
        enabled={false}
        product={caja}
        products={[caja, blister]}
        targetId=""
        factor=""
        disabled={false}
        onEnabled={vi.fn()}
        onTarget={vi.fn()}
        onFactor={vi.fn()}
      />,
    ),
  ).toBe("");
});
