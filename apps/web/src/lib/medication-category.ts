type NamedCategory = { id: string; name: string };

function categoryKey(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLocaleLowerCase("es-AR")
    .replace(/\s+/g, " ")
    .trim();
}

// Categoría donde se cargan los medicamentos vinculados. Acepta "Medicamento"
// o "Medicamentos" sin distinguir tildes, mayúsculas ni espacios.
export function isMedicationCategoryName(name: string): boolean {
  const key = categoryKey(name);
  return key === "medicamentos" || key === "medicamento";
}

export function findMedicationCategory<T extends NamedCategory>(
  categories: readonly T[] | undefined,
): T | undefined {
  return categories?.find((category) =>
    isMedicationCategoryName(category.name),
  );
}
