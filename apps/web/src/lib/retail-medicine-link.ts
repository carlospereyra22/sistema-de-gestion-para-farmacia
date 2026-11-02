import type { MedicineReference } from "./api";
import { medicineReferenceBarcodeConflict } from "./medicine-reference-barcode";

export function compatibleRetailMedicineReferences(
  barcode: string,
  references: MedicineReference[],
): MedicineReference[] {
  return references.filter(
    (reference) =>
      !medicineReferenceBarcodeConflict(barcode, reference.barcode),
  );
}

export function retailMedicineNameQuery(name: string): string {
  const trimmed = name.trim();
  return trimmed.replace(/\s+x\s*\d+.*$/i, "").trim() || trimmed;
}
