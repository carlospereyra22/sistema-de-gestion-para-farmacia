import { manualConcept } from "./manual-concept";
import { groupTicketItems } from "./group-ticket-items";

describe("manual sale concepts", () => {
  it("preserves regular catalog lines and forbids price overrides", () => {
    expect(manualConcept({ productId: "p", quantity: 1 })).toBeNull();
    expect(() =>
      manualConcept({ productId: "p", quantity: 1, unitPriceMinor: 100 }),
    ).toThrow();
  });
  it("creates a priced line without product or lot", () => {
    expect(
      manualConcept({
        description: "  Cobro puntual  ",
        quantity: 1,
        unitPriceMinor: 12500,
        discountMinor: 500,
      }),
    ).toEqual({
      productId: null,
      lotId: null,
      description: "Cobro puntual",
      quantity: 1,
      unitPriceMinor: 12500n,
      discountMinor: 500n,
    });
  });
  it.each([
    { description: "a" },
    { description: " ".repeat(4) },
    { description: "x".repeat(161) },
    { description: "Malo\nControl" },
    { quantity: 1.5 },
    { quantity: 2147483648 },
    { quantity: 2147483647, unitPriceMinor: 2147483647 },
    { quantity: 0 },
    { unitPriceMinor: 0 },
    { unitPriceMinor: -1 },
    { unitPriceMinor: 1.5 },
    { unitPriceMinor: 2147483648 },
    { discountMinor: 101 },
    { discountMinor: -1 },
    { productId: "p" },
  ])("rejects malformed manual lines: %j", (override) => {
    expect(() =>
      manualConcept({
        description: "Concepto",
        quantity: 1,
        unitPriceMinor: 100,
        ...override,
      }),
    ).toThrow();
  });
  it("keeps equal-price concepts separate on tickets", () => {
    const items = ["Primero", "Segundo"].map((description) => ({
      productId: null,
      description,
      quantity: 1,
      unitPriceMinor: 100n,
    }));
    expect(groupTicketItems(items)).toEqual(items);
  });
  it("supports multiple units and discounts on the whole line", () => {
    expect(
      manualConcept({
        description: "Concepto",
        quantity: 1000,
        unitPriceMinor: 500,
        discountMinor: 1000,
      }),
    ).toMatchObject({
      quantity: 1000,
      unitPriceMinor: 500n,
      discountMinor: 1000n,
      productId: null,
      lotId: null,
    });
  });
});
