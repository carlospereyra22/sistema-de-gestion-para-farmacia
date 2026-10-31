import type { MedicineReference } from "./api";

export const medicineSources = {
  alfabeta: "AlfaBeta",
  official: "Vademécum nacional",
  preciosderemedios: "Precios de Remedios",
} satisfies Record<MedicineReference["source"], string>;

export function groupMedicines(references: MedicineReference[]) {
  const groups = new Map<
    string,
    { name: string; laboratory: string; items: MedicineReference[] }
  >();
  for (const reference of references) {
    const key = JSON.stringify([
      reference.source,
      reference.name,
      reference.laboratory,
    ]);
    const group = groups.get(key) ?? {
      name: reference.name,
      laboratory: reference.laboratory,
      items: [],
    };
    group.items.push(reference);
    groups.set(key, group);
  }
  return [...groups.entries()].map(([id, group]) => ({ id, ...group }));
}

export function referenceMoney(value: number | null) {
  return value === null
    ? "Precio no informado"
    : new Intl.NumberFormat("es-AR", {
        style: "currency",
        currency: "ARS",
      }).format(value / 100);
}
