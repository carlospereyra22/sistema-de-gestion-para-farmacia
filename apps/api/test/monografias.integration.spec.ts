import { randomUUID } from "node:crypto";
import { Test, type TestingModule } from "@nestjs/testing";
import { Prisma } from "@prisma/client";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/prisma/prisma.service";
import { MonografiasService } from "../src/catalog/monografias.service";
import type { Monografia } from "../src/catalog/monografias";

// Fichas publicadas de cada marca (SISTEMA-123): se vinculan por nombre exacto
// y completan la concentración que el padrón no escribe.
describe("fichas de PR Vademécum (base local, rollback)", () => {
  let app: TestingModule;
  let prisma: PrismaService;
  beforeAll(async () => {
    app = await Test.createTestingModule({ imports: [AppModule] }).compile();
    const url = new URL(process.env.DATABASE_URL!);
    if (
      !["localhost", "127.0.0.1"].includes(url.hostname) ||
      url.pathname !== "/gestion_dev"
    )
      throw new Error("Local test DB only");
    prisma = app.get(PrismaService);
    await prisma.$connect();
  });
  afterAll(async () => {
    await app?.close();
  });

  it("vincula, completa la concentración y devuelve la ficha por código", async () => {
    const rollback = new Error("ROLLBACK_MONOGRAFIAS");
    await expect(
      prisma.$transaction(
        async (tx) => {
          const marca = `PRUEBA ${randomUUID().slice(0, 6).toUpperCase()}`;
          const codigo = `779${Math.floor(Math.random() * 1e9)
            .toString()
            .padStart(9, "0")}9`;
          const item = (presentation: string, extra = {}) =>
            tx.medicineCatalogItem.create({
              data: {
                externalKey: `ab-T${randomUUID().slice(0, 8)}`,
                name: marca,
                laboratory: "Haleon Argentina",
                presentation,
                pharmaceuticalForm: "Cremas/Geles/Pomadas/Ungüentos",
                guideKey: "diclofenac dietilamonio",
                priceSource: "official",
                priceMinor: 100n,
                ...extra,
              },
            });
          const gel = await item("pomo x 30 g", {
            barcodes: {
              create: { barcode: codigo, gtin: codigo.padStart(14, "0") },
            },
          });
          const conDosis = await item("1% gel x 50 g");
          const deAlfaBeta = await item("pomo x 60 g", {
            doseText: "2 g/100 g",
            doseSource: "alfabeta",
          });
          const fichas: Monografia[] = [
            {
              sourceId: 900_000_000 + Math.floor(Math.random() * 1e6),
              name: marca,
              laboratory: "HALEON ARG",
              therapeuticAction: "Analgésico-antiinflamatorio de uso tópico.",
              composition:
                "Cada 100 g contiene: Diclofenaco Dietilamónico 1.16 g (1.16%) equivalente a 1.0 g de Diclofenaco Sódico.",
              indications: "Alivio del dolor y la inflamación localizada.",
              dosage: "Tópica. Aplicar 3 a 4 veces al día.",
              presentations: "Envases de 30, 60 y 100 g.",
              sourceUrl: "https://ar.prvademecum.com/medicamento/prueba-1/",
            },
            // Sin enlace válido: no se guarda.
            {
              sourceId: 1,
              name: "X",
              laboratory: "",
              therapeuticAction: "",
              composition: "",
              indications: "",
              dosage: "",
              presentations: "",
              sourceUrl: "https://otro.sitio/x",
            },
          ];
          const scoped = new Proxy(tx, {
            get(target, key) {
              return key === "$transaction"
                ? (
                    fn: (client: Prisma.TransactionClient) => Promise<unknown>,
                  ) => fn(tx)
                : Reflect.get(target, key);
            },
          }) as unknown as PrismaService;
          const servicio = new MonografiasService(scoped);
          const resultado = await servicio.importar(fichas);
          expect(resultado.fichas).toBe(1);
          expect(resultado.descartadas).toBe(1);

          const leidos = await tx.medicineCatalogItem.findMany({
            where: { id: { in: [gel.id, conDosis.id, deAlfaBeta.id] } },
            select: {
              id: true,
              monographId: true,
              doseText: true,
              doseSource: true,
            },
          });
          const porId = new Map(leidos.map((fila) => [fila.id, fila]));
          expect(leidos.every((fila) => fila.monographId)).toBe(true);
          expect(porId.get(gel.id)).toMatchObject({
            doseText: "1.16 g/100 g",
            doseSource: "prvademecum",
          });
          // La presentación ya dice la dosis, o la trae AlfaBeta: no se toca.
          expect(porId.get(conDosis.id)?.doseText).toBe("");
          expect(porId.get(deAlfaBeta.id)).toMatchObject({
            doseText: "2 g/100 g",
            doseSource: "alfabeta",
          });

          // Repetirla no cambia nada.
          expect((await servicio.importar(fichas)).vinculosCambiados).toBe(0);

          const ficha = await servicio.deProducto([codigo]);
          expect(ficha?.dosage).toBe("Tópica. Aplicar 3 a 4 veces al día.");
          expect(await servicio.deProducto(["7790000000000"])).toBeNull();
          throw rollback;
        },
        { timeout: 120_000 },
      ),
    ).rejects.toBe(rollback);
  });
});
