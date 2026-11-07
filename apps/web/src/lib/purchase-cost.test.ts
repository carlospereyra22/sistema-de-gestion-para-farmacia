import { describe, expect, it } from "vitest";
import { purchaseCostLabel, purchaseTotalLabel } from "./purchase-cost";

const format = (minor: number) => `$ ${minor / 100}`;

describe("costos de compra", () => {
  it("muestra el costo cuando la API lo envía", () => {
    expect(purchaseCostLabel("1500", format)).toBe("$ 15");
  });

  it("no inventa un importe cuando no lo envía", () => {
    expect(purchaseCostLabel(undefined, format)).toBe("No disponible");
  });

  it("suma el total de la compra", () => {
    expect(
      purchaseTotalLabel(
        [
          { orderedQuantity: 2, unitCostMinor: "1000" },
          { orderedQuantity: 1, unitCostMinor: "500" },
        ],
        format,
      ),
    ).toBe("$ 25");
  });

  it("si falta un costo no muestra un total parcial", () => {
    expect(
      purchaseTotalLabel(
        [{ orderedQuantity: 2, unitCostMinor: "1000" }, { orderedQuantity: 1 }],
        format,
      ),
    ).toBe("No disponible");
  });
});
