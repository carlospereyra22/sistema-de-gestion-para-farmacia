import type { ImportRow } from "./purchase-excel";
import {
  createCatalogProduct,
  getCatalogOptions,
  lookupMedicineBarcode,
  type MedicineReference,
} from "./api";
import { findMedicationCategory } from "./medication-category";

export type BulkProductRow = Pick<ImportRow, "rowNumber" | "code" | "name">;
export type BulkProductResult = {
  created: { rowNumber: number; productId: string }[];
  failed: { rowNumber: number; name: string; reason: string }[];
};
type BulkOptions = {
  categories: { id: string; name: string }[];
  laboratories: { id: string; name: string }[];
};

// Renglones sin producto que se pueden agregar al pedido una vez creados.
export function pendingProductRows(
  rows: ImportRow[],
  assigned: Record<number, string>,
) {
  return rows.filter(
    (row) => row.quantity && !assigned[row.rowNumber] && !row.productId,
  );
}

// Solo se crea sin preguntar cuando el código identifica un único medicamento.
export function bulkReference(matches: MedicineReference[]) {
  if (!matches.length) throw new Error("No está en la base de medicamentos.");
  if (matches.length > 1)
    throw new Error("El código coincide con varios medicamentos: elegí uno.");
  const [reference] = matches as [MedicineReference];
  if (reference.priceMinor === null)
    throw new Error("La referencia no informa precio.");
  return reference as MedicineReference & { priceMinor: number };
}

// Mismos datos que guarda Nuevo producto al usar una referencia.
export function bulkProductInput(
  code: string,
  reference: MedicineReference & { priceMinor: number },
  options: BulkOptions,
) {
  const key = reference.laboratory.trim().toLocaleLowerCase("es-AR");
  const laboratory = options.laboratories.find(
    (item) => item.name.trim().toLocaleLowerCase("es-AR") === key,
  );
  return {
    name: reference.name,
    barcode: code,
    isMedication: true,
    saleUnit: "BOX" as const,
    priceMinor: reference.priceMinor,
    categoryId: findMedicationCategory(options.categories)?.id,
    laboratoryId: laboratory?.id,
    laboratoryName: laboratory ? undefined : reference.laboratory || undefined,
    activeIngredient: reference.activeIngredient || undefined,
    pharmaceuticalForm: reference.pharmaceuticalForm || undefined,
    concentration: reference.concentration || undefined,
    presentation: reference.presentation || undefined,
    prescriptionRequired: reference.prescriptionRequired ?? false,
    externalReferenceSource: reference.source,
    externalReferenceName: reference.name,
    externalReferencePresentation: reference.presentation,
    externalReferenceBarcode: reference.barcode,
    externalReferencePriceMinor: reference.priceMinor,
  };
}

// De a uno: un renglón que falla no frena a los demás ni deshace los creados.
export async function createRows(
  rows: BulkProductRow[],
  create: (row: BulkProductRow) => Promise<string>,
  onProgress: (done: number) => void,
): Promise<BulkProductResult> {
  const result: BulkProductResult = { created: [], failed: [] };
  for (const [index, row] of rows.entries()) {
    try {
      if (!row.code.trim()) throw new Error("No tiene código para buscarlo.");
      result.created.push({
        rowNumber: row.rowNumber,
        productId: await create(row),
      });
    } catch (cause) {
      result.failed.push({
        rowNumber: row.rowNumber,
        name: row.name || row.code,
        reason:
          cause instanceof Error
            ? cause.message
            : "No se pudo crear el producto.",
      });
    }
    onProgress(index + 1);
  }
  return result;
}

export async function createProductsFromBase(
  token: string,
  organizationId: string,
  rows: BulkProductRow[],
  onProgress: (done: number) => void,
) {
  const options = await getCatalogOptions(token, organizationId);
  return createRows(
    rows,
    async (row) => {
      const code = row.code.trim();
      const { matches } = await lookupMedicineBarcode(
        token,
        organizationId,
        code,
      );
      const { id } = await createCatalogProduct(
        token,
        organizationId,
        bulkProductInput(code, bulkReference(matches), options),
      );
      if (!id) throw new Error("No se pudo crear el producto.");
      return id;
    },
    onProgress,
  );
}
