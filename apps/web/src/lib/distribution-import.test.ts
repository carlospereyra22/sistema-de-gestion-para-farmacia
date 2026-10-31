import { expect, it } from "vitest";
import {
  normalizeMedicine,
  parseOrderPage,
  shortage,
  medicineCandidates,
  orderTotal,
  rememberedMatch,
  planDistribution,
} from "./distribution-import";

it("reads quantity-first rows and ignores headers and dates", () => {
  expect(
    parseOrderPage(
      "Pedido droguería\n5/10/2026\nCantidad Producto\n171 Tafirol 500mg x10\n19 Actron 400 x20\n0 Otro",
      2,
    ),
  ).toEqual([
    { quantity: 171, name: "Tafirol 500mg x10", page: 2 },
    { quantity: 19, name: "Actron 400 x20", page: 2 },
  ]);
});
it("matches spacing in pack sizes but never changes strength or pack quantity", () => {
  const products = [
    { id: "a", active: true, name: "ACTRON 400x20" },
    { id: "b", active: true, name: "ACTRON 600x20" },
  ];
  expect(medicineCandidates("Actron 400 x20", products)).toEqual({
    exact: true,
    products: [products[0]],
  });
  expect(medicineCandidates("Actron 400 x10", products).exact).toBe(false);
  expect(
    medicineCandidates("Actron 400 x20", [
      ...products,
      { ...products[0]!, id: "c" },
    ]).products,
  ).toHaveLength(2);
  expect(
    medicineCandidates("Actron 400 x20", [{ ...products[0]!, active: false }])
      .exact,
  ).toBe(false);
});
it("reads repeated PDF totals and rejects conflicting or missing totals", () => {
  expect(parseOrderPage("729 Pág. 1/2\n15 Omeprazol 20mg x14", 1)).toEqual([
    { quantity: 15, name: "Omeprazol 20mg x14", page: 1 },
  ]);
  expect(
    orderTotal(
      "Pendientes globales 5/10/2026 729 Pág. 1/2\nPendientes globales 5/10/2026 729 Pág. 2/2",
    ),
  ).toBe(729);
  expect(
    orderTotal(
      "Pendientes globales 5/10/2026 729\nPendientes globales 5/10/2026 714",
    ),
  ).toBeNull();
  expect(orderTotal("171 Tafirol 500mg x10")).toBeNull();
});
it("reuses only explicit mappings still belonging to an active unchanged product", () => {
  const memory = {
    "actron 400 x20": {
      productId: "a",
      productName: "ACTRON 400x20",
      unit: "BLISTER" as const,
    },
  };
  const products = [{ id: "a", name: "ACTRON 400x20", active: true }];
  expect(rememberedMatch("Actron 400x20", memory, products)?.unit).toBe(
    "BLISTER",
  );
  expect(
    rememberedMatch("Actron 400x20", memory, [
      { ...products[0]!, name: "Otro" },
    ]),
  ).toBeUndefined();
  expect(
    rememberedMatch("Actron 400x20", memory, [
      { ...products[0]!, active: false },
    ]),
  ).toBeUndefined();
});
it("prepares available lots FEFO and respects the existing draft and repeated demand", () => {
  const stock = [
    {
      id: "late",
      productId: "a",
      sellableQuantity: 5,
      expiresAt: "2027-12-01",
    },
    {
      id: "early",
      productId: "a",
      sellableQuantity: 4,
      expiresAt: "2027-01-01",
    },
    {
      id: "expired",
      productId: "a",
      sellableQuantity: 0,
      expiresAt: "2020-01-01",
    },
  ];
  const reserved = [{ lotId: "early", quantity: 2 }];
  expect(
    planDistribution(
      [
        { productId: "a", quantity: 6 },
        { productId: "a", quantity: 6 },
      ],
      stock,
      reserved,
    ),
  ).toEqual([
    { lotId: "early", quantity: 2 },
    { lotId: "late", quantity: 4 },
    { lotId: "late", quantity: 1 },
  ]);
  expect(stock[0]!.sellableQuantity).toBe(5);
  expect(() =>
    planDistribution([{ productId: "a", quantity: 0 }], stock, []),
  ).toThrow();
});
it("normalizes spelling without merging concentrations or packs", () => {
  expect(normalizeMedicine(" Cápsulas 400 mg x 20 ")).toBe(
    "capsulas 400mg x20",
  );
  expect(normalizeMedicine("Actron 400mg x20")).not.toBe(
    normalizeMedicine("Actron 600mg x20"),
  );
  expect(normalizeMedicine("Actron 400mg x20")).not.toBe(
    normalizeMedicine("Actron 400mg x10"),
  );
  expect(medicineCandidates("Actron", [])).toEqual({
    exact: false,
    products: [],
  });
});
it("requires explicit review and matching known units", () => {
  expect(shortage(20, 7, "BOX", "BOX", true)).toBe(13);
  expect(shortage(2, 7, "BLISTER", "BLISTER", true)).toBe(0);
  expect(shortage(20, 7, "BOX", "BOX", false)).toBeNull();
  expect(shortage(20, 7, "BLISTER", "BOX", true)).toBeNull();
  expect(shortage(20, 7, "BLISTER", "MIXED", true)).toBeNull();
  expect(shortage(20, 7, "", "BOX", true)).toBeNull();
  expect(shortage(0, 7, "BOX", "BOX", true)).toBeNull();
  expect(shortage(1.5, 7, "BOX", "BOX", true)).toBeNull();
  expect(shortage(20, NaN, "BOX", "BOX", true)).toBeNull();
});
