export type ProductKindMode = "auto" | "medicine" | "other";

export function resolveProductKind(
  mode: ProductKindMode,
  known?: boolean,
  externalMatch = false,
): boolean | undefined {
  if (mode !== "auto") return mode === "medicine";
  if (known !== undefined) return known;
  return externalMatch ? false : undefined;
}
