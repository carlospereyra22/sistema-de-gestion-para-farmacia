export function conceptDescription(value: string): string | undefined {
  const text = value.trim();
  return text.length >= 3 &&
    text.length <= 160 &&
    ![...text].some((char) => char.charCodeAt(0) < 32)
    ? text
    : undefined;
}

export function filterConcepts(items: string[], query: string) {
  const normalize = (text: string) =>
    text
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLocaleLowerCase("es-AR");
  const words = normalize(query).trim().split(/\s+/).filter(Boolean);
  return items.filter((item) =>
    words.every((word) => normalize(item).includes(word)),
  );
}

export function conceptStorageKey(organizationId: string, userKey: string) {
  return `gestion:concept-descriptions:v1:${JSON.stringify([organizationId, userKey])}`;
}

export function readConceptDescriptions(
  storage: Pick<Storage, "getItem">,
  key: string,
): string[] {
  const raw = storage.getItem(key);
  if (!raw) return [];
  const values: unknown = JSON.parse(raw);
  if (
    !Array.isArray(values) ||
    !values.every(
      (value): value is string =>
        typeof value === "string" && conceptDescription(value) !== undefined,
    )
  ) {
    throw new Error("No se pudieron leer las descripciones guardadas.");
  }
  return [
    ...new Map(
      values.map((value) => [
        value.trim().toLocaleLowerCase("es-AR"),
        value.trim(),
      ]),
    ).values(),
  ];
}

export function saveConceptDescription(
  storage: Pick<Storage, "getItem" | "setItem">,
  key: string,
  value: string,
) {
  const description = conceptDescription(value);
  if (!description)
    throw new Error(
      "Usá una descripción de 3 a 160 caracteres, sin saltos de línea.",
    );
  const current = readConceptDescriptions(storage, key);
  if (
    current.some(
      (item) =>
        item.toLocaleLowerCase("es-AR") ===
        description.toLocaleLowerCase("es-AR"),
    )
  )
    return current;
  const next = [...current, description].sort((a, b) =>
    a.localeCompare(b, "es-AR"),
  );
  storage.setItem(key, JSON.stringify(next));
  return next;
}
