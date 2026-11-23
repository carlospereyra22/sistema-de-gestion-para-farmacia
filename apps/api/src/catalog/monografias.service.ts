import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { dosisDe } from "./equivalentes";
import {
  claveNombre,
  dosisDeFicha,
  elegirMonografia,
  type Monografia,
} from "./monografias";

const FUENTE = "prvademecum";
const TANDA = 500;

/**
 * Fichas de cada marca (SISTEMA-123). Se cargan desde el archivo que arma
 * `scripts/medicine-catalog/prvademecum.py`; la API no sale a internet.
 */
@Injectable()
export class MonografiasService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Guarda las fichas, vincula cada medicamento de la base por nombre exacto
   * (y laboratorio si hay homónimos) y completa la concentración de las
   * presentaciones que el padrón no escribe. Repetirla da el mismo resultado.
   */
  async importar(fichas: Monografia[], fecha = new Date()) {
    const validas = fichas.filter(
      (ficha) =>
        Number.isInteger(ficha.sourceId) &&
        ficha.sourceId > 0 &&
        ficha.name.trim() &&
        /^https:\/\/ar\.prvademecum\.com\/medicamento\//.test(ficha.sourceUrl),
    );
    return this.prisma.$transaction(
      async (tx) => {
        for (let desde = 0; desde < validas.length; desde += TANDA) {
          const tanda = validas.slice(desde, desde + TANDA);
          await tx.$executeRaw`
            INSERT INTO "MedicineMonograph" ("id", "source", "sourceId", "name", "laboratory",
              "therapeuticAction", "composition", "indications", "dosage", "presentations",
              "sourceUrl", "fetchedAt", "updatedAt")
            SELECT gen_random_uuid(), ${FUENTE}, f."sourceId", f."name", f."laboratory",
              f."therapeuticAction", f."composition", f."indications", f."dosage",
              f."presentations", f."sourceUrl", ${fecha}, now()
            FROM jsonb_to_recordset(${JSON.stringify(tanda)}::jsonb) AS f(
              "sourceId" int, "name" text, "laboratory" text, "therapeuticAction" text,
              "composition" text, "indications" text, "dosage" text, "presentations" text,
              "sourceUrl" text)
            ON CONFLICT ("source", "sourceId") DO UPDATE SET
              "name" = EXCLUDED."name", "laboratory" = EXCLUDED."laboratory",
              "therapeuticAction" = EXCLUDED."therapeuticAction",
              "composition" = EXCLUDED."composition", "indications" = EXCLUDED."indications",
              "dosage" = EXCLUDED."dosage", "presentations" = EXCLUDED."presentations",
              "sourceUrl" = EXCLUDED."sourceUrl", "fetchedAt" = EXCLUDED."fetchedAt",
              "updatedAt" = now()`;
        }
        const guardadas = await tx.medicineMonograph.findMany({
          where: { source: FUENTE },
          select: { id: true, name: true, laboratory: true, composition: true },
        });
        const porNombre = new Map<string, typeof guardadas>();
        for (const ficha of guardadas) {
          const clave = claveNombre(ficha.name);
          porNombre.set(clave, [...(porNombre.get(clave) ?? []), ficha]);
        }
        const items = await tx.medicineCatalogItem.findMany({
          select: {
            id: true,
            name: true,
            laboratory: true,
            presentation: true,
            pharmaceuticalForm: true,
            guideKey: true,
            doseText: true,
            doseSource: true,
            monographId: true,
          },
        });
        const vinculos: { id: string; monographId: string | null }[] = [];
        const dosis: { id: string; doseText: string }[] = [];
        for (const item of items) {
          const ficha = elegirMonografia(item, porNombre);
          const monographId = ficha?.id ?? null;
          if (monographId !== item.monographId)
            vinculos.push({ id: item.id, monographId });
          // Concentración de la ficha sólo si la presentación no la escribe y
          // no la trae otra fuente (AlfaBeta).
          if (
            !ficha ||
            !item.guideKey ||
            dosisDe(item.name, item.presentation) ||
            (item.doseText && item.doseSource !== FUENTE)
          )
            continue;
          const componentes = item.guideKey.split("+").length;
          const leida =
            dosisDeFicha(
              ficha.composition,
              componentes,
              item.presentation,
              item.pharmaceuticalForm,
            ) ?? "";
          if (leida !== item.doseText)
            dosis.push({ id: item.id, doseText: leida });
        }
        for (let desde = 0; desde < vinculos.length; desde += TANDA)
          await tx.$executeRaw`
            UPDATE "MedicineCatalogItem" AS item SET "monographId" = v."monographId"
            FROM jsonb_to_recordset(${JSON.stringify(vinculos.slice(desde, desde + TANDA))}::jsonb)
              AS v("id" uuid, "monographId" uuid)
            WHERE item."id" = v."id"`;
        for (let desde = 0; desde < dosis.length; desde += TANDA)
          await tx.$executeRaw`
            UPDATE "MedicineCatalogItem" AS item SET "doseText" = d."doseText",
              "doseSource" = CASE WHEN d."doseText" = '' THEN '' ELSE ${FUENTE} END
            FROM jsonb_to_recordset(${JSON.stringify(dosis.slice(desde, desde + TANDA))}::jsonb)
              AS d("id" uuid, "doseText" text)
            WHERE item."id" = d."id"`;
        const [vinculados] = await tx.$queryRaw<{ total: number }[]>`
          SELECT count(*)::int AS total FROM "MedicineCatalogItem" WHERE "monographId" IS NOT NULL`;
        return {
          fichas: validas.length,
          descartadas: fichas.length - validas.length,
          vinculosCambiados: vinculos.length,
          medicamentosConFicha: vinculados?.total ?? 0,
          dosisCompletadas: dosis.filter((d) => d.doseText).length,
        };
      },
      { timeout: 300_000 },
    );
  }

  /** La ficha de un producto por sus códigos; sólo si todos apuntan a la misma. */
  async deProducto(codigos: string[], nombre?: string) {
    const limpios = codigos.map((codigo) => codigo.trim()).filter(Boolean);
    const sinCeros = limpios.map((codigo) => codigo.replace(/^0+/, ""));
    const porCodigo = limpios.length
      ? await this.prisma.medicineCatalogItem.findMany({
          where: {
            barcodes: {
              some: {
                OR: [
                  { barcode: { in: limpios } },
                  { barcode: { in: sinCeros } },
                ],
              },
            },
          },
          select: { monographId: true },
          take: 20,
        })
      : [];
    let ids = new Set(porCodigo.map((item) => item.monographId));
    if (!porCodigo.length && nombre?.trim()) {
      const porNombre = await this.prisma.medicineCatalogItem.findMany({
        where: { name: { equals: nombre.trim(), mode: "insensitive" } },
        select: { monographId: true },
        take: 20,
      });
      ids = new Set(porNombre.map((item) => item.monographId));
    }
    const [id] = ids;
    if (ids.size !== 1 || !id) return null;
    return this.prisma.medicineMonograph.findUnique({
      where: { id },
      select: {
        name: true,
        laboratory: true,
        therapeuticAction: true,
        composition: true,
        indications: true,
        dosage: true,
        presentations: true,
        sourceUrl: true,
      },
    });
  }
}
