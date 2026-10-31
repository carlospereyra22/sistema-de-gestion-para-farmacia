import { createCatalogNamedItem, type CatalogOptions } from "./api";

export type CatalogOption = CatalogOptions["categories"][number];
export const cleanCatalogOptionName = (name: string) =>
  name.trim().replace(/\s+/g, " ");
export function matchingCatalogOption(options: CatalogOption[], name: string) {
  const key = cleanCatalogOptionName(name).toLocaleLowerCase("es-AR");
  const matches = options.filter(
    (option) =>
      cleanCatalogOptionName(option.name).toLocaleLowerCase("es-AR") === key,
  );
  return matches.length === 1 ? matches[0] : undefined;
}
export function filterCatalogOptions(options: CatalogOption[], query: string) {
  const normalize = (text: string) =>
    text
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLocaleLowerCase("es-AR");
  const words = normalize(query).trim().split(/\s+/).filter(Boolean);
  return options.filter((option) =>
    words.every((word) => normalize(option.path ?? option.name).includes(word)),
  );
}
export async function createOrSelectCatalogOption(
  token: string,
  organizationId: string,
  type: keyof CatalogOptions,
  name: string,
  options: CatalogOption[],
  parentId: string | null = null,
) {
  const clean = cleanCatalogOptionName(name);
  if (clean.length < 2 || clean.length > 120)
    throw new Error("Escribí un nombre de entre 2 y 120 caracteres.");
  const existing = matchingCatalogOption(
    type === "categories"
      ? options.filter((option) => (option.parentId ?? null) === parentId)
      : options,
    clean,
  );
  return (
    existing ??
    (await createCatalogNamedItem(
      token,
      organizationId,
      type,
      clean,
      undefined,
      undefined,
      type === "categories" ? parentId : undefined,
    ))
  );
}
