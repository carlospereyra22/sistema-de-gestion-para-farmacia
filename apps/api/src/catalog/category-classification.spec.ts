import { classifyExternalCategory } from "./category-classification";
it.each([
  [
    "Otros productos de farmacia",
    [],
    "Preservativo X3",
    "Higiene",
    ["Salud sexual"],
  ],
  [
    "Otros productos de farmacia",
    [],
    "OFF repelente crema",
    "Higiene",
    ["Repelentes"],
  ],
  [
    "Otros productos de farmacia",
    [],
    "Mamatest test embarazo",
    "Bebés y maternidad",
    ["Tests de embarazo y ovulación"],
  ],
  ["Otros productos de farmacia", [], "Botellitas de viaje", "Accesorios", []],
  [
    "Hogar y alimentos",
    ["Hogar", "Limpieza"],
    "Detergente",
    "Higiene",
    ["Higiene del hogar", "Limpieza"],
  ],
] as const)(
  "adapts %s / %s / %s using existing roots",
  (scope, path, name, parent, children) => {
    const root = { id: "parent", name: parent, parentId: null, active: true };
    expect(
      classifyExternalCategory([root], [...path], scope, { name }),
    ).toEqual({ root, children: [...children] });
  },
);
it("does not misclassify foods as supplements or create new roots", () => {
  const roots = ["Suplementos", "Accesorios", "Higiene"].map((name) => ({
    id: name,
    name,
    parentId: null,
    active: true,
  }));
  expect(
    classifyExternalCategory(
      roots,
      ["Hogar y Alimentos", "Alimentos y Bebidas"],
      "Hogar y alimentos",
      { name: "Chocolate" },
    ),
  ).toBeNull();
  expect(
    classifyExternalCategory([], [], "Otros productos de farmacia", {
      name: "Repelente",
    }),
  ).toBeNull();
});
it("reuses a specific root if the organization already has it", () => {
  const roots = ["Higiene", "Salud sexual"].map((name) => ({
    id: name,
    name,
    parentId: null,
    active: true,
  }));
  expect(
    classifyExternalCategory(roots, [], "Otros productos de farmacia", {
      name: "Preservativos",
    }),
  ).toEqual({ root: roots[1], children: [] });
});
it("maps Aveno's Dermo/Protector Solar breadcrumb to existing dermocosmetics", () => {
  const root = {
    id: "dermo",
    name: "Dermocosmética",
    parentId: null,
    active: true,
  };
  expect(
    classifyExternalCategory(
      [root],
      ["Dermo", "Protector Solar"],
      "Protección solar",
    ),
  ).toEqual({ root, children: ["Protectores solares"] });
});
it("adapts known groups beneath existing roots without manufacturing new roots", () => {
  const root = { id: "hygiene", name: "Higiene", parentId: null, active: true };
  expect(classifyExternalCategory([root], [], "Desodorantes")).toEqual({
    root,
    children: ["Desodorantes"],
  });
  const supplements = { ...root, id: "sup", name: "Suplementos" };
  expect(
    classifyExternalCategory(
      [supplements],
      ["Salud y Farmacia", "Suplementos y Multivitamínicos"],
      "Suplementos y nutrición",
    ),
  ).toEqual({ root: supplements, children: [] });
});
it("keeps the real Farmamix Body Splash descendant under an existing perfumery root", () => {
  const root = {
    id: "perfume",
    name: "Perfumería",
    parentId: null,
    active: true,
  };
  expect(
    classifyExternalCategory(
      [root],
      ["Perfumes & Fragancias", "Body Splash"],
      "Perfumería",
    ),
  ).toEqual({ root, children: ["Body Splash"] });
});
const roots = [
  "Cabello",
  "Cuidado personal",
  "Maquillaje y uñas",
  "Higiene bucal",
].map((name, index) => ({
  id: String(index),
  name,
  parentId: null,
  active: true,
}));
it("uses the most specific existing root and keeps explicit descendants", () => {
  expect(
    classifyExternalCategory(
      roots,
      ["Cuidado personal", "Capilar", "Shampoo", "Matizadores"],
      "Cabello",
    ),
  ).toEqual({ root: roots[0], children: ["Shampoo", "Matizadores"] });
});
it("does not create a root or invent a route from a scope", () => {
  expect(classifyExternalCategory(roots, ["Otro", "Algo"], "Cabello")).toEqual({
    root: roots[0],
    children: [],
  });
  expect(
    classifyExternalCategory(roots, ["Perfumes"], "Perfumería"),
  ).toBeNull();
});
it("rejects ambiguity and archived roots", () => {
  expect(
    classifyExternalCategory(
      [...roots, { id: "new", name: "Capilar", parentId: null, active: true }],
      ["Capilar", "Shampoo"],
      "Cabello",
    ),
  ).toBeNull();
  expect(
    classifyExternalCategory(
      roots.map((row) => ({ ...row, active: false })),
      ["Cabello"],
      "Cabello",
    ),
  ).toBeNull();
});
it("maps store terminology without selecting a same-named child in another branch", () => {
  expect(
    classifyExternalCategory(roots, ["Cuidado Oral", "Pastas"], ""),
  ).toEqual({ root: roots[3], children: ["Pastas"] });
});
it("keeps makeup accessories under makeup when scope and breadcrumb agree", () => {
  const nodes = [
    ...roots,
    { id: "accessories", name: "Accesorios", parentId: null, active: true },
  ];
  expect(
    classifyExternalCategory(
      nodes,
      ["Maquillaje", "Accesorios"],
      "Maquillaje y uñas",
    ),
  ).toEqual({ root: roots[2], children: ["Accesorios"] });
});
