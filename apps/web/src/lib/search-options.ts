export type SearchOption = { value: string; label: string };
export function filterSearchOptions(options: SearchOption[], query: string) {
  const normalize = (text: string) =>
    text
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLocaleLowerCase("es-AR");
  const words = normalize(query).trim().split(/\s+/).filter(Boolean);
  return options.filter((option) =>
    words.every((word) => normalize(option.label).includes(word)),
  );
}
