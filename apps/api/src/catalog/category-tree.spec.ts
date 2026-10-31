import { validateCategoryPlacement, type CategoryNode } from "./category-tree";

const nodes: CategoryNode[] = [
  { id: "root", name: "Cuidado personal", parentId: null, active: true },
  { id: "child", name: "Cabello", parentId: "root", active: true },
  { id: "leaf", name: "Accesorios", parentId: "child", active: true },
  { id: "other", name: "Maquillaje", parentId: null, active: true },
];
it("allows arbitrary nesting and repeated names in separate branches", () => {
  expect(() =>
    validateCategoryPlacement(nodes, undefined, "Accesorios", "other"),
  ).not.toThrow();
  expect(() =>
    validateCategoryPlacement(nodes, undefined, "Cepillos", "leaf"),
  ).not.toThrow();
});
it("rejects cycles, missing parents and inactive parents", () => {
  for (const parent of ["root", "leaf", "foreign"])
    expect(() =>
      validateCategoryPlacement(nodes, "root", "Cuidado personal", parent),
    ).toThrow();
  expect(() =>
    validateCategoryPlacement(
      [
        ...nodes,
        { id: "inactive", name: "Vieja", parentId: null, active: false },
      ],
      undefined,
      "Nueva",
      "inactive",
    ),
  ).toThrow();
});
it("rejects duplicate sibling names but permits keeping the same name", () => {
  expect(() =>
    validateCategoryPlacement(nodes, undefined, "ACCESORIOS", "child"),
  ).toThrow();
  expect(() =>
    validateCategoryPlacement(nodes, "leaf", "Accesorios", "child"),
  ).not.toThrow();
});
