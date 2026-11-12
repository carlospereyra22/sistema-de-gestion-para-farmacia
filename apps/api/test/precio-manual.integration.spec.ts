import { randomUUID } from "node:crypto";
import { Test, type TestingModule } from "@nestjs/testing";
import { Prisma } from "@prisma/client";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/prisma/prisma.service";
import { CatalogService } from "../src/catalog/catalog.service";

// Precio manual en medicamentos vinculados (SISTEMA-103): se puede editar y
// queda fuera de la actualización automática hasta volver al automático.
describe("precio manual de un medicamento vinculado (base local, rollback)", () => {
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

  it("edita a mano, no lo pisa sin la marca y vuelve al automático", async () => {
    const rollback = new Error("ROLLBACK_PRECIO_MANUAL");
    await expect(
      prisma.$transaction(
        async (tx) => {
          const org = await tx.organization.create({
            data: { name: "Precio manual" },
          });
          const user = await tx.user.create({
            data: {
              email: `${randomUUID()}@example.invalid`,
              passwordHash: "t",
            },
          });
          const permission = await tx.permission.upsert({
            where: { code: "CATALOG_MANAGE" },
            update: {},
            create: { code: "CATALOG_MANAGE", description: "CATALOG_MANAGE" },
          });
          const role = await tx.role.create({
            data: {
              organizationId: org.id,
              code: "ADMIN",
              name: "Admin",
              permissions: { create: { permissionId: permission.id } },
            },
          });
          await tx.userOrganization.create({
            data: {
              organizationId: org.id,
              userId: user.id,
              roles: { create: { roleId: role.id } },
            },
          });
          const scoped = new Proxy(tx, {
            get(target, key) {
              return key === "$transaction"
                ? (
                    fn: (client: Prisma.TransactionClient) => Promise<unknown>,
                  ) => fn(tx)
                : Reflect.get(target, key);
            },
          }) as unknown as PrismaService;
          const catalog = new CatalogService(scoped);
          const { id } = await catalog.create(user.id, org.id, {
            name: "BUSCAPINA DUO",
            isMedication: true,
            priceMinor: 1_127_800,
            saleUnit: "BOX",
            externalReferenceSource: "official",
            externalReferenceName: "BUSCAPINA DUO",
            externalReferencePresentation: "comp.rec.x 10",
            externalReferencePriceMinor: 1_127_800,
          });
          const precio = async () =>
            (
              await tx.productPrice.findFirstOrThrow({
                where: { productId: id },
              })
            ).amountMinor;

          await expect(
            catalog.updateProduct(user.id, org.id, id, {
              priceMinor: 1_200_000,
            }),
          ).rejects.toThrow("sincronizado");

          await catalog.updateProduct(user.id, org.id, id, {
            priceMinor: 1_200_000,
            priceManual: true,
          });
          expect(await precio()).toBe(1_200_000n);
          expect(
            (await tx.product.findUniqueOrThrow({ where: { id } })).priceManual,
          ).toBe(true);

          await catalog.updateProduct(user.id, org.id, id, {
            priceManual: false,
          });
          expect(await precio()).toBe(1_127_800n);
          throw rollback;
        },
        { timeout: 60_000 },
      ),
    ).rejects.toBe(rollback);
  });
});
