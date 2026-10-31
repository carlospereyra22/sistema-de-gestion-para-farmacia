import {
  classifyExternalCategory,
  classifyCategoryEvidence,
} from "./category-classification";
import type { CategoryNode } from "./category-tree";

const nodes: CategoryNode[] = [
  { id: "care", name: "Cuidado personal", parentId: null, active: true },
  { id: "hair", name: "Cabello", parentId: "care", active: true },
  {
    id: "color",
    name: "Tinturas y coloración",
    parentId: "hair",
    active: true,
  },
  { id: "health", name: "Salud y bienestar", parentId: null, active: true },
  { id: "supplements", name: "Suplementos", parentId: "health", active: true },
];
it("reuses a moved category and its full ancestry rather than creating another root", () => {
  expect(
    classifyExternalCategory(
      nodes,
      ["Cuidado Personal", "Capilar", "Coloración"],
      "Tinturas y coloración",
    ),
  ).toEqual({ root: nodes[0], children: ["Cabello", "Tinturas y coloración"] });
  expect(
    classifyExternalCategory(
      nodes,
      ["Salud y Farmacia", "Suplementos y Multivitamínicos"],
      "Suplementos y nutrición",
    ),
  ).toEqual({ root: nodes[3], children: ["Suplementos"] });
});
it("keeps the shared subcategory after moving it below a general root", () => {
  const selected = {
    scope_group: "Cabello",
    category_path: ["Capilar", "Shampoo"],
    review_reason: "marcas_contradictorias",
  };
  expect(
    classifyCategoryEvidence(nodes, selected, [
      selected,
      { ...selected, category_path: ["Cabello", "Acondicionadores"] },
    ]),
  ).toEqual({ root: nodes[0], children: ["Cabello"] });
});
it("rejects orphaned or cyclic category anchors", () => {
  expect(
    classifyExternalCategory(
      [{ ...nodes[1]!, parentId: "missing" }],
      [],
      "Cabello",
    ),
  ).toBeNull();
  expect(
    classifyExternalCategory(
      [{ ...nodes[1]!, parentId: "hair" }],
      [],
      "Cabello",
    ),
  ).toBeNull();
});
