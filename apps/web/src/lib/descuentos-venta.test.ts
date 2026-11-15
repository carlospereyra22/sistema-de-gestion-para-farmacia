import { describe, expect, it } from "vitest";
import { descuentosDeRenglon, descuentosDeVenta } from "./descuentos-venta";

describe("descuentos de una venta registrada", () => {
  it("separa la parte de ofertas del descuento manual", () => {
    expect(
      descuentosDeRenglon({
        quantity: 9,
        unitPriceMinor: "1075000",
        discountMinor: "1067500",
        offerDiscountMinor: "967500",
      }),
    ).toEqual({
      subtotalMinor: 9_675_000,
      ofertasMinor: 967_500,
      descuentoMinor: 100_000,
    });
  });

  it("suma los renglones y tolera ventas viejas sin datos de ofertas", () => {
    expect(
      descuentosDeVenta([
        {
          quantity: 1,
          unitPriceMinor: "475000",
          discountMinor: "47500",
          offerDiscountMinor: "47500",
        },
        { quantity: 2, unitPriceMinor: "1000", discountMinor: "200" },
        { quantity: 1 },
      ]),
    ).toEqual({
      subtotalMinor: 477_000,
      ofertasMinor: 47_500,
      descuentoMinor: 200,
    });
  });
});
