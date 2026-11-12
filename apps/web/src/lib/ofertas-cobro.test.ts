import { describe, expect, it } from "vitest";
import { calcularOfertas, type OfertaMotor } from "./ofertas-motor";
import { pagosDelCobro, saldoConMedio, type PagoCobro } from "./ofertas-cobro";

const efectivo: OfertaMotor = {
  id: "of-efectivo",
  version: 1,
  name: "Martes en efectivo",
  type: "PAYMENT_METHOD",
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
  targets: [{ kind: "PRODUCT", id: "p1", exclude: false, quantity: null }],
  paymentMethods: ["CASH"],
};

// Venta de $10.000 (un producto en la oferta).
const totalCon = (pagos: readonly PagoCobro[]) =>
  1000000 -
  Number(
    calcularOfertas(
      [
        {
          productId: "p1",
          quantity: 1,
          unitPriceMinor: 1000000n,
          categoryId: null,
          laboratoryId: null,
          isMedication: false,
          manualPrice: false,
        },
      ],
      [efectivo],
      {
        ahora: new Date("2026-11-10T13:30:00.000Z"),
        branchId: "suc",
        priceListId: null,
        cobro: {
          pagos: pagos.map((pago) => ({
            method: pago.method,
            amountMinor: BigInt(pago.amountMinor),
          })),
          otrosMinor: 0n,
        },
      },
    ).totalMinor,
  );

describe("cobro con oferta por medio de pago", () => {
  it("en efectivo salda con el descuento completo", () => {
    expect(saldoConMedio([], "CASH", totalCon)).toBe(900000);
  });

  it("con tarjeta salda sin descuento", () => {
    expect(saldoConMedio([], "CARD", totalCon)).toBe(1000000);
  });

  it("después de $4.000 con tarjeta, el efectivo salda $5.400", () => {
    expect(
      saldoConMedio(
        [{ method: "CARD", amountMinor: 400000 }],
        "CASH",
        totalCon,
      ),
    ).toBe(540000);
  });

  it("después de $5.400 en efectivo, la tarjeta salda lo que falta exacto", () => {
    const pagos: PagoCobro[] = [{ method: "CASH", amountMinor: 540000 }];
    const tarjeta = saldoConMedio(pagos, "CARD", totalCon);
    expect(540000 + tarjeta).toBe(
      totalCon([...pagos, { method: "CARD", amountMinor: tarjeta }]),
    );
  });

  it("un billete más grande en efectivo es vuelto: no cambia el total", () => {
    const pagos = pagosDelCobro({
      pagos: [],
      metodo: "CASH",
      montoEscrito: 2000000,
      totalCon,
    });
    expect(pagos).toEqual([{ method: "CASH", amountMinor: 900000 }]);
    expect(totalCon(pagos)).toBe(900000);
  });

  it("la cuenta corriente no suma un pago en curso", () => {
    expect(pagosDelCobro({ pagos: [], metodo: "ACCOUNT", totalCon })).toEqual(
      [],
    );
  });
});

describe("formulario con todos los productos", () => {
  it("manda allProducts y lo elegido como exclusión", async () => {
    const { armarEntrada, formularioVacio } =
      await import("./oferta-formulario");
    const entrada = armarEntrada({
      ...formularioVacio(new Date("2026-11-10T13:00:00.000Z")),
      name: "Todo el local",
      porcentaje: "10",
      todos: true,
      destinos: [
        { kind: "PRODUCT", id: "p1", name: "P1", exclude: false, quantity: "" },
      ],
    });
    expect(entrada).toMatchObject({
      allProducts: true,
      targets: [{ id: "p1", exclude: true }],
    });
  });
});

describe("formulario por monto de compra", () => {
  it("manda el mínimo y el descuento en pesos", async () => {
    const { armarEntrada, formularioVacio, vistaPrevia } =
      await import("./oferta-formulario");
    const entrada = armarEntrada({
      ...formularioVacio(new Date("2026-11-10T13:00:00.000Z")),
      type: "SPEND_THRESHOLD",
      name: "Compras grandes",
      minimo: "100.000",
      montoModo: "MONTO",
      monto: "5.000",
      todos: true,
      topeVenta: "3",
    });
    expect(entrada).toMatchObject({
      minPurchaseMinor: "10000000",
      amountMinor: "500000",
      maxUnitsPerSale: null,
      allProducts: true,
    });
    if (typeof entrada === "string") throw new Error(entrada);
    expect(vistaPrevia(entrada, 0)?.texto).toBe(
      "Una compra de $100.000 queda en $95.000.",
    );
  });
});
