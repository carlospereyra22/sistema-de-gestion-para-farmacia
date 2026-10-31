import {
  classifyCategoryEvidence,
  classifyExternalCategory,
} from "./category-classification";
const nodes = ["Cabello", "Higiene", "Hogar y alimentos"].map((name) => ({
  id: name,
  name,
  parentId: null,
  active: true,
}));
const selected = {
  name: "Shampoo",
  scope_group: "Cabello",
  category_path: ["Capilar", "Shampoo"],
  review_reason: "marcas_contradictorias",
};
it("uses the common category without claiming brands agree", () => {
  expect(
    classifyCategoryEvidence(nodes, selected, [
      selected,
      { ...selected, category_path: ["Cabello", "Shampoos"] },
    ]),
  ).toEqual({ root: nodes[0], children: ["Shampoo"] });
});
it("falls back to the common parent for conflicting shampoo/conditioner types", () => {
  const row = { ...selected, review_reason: "tipo_capilar_contradictorio" };
  expect(
    classifyCategoryEvidence(nodes, row, [
      row,
      {
        ...row,
        name: "Acondicionador",
        category_path: ["Capilar", "Acondicionadores"],
      },
    ]),
  ).toEqual({ root: nodes[0], children: [] });
});
it("does not take a majority, ignore unknown observations or treat missing evidence as agreement", () => {
  expect(classifyCategoryEvidence(nodes, selected, [])).toBeNull();
  expect(
    classifyCategoryEvidence(nodes, selected, [
      selected,
      selected,
      { scope_group: "Higiene", name: "Jabón" },
    ]),
  ).toBeNull();
  expect(
    classifyCategoryEvidence(nodes, selected, [selected, { name: "Unknown" }]),
  ).toBeNull();
});
it("maps real food taxonomy to the newly authorized root", () => {
  expect(
    classifyExternalCategory(
      nodes,
      ["Hogar y Alimentos", "Alimentos y Bebidas"],
      "Hogar y alimentos",
    ),
  ).toEqual({ root: nodes[2], children: ["Alimentos y Bebidas"] });
});
