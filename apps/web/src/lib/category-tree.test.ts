import { expect, it } from "vitest";
import {
  categoryProductTotals,
  categoryBranch,
  categoryPath,
  visibleCategoryTree,
} from "./category-tree";
const nodes = [
  { id: "a", name: "Cuidado personal", parentId: null },
  { id: "b", name: "Cabello", parentId: "a" },
  { id: "c", name: "Shampoo", parentId: "b" },
  { id: "d", name: "Maquillaje", parentId: null },
];
it("includes every descendant without including other branches", () => {
  expect([...categoryBranch(nodes, "a")]).toEqual(["a", "b", "c"]);
  expect(categoryPath(nodes[2]!, nodes)).toBe(
    "Cuidado personal › Cabello › Shampoo",
  );
});
it("expands progressively and finds descendants in collapsed branches", () => {
  expect(visibleCategoryTree(nodes, new Set(), "").map((n) => n.id)).toEqual([
    "a",
    "d",
  ]);
  expect(
    visibleCategoryTree(nodes, new Set(["a", "b"]), "").map((n) => n.id),
  ).toEqual(["a", "b", "c", "d"]);
  expect(
    visibleCategoryTree(nodes, new Set(), "shampoo").map((n) => n.id),
  ).toEqual(["c"]);
});

it("suma en cada categoría los productos de sus subcategorías", () => {
  const nodes = [
    { id: "falopa", name: "falopa", parentId: null, _count: { products: 0 } },
    { id: "test", name: "test", parentId: "falopa", _count: { products: 1 } },
    { id: "hoja", name: "hoja", parentId: "test", _count: { products: 2 } },
    { id: "otra", name: "otra", parentId: null, _count: { products: 4 } },
  ];
  expect(Object.fromEntries(categoryProductTotals(nodes))).toEqual({
    falopa: 3,
    test: 3,
    hoja: 2,
    otra: 4,
  });
  // Un producto nuevo directo en la madre suma solo en la madre.
  nodes[0]!._count.products = 1;
  expect(categoryProductTotals(nodes).get("falopa")).toBe(4);
  expect(categoryProductTotals(nodes).get("test")).toBe(3);
});

it("sin conteos cargados no inventa totales", () => {
  expect(
    categoryProductTotals([{ id: "a", name: "a", parentId: null }]).size,
  ).toBe(0);
});
