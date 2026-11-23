import { randomUUID } from "node:crypto";
import { Test, type TestingModule } from "@nestjs/testing";
import { Prisma } from "@prisma/client";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/prisma/prisma.service";
import { FotosMedicamentosService } from "../src/catalog/fotos-medicamentos.service";
import type { ExternalCatalogService } from "../src/catalog/external-catalog.service";
import type { FotoMedicamento } from "../src/catalog/fotos-medicamentos";

// Fotos de medicamentos (SISTEMA-122): el worker pone la foto de la tienda en
// productos sin foto cuyo código coincide con la base, una sola vez.
function jpeg() {
  return new Uint8Array(
    Buffer.from([
      0xff, 0xd8, 0xff, 0xc0, 0, 11, 8, 2, 88, 3, 32, 1, 1, 0x11, 0, 0xff, 0xda,
      0, 8, 1, 1, 0, 0, 63, 0, 0xff, 0xd9,
    ]),
  );
}

/** Código EAN-13 válido y distinto en cada corrida. */
function ean(): string {
  const base = `779${String(Math.floor(Math.random() * 1e9)).padStart(9, "0")}`;
  const suma = [...base]
    .reverse()
    .reduce((total, d, i) => total + Number(d) * (i % 2 === 0 ? 3 : 1), 0);
  return base + ((10 - (suma % 10)) % 10);
}

describe("fotos de medicamentos desde las tiendas (base local, rollback)", () => {
  let app: TestingModule;
  let prisma: PrismaService;
  const anterior = process.env.EXTERNAL_CATALOG_ORGANIZATION_ID;
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
    process.env.EXTERNAL_CATALOG_ORGANIZATION_ID = anterior;
    await app?.close();
  });

  it("pone la foto sólo donde corresponde y no la repite", async () => {
    const rollback = new Error("ROLLBACK_FOTOS_MEDICAMENTOS");
    await expect(
      prisma.$transaction(
        async (tx) => {
          const org = await tx.organization.create({
            data: { name: "Fotos medicamentos" },
          });
          const otraOrg = await tx.organization.create({
            data: { name: "Sin catálogo externo" },
          });
          const [codIbu, codOtro, codSinBase] = [ean(), ean(), ean()];
          const gtin = (code: string) => code.padStart(14, "0");
          const ibu = await tx.medicineCatalogItem.create({
            data: {
              externalKey: `ab-T${randomUUID().slice(0, 8)}`,
              name: "IBU 400",
              priceSource: "official",
              priceMinor: 100n,
              barcodes: {
                create: { barcode: codIbu, gtin: gtin(codIbu) },
              },
            },
          });
          await tx.medicineCatalogItem.create({
            data: {
              externalKey: `ab-T${randomUUID().slice(0, 8)}`,
              name: "OTRO",
              priceSource: "official",
              priceMinor: 100n,
              barcodes: {
                create: { barcode: codOtro, gtin: gtin(codOtro) },
              },
            },
          });
          // Cada producto lleva su propio código; los de la base son del IBU.
          const codigoDelIbu = async () => {
            const code = ean();
            await tx.medicineCatalogBarcode.create({
              data: { itemId: ibu.id, barcode: code, gtin: gtin(code) },
            });
            return code;
          };
          const producto = async (
            organizationId: string,
            code: string,
            extra: Partial<Prisma.ProductUncheckedCreateInput> = {},
          ) => {
            const creado = await tx.product.create({
              data: { organizationId, name: `P ${code}`, ...extra },
            });
            await tx.productBarcode.create({
              data: { organizationId, productId: creado.id, code },
            });
            return creado.id;
          };
          const sinFoto = await producto(org.id, codIbu);
          const conFoto = await producto(org.id, await codigoDelIbu());
          await tx.productImage.create({
            data: {
              productId: conFoto,
              organizationId: org.id,
              content: new Uint8Array([0xff, 0xd8, 1, 0xff, 0xd9]),
            },
          });
          const quitada = await producto(org.id, await codigoDelIbu());
          await tx.auditLog.create({
            data: {
              organizationId: org.id,
              entityType: "PRODUCT",
              entityId: quitada,
              action: "PRODUCT_IMAGE_REMOVED",
            },
          });
          // Vinculado a otro medicamento: el código no corresponde al vínculo.
          const vinculoDistinto = await producto(org.id, await codigoDelIbu(), {
            externalReferenceSource: "official",
            externalReferenceBarcode: codOtro,
          });
          const codVinculo = await codigoDelIbu();
          const vinculoIgual = await producto(org.id, codVinculo, {
            externalReferenceSource: "official",
            externalReferenceBarcode: codVinculo,
          });
          const fueraDeBase = await producto(org.id, codSinBase);
          const inactivo = await producto(org.id, await codigoDelIbu(), {
            active: false,
          });
          const deOtraFarmacia = await producto(otraOrg.id, codIbu);

          const pedidos: string[][] = [];
          const externo = {
            fotosDeMedicamentos: (
              _organizationId: string,
              gtins: string[],
            ): Promise<FotoMedicamento[]> => {
              pedidos.push(gtins);
              return Promise.resolve(
                gtins.map((codigo) => ({
                  gtin14: codigo,
                  source: "public_farmaplus",
                  sourceRef: "https://tienda/p",
                  sha256: "b".repeat(64),
                  foto: jpeg(),
                  prioridad: 2,
                })),
              );
            },
          } as unknown as ExternalCatalogService;
          const scoped = new Proxy(tx, {
            get(target, key) {
              return key === "$transaction"
                ? (
                    fn: (client: Prisma.TransactionClient) => Promise<unknown>,
                  ) => fn(tx)
                : Reflect.get(target, key);
            },
          }) as unknown as PrismaService;
          process.env.EXTERNAL_CATALOG_ORGANIZATION_ID = org.id;
          const servicio = new FotosMedicamentosService(scoped, externo);

          const primera = await servicio.completar();
          expect(primera).toEqual({ puestas: 2, siguiente: null });
          expect(pedidos.flat().sort()).toEqual(
            [gtin(codIbu), gtin(codVinculo)].sort(),
          );
          // Nunca se pide la foto de un código que no está en la base.
          expect(pedidos.flat()).not.toContain(gtin(codSinBase));

          const fotos = await tx.productImage.findMany({
            where: { organizationId: { in: [org.id, otraOrg.id] } },
            select: { productId: true },
          });
          expect(fotos.map((f) => f.productId).sort()).toEqual(
            [sinFoto, conFoto, vinculoIgual].sort(),
          );
          for (const id of [
            quitada,
            vinculoDistinto,
            fueraDeBase,
            inactivo,
            deOtraFarmacia,
          ])
            expect(
              await tx.productImage.findUnique({ where: { productId: id } }),
            ).toBeNull();
          const marcado = await tx.product.findUniqueOrThrow({
            where: { id: sinFoto },
          });
          expect(marcado.fotoTiendaEn).not.toBeNull();
          const auditoria = await tx.auditLog.findFirstOrThrow({
            where: { entityId: sinFoto, action: "PRODUCT_IMAGE_STORE_SAVED" },
          });
          expect(auditoria.actorId).toBeNull();
          expect(auditoria.after).toMatchObject({
            gtin14: gtin(codIbu),
            source: "public_farmaplus",
          });

          // Si después le sacan la foto, no vuelve.
          await tx.productImage.delete({ where: { productId: sinFoto } });
          expect(await servicio.completar()).toEqual({
            puestas: 0,
            siguiente: null,
          });
          expect(
            await tx.productImage.findUnique({ where: { productId: sinFoto } }),
          ).toBeNull();
          throw rollback;
        },
        { timeout: 60_000 },
      ),
    ).rejects.toBe(rollback);
  });
});
