import { expect, it } from "vitest";
import {
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
