import { describe, expect, it } from "vitest";
import {
  ofertasDelCarrito,
  ofertasDelProducto,
  ofertasParaEnviar,
} from "./ofertas-carrito";
import type { OfertaMotor } from "./ofertas-motor";

const oferta = (parcial: Partial<OfertaMotor>): OfertaMotor => ({
  id: "o1",
  version: 3,
  name: "3x2 shampoo",
  type: "BUY_X_PAY_Y",
  status: "PUBLISHED",
  priority: 0,
  combinable: false,
  createdAt: "2026-01-01T00:00:00.000Z",
  startsAt: "2026-01-01T00:00:00.000Z",
  endsAt: null,
  weekdays: null,
  dayStartMinute: null,
  dayEndMinute: null,
  branchIds: null,
  priceListIds: null,
  productKind: "ALL",
  maxUnitsPerSale: null,
  remainingUnits: null,
  percentBps: null,
  amountMinor: null,
  fixedPriceMinor: null,
  buyQuantity: 3,
  payQuantity: 2,
  nthUnit: null,
  bundlePriceMinor: null,
  tiers: [],
  targets: [{ kind: "PRODUCT", id: "p1", exclude: false, quantity: null }],
  ...parcial,
});
const productos = [{ id: "p1", category: null, laboratory: null }];
const contexto = {
  ahora: new Date("2026-11-10T15:00:00Z"),
  branchId: "s1",
  priceListId: null,
};

describe("ofertas en el carrito", () => {
  it("avisa cuando falta 1 para completar la oferta", () => {
    const resultado = ofertasDelCarrito(
      [{ productId: "p1", quantity: 2, listPriceMinor: 1000 }],
      productos,
      [oferta({})],
      contexto,
    );
    expect(resultado.totalMinor).toBe(0);
    expect(resultado.sugerencias[0]?.mensaje).toBe("Agregá 1 más y llevás 3x2");
  });

  it("muestra el ahorro y la etiqueta en el renglón", () => {
    const resultado = ofertasDelCarrito(
      [{ productId: "p1", quantity: 3, listPriceMinor: 1000 }],
      productos,
      [oferta({})],
      contexto,
    );
    expect(resultado.porProducto.get("p1")).toEqual({
      ahorroMinor: 1000,
      labels: ["3x2"],
    });
    expect(ofertasParaEnviar(resultado.aplicaciones)).toEqual([
      {
        offerId: "o1",
        version: 3,
        items: [
          {
            productId: "p1",
            units: 3,
            grossMinor: "3000",
            discountMinor: "1000",
          },
        ],
      },
    ]);
  });

  it("el precio especial de la cajera reemplaza la oferta y los conceptos no participan", () => {
    expect(
      ofertasDelCarrito(
        [
          {
            productId: "p1",
            quantity: 3,
            listPriceMinor: 1000,
            requestedUnitPriceMinor: 900,
          },
          {
            productId: "x",
            description: "Concepto",
            quantity: 1,
            listPriceMinor: 50,
          },
        ],
        productos,
        [oferta({})],
        contexto,
      ).totalMinor,
    ).toBe(0);
  });

  it("marca los productos con oferta activa o programada de la sucursal", () => {
    const programada = oferta({
      id: "o2",
      startsAt: "2027-01-01T00:00:00.000Z",
    });
    const otraSucursal = oferta({ id: "o3", branchIds: ["s9"] });
    expect(
      ofertasDelProducto(
        productos[0]!,
        [oferta({}), programada, otraSucursal],
        contexto.ahora,
        "s1",
      ).map((item) => [item.oferta.id, item.estado]),
    ).toEqual([
      ["o1", "ACTIVA"],
      ["o2", "PROGRAMADA"],
    ]);
  });
});
