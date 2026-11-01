import { canonicalGtin } from "./external-gtin";

export type RetailMedicine = {
  name: string;
  presentation: string;
  brand: string;
  barcode: string;
  source: string;
  sourceRef: string;
  verification: "CHECKSUM_VALID_NOT_PHYSICALLY_VERIFIED";
};

export type RetailMedicineRow = {
  source: string;
  payload: {
    code?: unknown;
    name?: unknown;
    presentation?: unknown;
    brand?: unknown;
    source_ref?: unknown;
  };
};

const value = (input: unknown): string =>
  typeof input === "string" ? input.trim() : "";

function packageSize(name: string, presentation: string): string {
  const full = `${presentation} ${name}`.toLocaleLowerCase("es-AR");
  return (
    /\bx\s*(\d{1,4})\b/.exec(full)?.[1] ??
    /\b(\d{1,4})\s*(?:comprimidos|comp\.?|c[aá]psulas|c[aá]ps\.?|sobres|tabletas)\b/.exec(
      full,
    )?.[1] ??
    ""
  );
}

export function retailerMedicineMatches(
  code: string,
  rows: RetailMedicineRow[],
): RetailMedicine[] {
  const requested = canonicalGtin(code);
  const unique = new Map<string, RetailMedicine>();
  for (const row of rows) {
    const barcode = value(row.payload.code);
    const name = value(row.payload.name);
    if (!name || !barcode) continue;
    try {
      if (canonicalGtin(barcode) !== requested) continue;
    } catch {
      continue;
    }
    const presentation = value(row.payload.presentation);
    const key = packageSize(name, presentation) || "unspecified";
    if (unique.has(key)) continue;
    unique.set(key, {
      name,
      presentation,
      brand: value(row.payload.brand),
      barcode,
      source: row.source,
      sourceRef: value(row.payload.source_ref),
      verification: "CHECKSUM_VALID_NOT_PHYSICALLY_VERIFIED",
    });
  }
  const sized = [...unique.entries()].filter(([key]) => key !== "unspecified");
  return (
    sized.length ? sized.map(([, item]) => item) : [...unique.values()]
  ).slice(0, 8);
}
