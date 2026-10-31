export type ExternalProductCandidate = {
  code: string;
  gtin14: string;
  name: string;
  brand: string;
  presentation: string;
  scope_group: string;
  category_path?: string[];
  source_category_paths?: string[][];
  source_subcategory?: string;
  isMedication?: boolean | null;
  type_review_reason?: string;
  attribute_sources?: Record<string, { source: string; source_ref: string }>;
  source: string;
  fingerprint: string;
  review_reason?: string;
  license: string;
  source_review_reason?: string;
  source_ref?: string;
  evidence_count?: number;
  unit?: string;
  quantity?: string;
  image?: {
    data_url: string;
    url: string;
    source: string;
    source_ref: string;
    license: string;
    sha256: string;
  };
};

export function externalSaleUnit(
  candidate: ExternalProductCandidate,
): "UNIT" | undefined {
  // Counts identify a physical item. Weight/volume describes contents, not sale units.
  const unit = candidate.unit?.trim().toLowerCase().replace(/\.$/, "");
  return unit && ["ea", "un", "uni", "unidad", "unidades"].includes(unit)
    ? "UNIT"
    : undefined;
}

export const externalCategoryNames = new Set([
  "Cabello",
  "Tinturas y coloración",
  "Higiene bucal",
  "Higiene corporal",
  "Higiene femenina",
  "Bebés y maternidad",
  "Adultos e incontinencia",
  "Protección solar",
  "Dermocosmética",
  "Maquillaje y uñas",
  "Perfumería",
  "Desodorantes",
  "Afeitado y depilación",
  "Ortopedia",
  "Insumos y primeros auxilios",
  "Otros productos de farmacia",
  "Nutrición infantil y especializada",
]);

// Prefer the normalized reference ficha; ODbL is a fallback, never enrichment.
export function externalSuggestionGroups(
  reference: ExternalProductCandidate[],
  beauty: ExternalProductCandidate[],
) {
  return reference.length
    ? [
        {
          title: "Catálogo de referencia",
          rows: distinctExternalProducts(reference),
        },
      ]
    : [
        {
          title: "Open Beauty Facts · ODbL",
          rows: distinctExternalProducts(beauty),
        },
      ];
}

// Select a whole source row for an unambiguous code. Never blend source fields
// or collapse review cases; ODbL remains a separate group in the UI.
export function distinctExternalProducts(
  rows: ExternalProductCandidate[],
): ExternalProductCandidate[] {
  const normalize = (value: string) =>
    value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .trim();
  const groups = new Map<string, ExternalProductCandidate[]>();
  for (const row of rows) {
    const key = `${row.gtin14}:${row.source === "openbeauty" ? "odbl" : "reference"}`;
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  return [...groups.values()].flatMap((group) => {
    const quantities = new Set<string>();
    for (const row of group) {
      for (const match of normalize(`${row.name} ${row.presentation}`).matchAll(
        /\b(\d+(?:[.,]\d+)?)\s*(kg|grs?|g|ml|cc|litros?|lts?|l)\b/g,
      )) {
        const unit = match[2]!;
        const amount =
          Number(match[1]!.replace(",", ".")) *
          (/^(kg|l|lt|lts|litro|litros)$/.test(unit) ? 1000 : 1);
        quantities.add(
          `${amount}:${/^(kg|gr|grs|g)$/.test(unit) ? "g" : "ml"}`,
        );
      }
    }
    const brands = new Set(
      group.map((row) => normalize(row.brand)).filter(Boolean),
    );
    if (
      group.some((row) => row.review_reason) ||
      quantities.size > 1 ||
      brands.size > 1
    )
      return group;
    const score = (row: ExternalProductCandidate) =>
      (row.source === "excel270" ? 100 : 0) +
      (row.brand ? 10 : 0) +
      (/\b(?:g|gr|grs|kg|ml|cc|l)\b/i.test(row.presentation) ? 20 : 0);
    return [
      group.reduce((best, row) => (score(row) > score(best) ? row : best)),
    ];
  });
}

export function externalGtin(code: string): string | null {
  if (!/^(?:[0-9]{8}|[0-9]{12,14})$/.test(code) || /^0+$/.test(code))
    return null;
  const sum = [...code.slice(0, -1)]
    .reverse()
    .reduce(
      (total, digit, index) => total + Number(digit) * (index % 2 ? 1 : 3),
      0,
    );
  const canonical = code.padStart(14, "0");
  return (10 - (sum % 10)) % 10 === Number(code.at(-1)) &&
    !canonical.startsWith("02") &&
    !canonical.startsWith("002")
    ? canonical
    : null;
}

export function externalProductFields(
  candidate: ExternalProductCandidate,
  categories: { id: string; name: string; path?: string }[],
  options: { includeImage?: boolean } = {},
) {
  const normalize = (value: string) =>
    value
      .trim()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();
  const route = candidate.category_path?.join(" › ") ?? "";
  const precise = route
    ? categories.filter(
        (item) => normalize(item.path ?? item.name) === normalize(route),
      )
    : [];
  const matches = precise.length
    ? precise
    : categories.filter(
        (item) => normalize(item.name) === normalize(candidate.scope_group),
      );
  return {
    name: candidate.name,
    presentation: candidate.presentation,
    categoryId: matches.length === 1 ? matches[0].id : "",
    description: [
      candidate.brand ? `Marca: ${candidate.brand}` : "",
      route ? `Categoría de referencia: ${route}` : "",
      candidate.attribute_sources?.category_path?.source_ref?.startsWith(
        "https://",
      )
        ? `Fuente de categoría: ${candidate.attribute_sources.category_path.source_ref}`
        : "",
      `Fuente: ${candidate.source} · Código: ${candidate.code}`,
      candidate.source_review_reason
        ? `Verificación pendiente: ${candidate.source_review_reason}`
        : "",
      candidate.source_ref?.startsWith("https://")
        ? `Referencia: ${candidate.source_ref}`
        : "",
      options.includeImage && candidate.image?.source_ref.startsWith("https://")
        ? `Foto de referencia: ${candidate.image.source_ref}`
        : "",
      candidate.source === "openbeauty"
        ? "Open Beauty Facts contributors · ODbL-1.0 · https://world.openbeautyfacts.org/"
        : "",
    ]
      .filter(Boolean)
      .join("\n"),
  };
}
