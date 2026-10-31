import { automaticCategory } from "./automatic-category";
import type { CategoryNode } from "./category-tree";
const root: CategoryNode = {
  id: "root",
  name: "Dermocosmética",
  parentId: null,
  active: true,
};
const solar: CategoryNode = {
  id: "solar",
  name: "Protectores solares",
  parentId: "root",
  active: true,
};
const evidence = {
  name: "Protector solar Kids 150 ml",
  category_path: ["Dermocosmética", "Protección solar"],
  scope_group: "Protección solar",
};
const baseline = { root, children: ["Protectores solares"] };
it("prefers sunscreen over the retailer's generic Cuidado personal root", () => {
  expect(
    automaticCategory(
      [
        root,
        solar,
        {
          id: "personal",
          name: "Cuidado personal",
          parentId: null,
          active: true,
        },
      ],
      {
        name: "Protector Solar Nivea Swim & Play Kids FPS 60 150 ml",
        category_path: [
          "Cuidado Personal",
          "Cuidado de la piel",
          "Protector Solar",
        ],
        scope_group: "Protección solar",
        subcategory: "Protectores y postsolares",
      },
      baseline,
    ).categoryId,
  ).toBe("solar");
});
it("uses a newly created specific category without keywords or activation, and follows later renames/deactivation", () => {
  const nodes = [root, solar];
  expect(automaticCategory(nodes, evidence, baseline).categoryId).toBe("solar");
  const child = {
    id: "kids",
    name: "Infantiles",
    parentId: "solar",
    active: true,
  };
  nodes.push(child);
  expect(automaticCategory(nodes, evidence, baseline).categoryId).toBe("kids");
  child.name = "Adultos";
  expect(automaticCategory(nodes, evidence, baseline).categoryId).toBe("solar");
  child.name = "Infantiles";
  child.active = false;
  expect(automaticCategory(nodes, evidence, baseline).categoryId).toBe("solar");
});
it("matches coloración to a new Tinturas category using actual source metadata", () => {
  const tinturas = {
    id: "tinturas",
    name: "Tinturas",
    parentId: null,
    active: true,
  };
  expect(
    automaticCategory(
      [tinturas],
      { name: "Revlon Rubio 4", category_path: ["Cabello", "Coloración"] },
      null,
    ).categoryId,
  ).toBe("tinturas");
});
it("does not put sunscreen in hair-care children, guess unknown data or choose duplicate paths", () => {
  const hair = { id: "hair", name: "Cabello", parentId: null, active: true };
  const hairKids = {
    id: "hairKids",
    name: "Infantiles",
    parentId: "hair",
    active: true,
  };
  expect(
    automaticCategory([root, solar, hair, hairKids], evidence, baseline)
      .categoryId,
  ).toBe("solar");
  expect(
    automaticCategory([root, solar], { name: "Producto sin datos" }, null)
      .categoryId,
  ).toBeNull();
  expect(
    automaticCategory(
      [root, solar, { ...solar, id: "duplicate" }],
      evidence,
      baseline,
    ).ambiguous,
  ).toBe(true);
});
it("preserves deeper source paths and existing conflict controls", () => {
  expect(
    automaticCategory([root, solar], evidence, {
      root,
      children: ["Protectores solares", "Faciales"],
    }).categoryId,
  ).toBeNull();
  expect(
    automaticCategory(
      [root, solar],
      { ...evidence, review_reason: "identity_conflict" },
      baseline,
    ).categoryId,
  ).toBeNull();
});
