import { Test, type TestingModule } from "@nestjs/testing";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/prisma/prisma.service";
import { assertCustomerDocumentAvailable } from "../src/parties/customer-identity";

describe("customer identity checks in a rolled-back local transaction", () => {
  let app: TestingModule;
  let prisma: PrismaService;
  beforeAll(async () => {
    app = await Test.createTestingModule({ imports: [AppModule] }).compile();
    const url = new URL(process.env.DATABASE_URL!);
    if (
      !["localhost", "127.0.0.1", "::1"].includes(url.hostname) ||
      url.pathname !== "/gestion_dev"
    )
      throw new Error("Local development DB only");
    prisma = app.get(PrismaService);
    await prisma.$connect();
  });
  afterAll(async () => {
    await app?.close();
  });
  it("checks legacy and fiscal documents, archived records, self exclusion and tenant isolation without altering records", async () => {
    const rollback = new Error("ROLLBACK_CUSTOMER_IDENTITY");
    await expect(
      prisma.$transaction(
        async (tx) => {
          const org = await tx.organization.create({
            data: { name: "Identity test" },
          });
          const other = await tx.organization.create({
            data: { name: "Other identity test" },
          });
          const customer = await tx.customer.create({
            data: {
              organizationId: org.id,
              name: "Carlos",
              active: false,
              document: "12.345.678",
              billingTaxId: "20-12345678-9",
              notes: "Contacto por la tarde",
            },
          });
          await expect(
            assertCustomerDocumentAvailable(tx, org.id, ["12345678"]),
          ).rejects.toThrow("restaurarlo");
          await expect(
            assertCustomerDocumentAvailable(tx, org.id, ["20123456789"]),
          ).rejects.toThrow("Carlos");
          await assertCustomerDocumentAvailable(tx, other.id, ["12345678"]);
          await assertCustomerDocumentAvailable(
            tx,
            org.id,
            ["12345678"],
            customer.id,
          );
          await assertCustomerDocumentAvailable(tx, org.id, ["", undefined]);
          expect(
            await tx.customer.findUnique({ where: { id: customer.id } }),
          ).toEqual(customer);
          expect(customer.notes).toBe("Contacto por la tarde");
          const cleared = await tx.customer.update({
            where: { id: customer.id },
            data: { notes: null },
          });
          expect(cleared.notes).toBeNull();
          throw rollback;
        },
        { timeout: 15000 },
      ),
    ).rejects.toBe(rollback);
  });
});
