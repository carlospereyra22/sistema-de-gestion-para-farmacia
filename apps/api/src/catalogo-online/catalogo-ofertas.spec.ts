import type { OfertaMotor } from "../offers/ofertas-motor";
import {
  detalleOferta,
  etiquetaCatalogo,
  mensajeSugerencia,
  etiquetaCorta,
  preciosConOferta,
  ofertasDeLaCompra,
  ofertasDelProducto,
} from "./catalogo-ofertas";

const base: OfertaMotor = {
  id: "o1",
  version: 1,
  name: "Oferta",
  type: "PERCENT",
  status: "PUBLISHED",
  priority: 0,
  combinable: false,
  createdAt: "2026-11-01T00:00:00.000Z",
  startsAt: "2026-11-01T00:00:00.000Z",
  endsAt: null,
  weekdays: null,
  dayStartMinute: null,
  dayEndMinute: null,
  branchIds: null,
  priceListIds: null,
  productKind: "ALL",
  maxUnitsPerSale: null,
  remainingUnits: null,
  percentBps: 1000,
  amountMinor: null,
  fixedPriceMinor: null,
  buyQuantity: null,
  payQuantity: null,
  nthUnit: null,
  bundlePriceMinor: null,
  tiers: [],
  targets: [
    { kind: "PRODUCT", id: "omeprazol", exclude: false, quantity: null },
  ],
};

const escalones: OfertaMotor = {
  ...base,
  id: "o2",
  type: "TIERED",
  percentBps: null,
  tiers: [
    { minQuantity: 4, percentBps: 500, amountMinor: null },
    { minQuantity: 2, percentBps: 300, amountMinor: null },
  ],
};

const contexto = {
  ahora: new Date("2026-11-15T15:00:00Z"),
  branchId: "central",
  priceListId: "general",
};
const omeprazol = {
  productId: "omeprazol",
  categoryId: null,
  laboratoryId: null,
  isMedication: false,
};

describe("catálogo online: ofertas", () => {
  it("muestra todos los escalones en la etiqueta y en el detalle", () => {
    expect(etiquetaCatalogo(escalones)).toBe("x2 → 3% | x4 → 5%");
    expect(detalleOferta(escalones)).toEqual([
      "Llevando 2 o más: 3% de descuento",
      "Llevando 4 o más: 5% de descuento",
    ]);
  });

  it("explica las demás en una frase", () => {
    expect(
      detalleOferta({
        ...base,
        type: "BUY_X_PAY_Y",
        buyQuantity: 3,
        payQuantity: 2,
      }),
    ).toEqual(["Llevando 3 pagás 2"]);
    expect(
      detalleOferta({
        ...base,
        type: "NTH_UNIT_PERCENT",
        nthUnit: 2,
        percentBps: 5000,
      }),
    ).toEqual(["La 2da unidad con 50% de descuento"]);
  });

  it("sólo las vigentes que tocan al producto y con unidades disponibles", () => {
    const otra = {
      ...base,
      id: "o3",
      targets: [
        {
          kind: "PRODUCT" as const,
          id: "otro",
          exclude: false,
          quantity: null,
        },
      ],
    };
    const agotada = { ...base, id: "o4", remainingUnits: 0 };
    const otraSucursal = { ...base, id: "o5", branchIds: ["norte"] };
    expect(
      ofertasDelProducto(
        [base, escalones, otra, agotada, otraSucursal],
        omeprazol,
        contexto,
      ).map((o) => o.id),
    ).toEqual(["o1", "o2"]);
  });

  it("las de toda la compra van aparte, no en la tarjeta", () => {
    const desde = {
      ...base,
      id: "o6",
      type: "SPEND_THRESHOLD" as const,
      allProducts: true,
      targets: [],
      minPurchaseMinor: 10_000_000n,
    };
    expect(ofertasDelProducto([desde], omeprazol, contexto)).toEqual([]);
    expect(ofertasDeLaCompra([desde], contexto).map((o) => o.id)).toEqual([
      "o6",
    ]);
  });

  it("en escalones el aviso habla del escalón siguiente", () => {
    const original = { faltan: 1, mensaje: "Agregá 1 más y llevás 2+ -3%" };
    expect(mensajeSugerencia(escalones, original, 3)).toBe(
      "Agregá 1 más y llevás 5% de descuento",
    );
    expect(mensajeSugerencia(base, original, 3)).toBe(original.mensaje);
  });

  it("la etiqueta corta se entiende sola", () => {
    expect(etiquetaCorta(base)).toBe("-10%");
    expect(etiquetaCorta(escalones)).toBe("Llevando 2: -3%");
    expect(
      etiquetaCorta({
        ...base,
        type: "BUY_X_PAY_Y",
        buyQuantity: 3,
        payQuantity: 2,
      }),
    ).toBe("3x2");
  });

  it("calcula el precio con oferta con el motor", () => {
    // 10 % sobre $1.000: una unidad queda en $900.
    expect(preciosConOferta(base, omeprazol, 100_000n, contexto)).toEqual({
      precioOfertaMinor: "90000",
    });
    // Escalón: llevando 2, cada una con 3 % menos.
    expect(preciosConOferta(escalones, omeprazol, 100_000n, contexto)).toEqual({
      porCantidad: { cantidad: 2, precioUnitarioMinor: "97000" },
    });
  });
});
