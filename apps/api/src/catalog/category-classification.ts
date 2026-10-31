import type { CategoryNode } from "./category-tree";

export const categoryKey = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
const groups = [
  ["Dermocosmética", "Dermo", "Dermocosméticos", "Cosmética y piel"],
  [
    "Suplementos",
    "Suplementos y nutrición",
    "Suplementos y multivitamínicos",
    "Suplementos dietarios",
  ],
  ["Cabello", "Capilar", "Cuidado capilar", "Cuidado del cabello"],
  [
    "Perfumería",
    "Perfumes",
    "Fragancias",
    "Perfumes & Fragancias",
    "Perfumes y fragancias",
  ],
  ["Maquillaje", "Maquillaje y uñas"],
  ["Bebés y maternidad", "Maternidad", "Universo bebé", "Mamá y bebé"],
  ["Higiene bucal", "Cuidado oral", "Cuidado bucal", "Salud bucal"],
  ["Higiene", "Higiene corporal", "Cuidado e higiene", "Higiene personal"],
  ["Tinturas y coloración", "Coloración", "Tintes"],
  ["Protección solar", "Solares", "Protectores solares", "Protector solar"],
  ["Shampoo", "Shampoos", "Champú", "Champús"],
  ["Acondicionador", "Acondicionadores"],
].map((group) => group.map(categoryKey));
const equivalent = (a: string, b: string) =>
  a === b || groups.some((group) => group.includes(a) && group.includes(b));
export const equivalentCategory = (a: string, b: string) =>
  equivalent(categoryKey(a), categoryKey(b));

const parentPreferences: Record<string, { parents: string[]; child: string }> =
  {
    "higiene corporal": { parents: ["Cuidado personal"], child: "Higiene" },
    perfumeria: { parents: ["Perfumería y maquillaje"], child: "Fragancias" },
    "proteccion solar": {
      parents: ["Dermocosmética"],
      child: "Protectores solares",
    },
    desodorantes: {
      parents: ["Higiene", "Cuidado personal"],
      child: "Desodorantes",
    },
    "higiene femenina": {
      parents: ["Higiene", "Cuidado personal"],
      child: "Higiene femenina",
    },
    "afeitado y depilacion": {
      parents: ["Higiene", "Cuidado personal"],
      child: "Afeitado y depilación",
    },
    "adultos e incontinencia": {
      parents: ["Higiene", "Cuidado personal"],
      child: "Adultos e incontinencia",
    },
    "nutricion infantil y especializada": {
      parents: ["Bebés y maternidad", "Suplementos"],
      child: "Nutrición infantil y especializada",
    },
    "insumos y primeros auxilios": {
      parents: ["Salud y bienestar", "Accesorios"],
      child: "Insumos y primeros auxilios",
    },
    ortopedia: {
      parents: ["Salud y bienestar", "Accesorios"],
      child: "Ortopedia",
    },
  };

/** Only an explicit source path can create children; roots are always existing. */
export function classifyExternalCategory(
  nodes: CategoryNode[],
  path: string[],
  scope: string,
  details: { name?: string; subcategory?: string } = {},
) {
  const anchors = nodes.filter((node) => node.active);
  const planFor = (node: CategoryNode, children: string[]) => {
    const prefix: string[] = [];
    const seen = new Set<string>();
    let root = node;
    while (root.parentId) {
      if (seen.has(root.id)) return null;
      seen.add(root.id);
      prefix.unshift(root.name);
      const parent = anchors.find((item) => item.id === root.parentId);
      if (!parent) return null;
      root = parent;
    }
    return { root, children: [...prefix, ...children] };
  };
  const route = path
    .map((name) =>
      categoryKey(name) === "protector solar"
        ? "Protectores solares"
        : name.trim().replace(/\s+/g, " "),
    )
    .filter(Boolean);
  if (
    route.length > 12 ||
    route.some((name) => name.length < 2 || name.length > 120)
  )
    return null;
  const under = (parent: string, children: string[]) => {
    for (let index = children.length - 1; index >= 0; index--) {
      const existing = anchors.filter((root) =>
        equivalentCategory(root.name, children[index]!),
      );
      if (existing.length > 1) return null;
      if (existing.length === 1)
        return planFor(existing[0]!, children.slice(index + 1));
    }
    let matches = anchors.filter((root) =>
      equivalentCategory(root.name, parent),
    );
    if (!matches.length && parent === "Higiene")
      matches = anchors.filter(
        (node) => !node.parentId && node.name === "Cuidado personal",
      );
    return matches.length === 1 ? planFor(matches[0]!, children) : null;
  };
  const text = categoryKey(
    [...route, details.name ?? "", details.subcategory ?? ""].join(" "),
  );
  if (categoryKey(scope) === "otros productos de farmacia") {
    const families: [RegExp, string, string[]][] = [
      [
        /\b(preservativos?|condones?|bienestar sexual|lubricantes?|geles intimos)\b/,
        "Higiene",
        ["Salud sexual"],
      ],
      [/\b(repelentes?)\b/, "Higiene", ["Repelentes"]],
      [/\b(pediculosis|piojos|peine fino)\b/, "Higiene", ["Pediculosis"]],
      [/\b(hisopos?|cotonetes|algodones?)\b/, "Higiene", ["Algodón e hisopos"]],
      [/\b(panuelos?)\b/, "Higiene", ["Pañuelos descartables"]],
      [
        /\b(embarazo|ovulacion)\b/,
        "Bebés y maternidad",
        ["Tests de embarazo y ovulación"],
      ],
      [
        /\b(lentes de contacto|optica|soluciones multiproposito)\b/,
        "Accesorios",
        ["Cuidado de lentes de contacto"],
      ],
      [
        /\b(unas|manicura|lima|alicate)\b/,
        "Maquillaje y uñas",
        ["Accesorios de manicura"],
      ],
      [
        /\b(peines?|cabello|vincha|banditas)\b/,
        "Cabello",
        ["Accesorios para el cabello"],
      ],
    ];
    for (const [pattern, parent, children] of families) {
      if (pattern.test(text)) {
        const plan = under(parent, children);
        if (plan) return plan;
      }
    }
  }
  if (categoryKey(scope) === "hogar y alimentos") {
    const householdRoot = anchors.find(
      (node) =>
        !node.parentId && categoryKey(node.name) === "hogar y alimentos",
    );
    if (householdRoot)
      return planFor(
        householdRoot,
        route.filter(
          (name) =>
            !["hogar y alimentos", "hogar", "supermercado"].includes(
              categoryKey(name),
            ),
        ),
      );
    // Older organizations can keep their existing roots; never create a new one.
    const routeText = categoryKey(
      route
        .filter((name) => categoryKey(name) !== "hogar y alimentos")
        .join(" "),
    );
    if (
      /\b(alimentos|bebidas|kiosco|almacen|nutricion)\b/.test(routeText) &&
      !/\b(limpieza|cuidado de la ropa|insecticidas|desinfectantes|papeles)\b/.test(
        routeText,
      )
    )
      return under(
        "Hogar y alimentos",
        route.filter((name) => categoryKey(name) !== "hogar y alimentos"),
      );
    const household: [RegExp, string, string[]][] = [
      [
        /\b(electro.hogar|electrodomesticos)\b/,
        "Accesorios",
        ["Hogar", "Electrodomésticos"],
      ],
      [
        /\b(aromatizadores?|aromatizantes?|desodorantes de ambiente|sahumerios?|difusores?)\b/,
        "Higiene",
        ["Higiene del hogar", "Aromatizantes"],
      ],
      [
        /\b(limpieza|lavandina|detergente|desinfectantes?|insecticidas?|cuidado de la ropa)\b/,
        "Higiene",
        ["Higiene del hogar", "Limpieza"],
      ],
      [
        /\b(papel higienico|rollos de cocina|servilletas|papeles)\b/,
        "Higiene",
        ["Higiene del hogar", "Papeles"],
      ],
      [
        /\b(pilas|libreria|adhesivo)\b/,
        "Accesorios",
        ["Hogar", "Pilas y librería"],
      ],
      [
        /\b(juguetes|regaleria|bazar|tiempo libre)\b/,
        "Accesorios",
        ["Hogar", "Bazar y regalos"],
      ],
    ];
    for (const [pattern, parent, children] of household) {
      if (pattern.test(text)) {
        const plan = under(parent, children);
        if (plan) return plan;
      }
    }
  }
  const scoped = anchors.filter((root) =>
    equivalent(categoryKey(root.name), categoryKey(scope)),
  );
  if (scoped.length === 1) {
    const anchor = route.findIndex((name) =>
      equivalent(categoryKey(scoped[0]!.name), categoryKey(name)),
    );
    if (anchor >= 0) return planFor(scoped[0]!, route.slice(anchor + 1));
  }
  // Prefer the most specific existing root represented in the source breadcrumb.
  for (let index = route.length - 1; index >= 0; index--) {
    const matches = anchors.filter((root) =>
      equivalent(categoryKey(root.name), categoryKey(route[index]!)),
    );
    if (matches.length > 1) return null;
    if (
      matches.length === 1 &&
      scoped.length === 1 &&
      [
        "Cuidado personal",
        "Perfumería y maquillaje",
        "Salud y bienestar",
      ].includes(matches[0]!.name)
    )
      return planFor(scoped[0]!, route.slice(index + 1));
    if (matches.length === 1)
      return planFor(matches[0]!, route.slice(index + 1));
  }
  // A scope without an aligned breadcrumb is enough for a root, never invented children.
  if (scoped.length === 1) return planFor(scoped[0]!, []);
  const fallback =
    parentPreferences[categoryKey(scope)] ??
    Object.entries(parentPreferences).find(([name]) =>
      equivalentCategory(name, scope),
    )?.[1];
  if (fallback) {
    for (const parent of fallback.parents) {
      const matches = anchors.filter((root) =>
        equivalentCategory(root.name, parent),
      );
      if (matches.length > 1) return null;
      if (matches.length === 1) return planFor(matches[0]!, [fallback.child]);
    }
  }
  if (categoryKey(scope) === "otros productos de farmacia")
    return under("Cuidado personal", ["Accesorios"]) ?? under("Accesorios", []);
  return null;
}

export type CategoryEvidence = {
  presentation?: string;
  name?: string;
  subcategory?: string;
  category_path?: string[];
  scope_group?: string;
  review_reason?: string;
};

export function hasCategoryConflict(reason = "") {
  return /conflict|contradict/i.test(
    reason.replace(/presentaciones_contradictorias/g, ""),
  );
}

/** Brand/variant disagreements do not erase a category shared by every exact-GTIN
 * observation. Keep warnings and use only their common ancestor, never a majority. */
export function classifyCategoryEvidence(
  nodes: CategoryNode[],
  selected: CategoryEvidence,
  evidence: CategoryEvidence[] = [],
) {
  const own = classifyExternalCategory(
    nodes,
    selected.category_path ?? [],
    selected.scope_group ?? "",
    selected,
  );
  if (!hasCategoryConflict(selected.review_reason)) return own;
  if (
    !own ||
    evidence.length < 2 ||
    /fuera_de_alcance|uso_no_personal/.test(selected.review_reason ?? "")
  )
    return null;
  const plans = evidence.map((row) =>
    classifyExternalCategory(
      nodes,
      row.category_path ?? [],
      row.scope_group ?? "",
      row,
    ),
  );
  if (plans.some((plan) => !plan || plan.root.id !== own.root.id)) return null;
  const children: string[] = [];
  for (let index = 0; index < own.children.length; index++) {
    const name = own.children[index]!;
    if (
      !plans.every(
        (plan) =>
          plan?.children[index] &&
          equivalentCategory(plan.children[index]!, name),
      )
    )
      break;
    children.push(name);
  }
  return { root: own.root, children };
}
