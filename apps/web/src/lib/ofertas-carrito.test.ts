import { describe, expect, it } from "vitest";
import {
  detalleOfertaVenta,
  mensajeSugerencia,
  ofertasDelCarrito,
  ofertasDelProducto,
  ofertasParaEnviar,
  productosDeAplicacion,
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

  it("«No aplicar» deja el producto sin oferta", () => {
    const resultado = ofertasDelCarrito(
      [
        {
          productId: "p1",
          quantity: 3,
          listPriceMinor: 1000,
          skipOffers: true,
        },
      ],
      productos,
      [oferta({})],
      contexto,
    );
    expect(resultado.totalMinor).toBe(0);
    expect(resultado.aplicaciones).toEqual([]);
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

describe("ofertas explicadas para la cajera", () => {
  const producto = (id: string) =>
    ({
      a: { nombre: "Shampoo", precioMinor: 600000 },
      b: { nombre: "Acondicionador", precioMinor: 500000 },
    })[id];

  it("explica cada tipo en palabras", () => {
    expect(detalleOfertaVenta(oferta({}), producto).texto).toBe(
      "Llevando 3 pagás 2",
    );
    expect(
      detalleOfertaVenta(
        oferta({
          type: "NTH_UNIT_PERCENT",
          nthUnit: 2,
          percentBps: 5000,
          buyQuantity: null,
          payQuantity: null,
        }),
        producto,
      ).texto,
    ).toBe("La unidad 2 con 50% menos");
    expect(
      detalleOfertaVenta(
        oferta({
          type: "TIERED",
          buyQuantity: null,
          payQuantity: null,
          tiers: [{ minQuantity: 3, percentBps: 1500, amountMinor: null }],
        }),
        producto,
      ).texto,
    ).toBe("Desde 3: 15% menos");
  });

  it("muestra de qué está armado un combo y cuánto sale", () => {
    const detalle = detalleOfertaVenta(
      oferta({
        name: "Combo pelo",
        type: "BUNDLE",
        buyQuantity: null,
        payQuantity: null,
        bundlePriceMinor: 900000n,
        targets: [
          { kind: "PRODUCT", id: "a", exclude: false, quantity: 1 },
          { kind: "PRODUCT", id: "b", exclude: false, quantity: 2 },
        ],
      }),
      producto,
    );
    expect(detalle.texto).toBe("1 × Shampoo + 2 × Acondicionador");
    expect(detalle.combo).toEqual({
      componentes: [
        { productId: "a", nombre: "Shampoo", cantidad: 1, precioMinor: 600000 },
        {
          productId: "b",
          nombre: "Acondicionador",
          cantidad: 2,
          precioMinor: 500000,
        },
      ],
      listaMinor: 1600000,
      comboMinor: 900000,
    });
  });
});

describe("sugerencias que dicen qué gana el cliente", () => {
  it("NxM, segunda unidad, escalonada y combo", () => {
    expect(mensajeSugerencia(oferta({}), 1)).toBe(
      "Agregá 1 más y te llevás 1 gratis (3x2)",
    );
    expect(
      mensajeSugerencia(
        oferta({
          type: "NTH_UNIT_PERCENT",
          nthUnit: 2,
          percentBps: 5000,
          buyQuantity: null,
          payQuantity: null,
        }),
        1,
      ),
    ).toBe("Agregá 1 más y la unidad 2 sale 50% menos");
    expect(
      mensajeSugerencia(
        oferta({
          type: "TIERED",
          buyQuantity: null,
          payQuantity: null,
          tiers: [
            { minQuantity: 3, percentBps: 1000, amountMinor: null },
            { minQuantity: 6, percentBps: 1500, amountMinor: null },
          ],
        }),
        2,
        { enCarrito: 4 },
      ),
    ).toBe("Agregá 2 más y tenés 15% menos en cada una");
    expect(
      mensajeSugerencia(oferta({ name: "promo", type: "BUNDLE" }), 1, {
        combo: {
          faltantes: ["Shampoo"],
          ahorroMinor: 1007500,
          listaMinor: 10075000,
        },
      }),
    ).toBe("Agregá Shampoo y ahorrás $10.075 (10%) con «promo»");
  });
});

describe("productos que alcanzó una oferta (cobro)", () => {
  it("suma las unidades de cada producto y respeta el orden", () => {
    const nombres: Record<string, string> = { a: "Ibuprofeno", b: "Agua" };
    expect(
      productosDeAplicacion(
        [
          { productId: "a", units: 2 },
          { productId: "b", units: 1 },
          { productId: "a", units: 1 },
        ],
        (id) => nombres[id] ?? "Producto",
      ),
    ).toEqual([
      { nombre: "Ibuprofeno", unidades: 3 },
      { nombre: "Agua", unidades: 1 },
    ]);
  });
});
