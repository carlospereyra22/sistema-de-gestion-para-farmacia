import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  calcularOfertas,
  etiquetaOferta,
  type OfertaMotor,
} from "./ofertas-motor";

describe("motor de ofertas en la web", () => {
  it("es el mismo archivo que usa la API para cobrar", () => {
    const web = readFileSync(
      new URL("./ofertas-motor.ts", import.meta.url),
      "utf8",
    );
    const api = readFileSync(
      new URL("../../../api/src/offers/ofertas-motor.ts", import.meta.url),
      "utf8",
    );
    // Si falla: copiá apps/api/src/offers/ofertas-motor.ts sobre este archivo
    // (o al revés). La API es la autoridad; la web sólo muestra la vista previa.
    expect(web.replace(/\r\n/g, "\n")).toBe(api.replace(/\r\n/g, "\n"));
  });

  it("calcula un 3x2 con la unidad más barata de regalo", () => {
    const oferta: OfertaMotor = {
      id: "o",
      version: 1,
      name: "3x2",
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
      targets: [
        { kind: "LABORATORY", id: "lab", exclude: false, quantity: null },
      ],
    };
    const renglon = (productId: string, precio: number) => ({
      productId,
      quantity: 1,
      unitPriceMinor: BigInt(precio),
      categoryId: null,
      laboratoryId: "lab",
      isMedication: false,
      manualPrice: false,
    });
    const resultado = calcularOfertas(
      [renglon("a", 3000), renglon("b", 2000), renglon("c", 1000)],
      [oferta],
      {
        ahora: new Date("2026-11-10T15:00:00Z"),
        branchId: "s",
        priceListId: null,
      },
    );
    expect(resultado.totalMinor).toBe(1000n);
    expect(etiquetaOferta(oferta)).toBe("3x2");
  });
});
