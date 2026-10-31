import { groupTicketItems } from "./group-ticket-items";
describe("ticket item grouping", () => {
  it("prints one 200-unit row for two 100-unit lots without mutating the sale", () => {
    const items = [
      {
        productId: "ketorolac",
        lotId: "a",
        quantity: 100,
        unitPriceMinor: 10000n,
      },
      {
        productId: "ketorolac",
        lotId: "b",
        quantity: 100,
        unitPriceMinor: 10000n,
      },
    ];
    expect(groupTicketItems(items)).toEqual([
      { productId: "ketorolac", quantity: 200, unitPriceMinor: 10000n },
    ]);
    expect(items.map((item) => item.quantity)).toEqual([100, 100]);
  });
  it("keeps distinct products and unit prices separate", () => {
    const items = [
      { productId: "a", quantity: 1, unitPriceMinor: 100n },
      { productId: "a", quantity: 2, unitPriceMinor: 200n },
      { productId: "b", quantity: 3, unitPriceMinor: 100n },
    ];
    expect(groupTicketItems(items)).toEqual(items);
    expect(groupTicketItems([])).toEqual([]);
  });
});
