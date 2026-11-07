import { hidePurchaseCosts } from "./purchase-cost-visibility";

describe("hidePurchaseCosts", () => {
  it("quita los costos de ítems, recepciones y movimientos", () => {
    const hidden = hidePurchaseCosts({
      id: "compra",
      items: [{ id: "item", orderedQuantity: 3, unitCostMinor: "1500" }],
      receipts: [{ items: [{ quantity: 1, unitCostMinor: "1500" }] }],
      legacyMovements: [{ quantity: 2, unitCostMinor: "900" }],
    });

    expect(JSON.stringify(hidden)).not.toContain("unitCostMinor");
    expect(JSON.stringify(hidden)).not.toContain("1500");
  });

  it("conserva lo que hace falta para controlar lo que llega", () => {
    expect(
      hidePurchaseCosts([
        {
          reference: "R-1",
          items: [{ orderedQuantity: 3, unitCostMinor: "1" }],
        },
      ]),
    ).toEqual([{ reference: "R-1", items: [{ orderedQuantity: 3 }] }]);
  });
});
