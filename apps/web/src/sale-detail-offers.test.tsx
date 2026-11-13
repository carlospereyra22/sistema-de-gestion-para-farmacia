import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  AhorroDeVentaDetalle,
  DescuentoDeRenglonDetalle,
  OfertasDeVentaDetalle,
} from "./sale-detail-offers";
import { ofertasDeProducto } from "./lib/descuentos-venta";
import type { OfertaDeVentaRegistrada } from "./lib/api";

const oferta: OfertaDeVentaRegistrada = {
  offerId: "o1",
  name: "efectivo",
  label: "-15% efectivo",
  type: "PAYMENT_METHOD",
  units: 2,
  discountMinor: "232500",
  items: [
    {
      productId: "p1",
      units: 1,
      grossMinor: "1075000",
      discountMinor: "161250",
    },
    { productId: "p2", units: 1, grossMinor: "475000", discountMinor: "71250" },
  ],
};

describe("ofertas en el detalle del historial (SISTEMA-104)", () => {
  it("el globo del ahorro dice qué oferta se aplicó, su etiqueta y cuánto", () => {
    const html = renderToStaticMarkup(
      <OfertasDeVentaDetalle offers={[oferta]} />,
    );
    expect(html).toContain("Ofertas aplicadas");
    expect(html).toContain("efectivo");
    expect(html).toContain("-15% efectivo");
    expect(html).toContain("2 productos · 2 u.");
    expect(html).toMatch(/−\$\s2\.325,00/);
    expect(html).not.toContain("Total ahorrado");
  });

  it("el globo del renglón muestra lista, oferta, descuento y lo cobrado", () => {
    const html = renderToStaticMarkup(
      <DescuentoDeRenglonDetalle
        ofertas={[{ name: "efectivo", label: "-15% efectivo" }]}
        subtotalMinor={1_075_000}
        ofertasMinor={161_250}
        descuentoMinor={10_000}
        totalMinor={903_750}
      />,
    );
    expect(html).toContain("Precio de lista");
    expect(html).toMatch(/\$\s10\.750,00/);
    expect(html).toContain("-15% efectivo");
    expect(html).toMatch(/−\$\s1\.612,50/);
    expect(html).toContain("Descuento");
    expect(html).toContain("Cobrado");
    expect(html).toMatch(/\$\s9\.037,50/);
  });

  it("encuentra las ofertas de un producto", () => {
    expect(ofertasDeProducto([oferta], "p2")).toEqual([
      { name: "efectivo", label: "-15% efectivo" },
    ]);
    expect(ofertasDeProducto([oferta], "p9")).toEqual([]);
    expect(ofertasDeProducto([oferta], null)).toEqual([]);
  });

  it("el globo de la columna Ahorro dice qué oferta fue y el descuento manual", () => {
    const html = renderToStaticMarkup(
      <AhorroDeVentaDetalle
        offers={[oferta]}
        ofertasMinor={232_500}
        descuentoMinor={50_000}
      />,
    );
    expect(html).toContain("efectivo");
    expect(html).toContain("-15% efectivo");
    expect(html).toContain("Descuento");
    expect(html).toMatch(/−\$\s500,00/);
  });

  it("sin el detalle de ofertas (venta sin enviar) muestra el importe", () => {
    const html = renderToStaticMarkup(
      <AhorroDeVentaDetalle
        offers={[]}
        ofertasMinor={1000}
        descuentoMinor={0}
      />,
    );
    expect(html).toContain("Ofertas");
    expect(html).not.toContain("Descuento");
  });
});
