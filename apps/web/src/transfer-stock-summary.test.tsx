import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { TransferStockSummary } from "./transfer-stock-summary";

const numeros = (html: string) =>
  [...html.matchAll(/text-2xl[^>]*>(\d+)</g)].map((m) => Number(m[1]));

describe("TransferStockSummary", () => {
  it("muestra lo que hay, lo que se envía y lo que queda", () => {
    const html = renderToStaticMarkup(
      <TransferStockSummary available={15} sending={4} />,
    );
    expect(html).toContain("En el lote");
    expect(html).toContain("Enviás");
    expect(html).toContain("Te queda");
    expect(numeros(html)).toEqual([15, 4, 11]);
    expect(html).not.toContain("queda vacío");
  });

  it("avisa cuando el lote queda vacío y nunca muestra negativos", () => {
    const html = renderToStaticMarkup(
      <TransferStockSummary available={3} sending={9} />,
    );
    expect(numeros(html)).toEqual([3, 3, 0]);
    expect(html).toContain("El lote queda vacío en esta sucursal.");
  });
});
