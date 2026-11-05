import { Prisma } from "@prisma/client";
import type { MedicineReference } from "./medicine-reference.service";
import { canonicalGtin } from "./external-gtin";

// Copia local de las fuentes de medicamentos (SISTEMA-21), compartida por
// todas las organizaciones.

type SnapshotSource = MedicineReference["source"];
type SnapshotClient = Pick<
  Prisma.TransactionClient,
  "medicineReferenceSnapshot"
>;

const INSERT_CHUNK = 1000;

// Una descarga con mucho menos que la anterior es una respuesta parcial de la
// fuente: aplicarla dejaría productos sin precio de referencia.
export const MIN_SNAPSHOT_RATIO = 0.6;

export function isPartialSnapshot(rows: number, previousRows: number) {
  return previousRows > 0 && rows < previousRows * MIN_SNAPSHOT_RATIO;
}

export function snapshotKey(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLocaleLowerCase("es-AR")
    .replace(/\s+/g, " ")
    .trim();
}

export function gtinOf(barcode: string): string | null {
  try {
    return barcode.trim() ? canonicalGtin(barcode.trim()) : null;
  } catch {
    return null;
  }
}

export function snapshotRow(
  reference: MedicineReference,
  runId: string,
  lookupKey = "",
): Prisma.MedicineReferenceSnapshotCreateManyInput {
  return {
    source: reference.source,
    lookupKey,
    gtin: gtinOf(reference.barcode),
    barcode: reference.barcode,
    name: reference.name,
    presentation: reference.presentation,
    laboratory: reference.laboratory,
    activeIngredient: reference.activeIngredient,
    pharmaceuticalForm: reference.pharmaceuticalForm ?? "",
    concentration: reference.concentration ?? "",
    troquel: reference.troquel,
    saleType: reference.saleType,
    prescriptionRequired: reference.prescriptionRequired ?? null,
    priceMinor:
      reference.priceMinor === null ? null : BigInt(reference.priceMinor),
    pamiPriceMinor:
      reference.pamiPriceMinor === null
        ? null
        : BigInt(reference.pamiPriceMinor),
    sourceUpdatedAt: reference.updatedAt,
    searchText: snapshotKey(
      [
        reference.name,
        reference.presentation,
        reference.laboratory,
        reference.activeIngredient,
      ].join(" "),
    ),
    runId,
  };
}

type SnapshotRecord = Prisma.MedicineReferenceSnapshotGetPayload<object>;

export function referenceFromSnapshot(row: SnapshotRecord): MedicineReference {
  return {
    source: row.source as SnapshotSource,
    name: row.name,
    presentation: row.presentation,
    laboratory: row.laboratory,
    activeIngredient: row.activeIngredient,
    barcode: row.barcode,
    troquel: row.troquel,
    priceMinor: row.priceMinor === null ? null : Number(row.priceMinor),
    pamiPriceMinor:
      row.pamiPriceMinor === null ? null : Number(row.pamiPriceMinor),
    updatedAt: row.sourceUpdatedAt,
    saleType: row.saleType,
    pharmaceuticalForm: row.pharmaceuticalForm,
    concentration: row.concentration,
    ...(row.prescriptionRequired === null
      ? {}
      : { prescriptionRequired: row.prescriptionRequired }),
  };
}

async function insertRows(
  tx: SnapshotClient,
  rows: Prisma.MedicineReferenceSnapshotCreateManyInput[],
) {
  for (let start = 0; start < rows.length; start += INSERT_CHUNK)
    await tx.medicineReferenceSnapshot.createMany({
      data: rows.slice(start, start + INSERT_CHUNK),
    });
}

// Reemplaza el padrón completo dentro de la transacción recibida: quien lee la
// copia ve la anterior hasta que termina.
export async function replaceOfficialSnapshot(
  tx: SnapshotClient,
  runId: string,
  references: MedicineReference[],
) {
  await tx.medicineReferenceSnapshot.deleteMany({
    where: { source: "official" },
  });
  await insertRows(
    tx,
    references.map((reference) => snapshotRow(reference, runId)),
  );
}

// Guarda lo que devolvió una búsqueda por nombre (Precios de Remedios, AlfaBeta).
export async function replaceLookupSnapshot(
  tx: SnapshotClient,
  runId: string,
  source: SnapshotSource,
  name: string,
  references: MedicineReference[],
) {
  const lookupKey = snapshotKey(name);
  await tx.medicineReferenceSnapshot.deleteMany({
    where: { source, lookupKey },
  });
  await insertRows(
    tx,
    references.map((reference) => snapshotRow(reference, runId, lookupKey)),
  );
}

export type OfficialIndex = {
  byGtin: Map<string, MedicineReference[]>;
  byName: Map<string, MedicineReference[]>;
};

export function officialIndex(references: MedicineReference[]): OfficialIndex {
  const byGtin = new Map<string, MedicineReference[]>();
  const byName = new Map<string, MedicineReference[]>();
  for (const reference of references) {
    const gtin = gtinOf(reference.barcode);
    if (gtin) byGtin.set(gtin, [...(byGtin.get(gtin) ?? []), reference]);
    const name = snapshotKey(reference.name);
    byName.set(name, [...(byName.get(name) ?? []), reference]);
  }
  return { byGtin, byName };
}

// Candidatas del padrón para un producto vinculado: las de su código y las de
// su mismo nombre. La elección final la hace la regla de presentación exacta.
export function officialCandidates(
  index: OfficialIndex,
  name: string,
  barcode: string | null,
): MedicineReference[] {
  const gtin = barcode ? gtinOf(barcode) : null;
  // La misma fila puede llegar por código y por nombre: se cuenta una vez.
  return [
    ...new Set([
      ...(gtin ? (index.byGtin.get(gtin) ?? []) : []),
      ...(index.byName.get(snapshotKey(name)) ?? []),
    ]),
  ];
}

export function sameGtin(first: string | null, second: string | null) {
  const a = first ? gtinOf(first) : null;
  return Boolean(a && a === (second ? gtinOf(second) : null));
}
