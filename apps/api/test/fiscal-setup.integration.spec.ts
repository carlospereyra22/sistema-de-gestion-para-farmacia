import { randomUUID } from "node:crypto";
import { Test, type TestingModule } from "@nestjs/testing";
import { Prisma } from "@prisma/client";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/prisma/prisma.service";
import { OrganizationsService } from "../src/organizations/organizations.service";

describe("fiscal setup (rollback-only local fixtures)", () => {
  let moduleRef: TestingModule;
  let prisma: PrismaService;
  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    if (
      !["localhost", "127.0.0.1", "::1"].includes(
        new URL(process.env.DATABASE_URL!).hostname,
      )
    )
      throw new Error("Local database required");
    prisma = moduleRef.get(PrismaService);
    await prisma.$connect();
  });
  afterAll(async () => {
    await moduleRef?.close();
  });
  it("isolates organizations, audits changes, retains disabled points and rejects duplicates", async () => {
    const rollback = new Error("ROLLBACK_FISCAL_FIXTURES");
    await expect(
      prisma.$transaction(
        async (tx) => {
          const org = await tx.organization.create({
            data: { name: "Fiscal fixture" },
          });
          const other = await tx.organization.create({
            data: { name: "Other fiscal fixture" },
          });
          const branch = await tx.branch.create({
            data: { organizationId: org.id, name: "Test", code: "TEST" },
          });
          const foreign = await tx.branch.create({
            data: { organizationId: other.id, name: "Other", code: "TEST" },
          });
          const user = await tx.user.create({
            data: {
              email: `${randomUUID()}@example.invalid`,
              passwordHash: "test-only",
            },
          });
          const permissions = await tx.permission.findMany({
            where: {
              code: { in: ["ORGANIZATION_READ", "ORGANIZATION_MANAGE"] },
            },
          });
          expect(permissions).toHaveLength(2);
          const role = await tx.role.create({
            data: {
              organizationId: org.id,
              name: "Test",
              code: "TEST",
              permissions: {
                create: permissions.map((p) => ({ permissionId: p.id })),
              },
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
          });
          const service = new OrganizationsService(
            scoped as unknown as PrismaService,
          );
          await expect(
            service.fiscalSetup(user.id, other.id),
          ).rejects.toThrow();
          await expect(
            service.createFiscalPoint(user.id, org.id, {
              branchId: foreign.id,
              number: 1,
            }),
          ).rejects.toThrow("Sucursal activa");
          const point = await service.createFiscalPoint(user.id, org.id, {
            branchId: branch.id,
            number: 1,
          });
          expect(point.environment).toBe("HOMOLOGATION");
          await tx.fiscalPoint.create({
            data: { organizationId: other.id, branchId: foreign.id, number: 1 },
          });
          let setup = await service.fiscalSetup(user.id, org.id);
          expect(setup.points).toHaveLength(1);
          expect(setup.issuanceEnabled).toBe(false);
          expect(setup.checks.find((c) => c.code === "POINT")?.ready).toBe(
            true,
          );
          await expect(
            service.changeFiscalPointStatus(
              user.id,
              org.id,
              randomUUID(),
              false,
            ),
          ).rejects.toThrow();
          await service.changeFiscalPointStatus(
            user.id,
            org.id,
            point.id,
            false,
          );
          setup = await service.fiscalSetup(user.id, org.id);
          expect(setup.points).toHaveLength(1);
          expect(setup.checks.find((c) => c.code === "POINT")?.ready).toBe(
            false,
          );
          await tx.branch.update({
            where: { id: branch.id },
            data: { active: false },
          });
          await expect(
            service.changeFiscalPointStatus(user.id, org.id, point.id, true),
          ).rejects.toThrow("sucursal debe estar activa");
          await tx.branch.update({
            where: { id: branch.id },
            data: { active: true },
          });
          await service.changeFiscalPointStatus(
            user.id,
            org.id,
            point.id,
            true,
          );
          expect(
            await tx.auditLog.count({
              where: { organizationId: org.id, entityType: "FISCAL_POINT" },
            }),
          ).toBe(3);
          await expect(
            service.createFiscalPoint(user.id, org.id, {
              branchId: branch.id,
              number: 1,
            }),
          ).rejects.toThrow("ya existe");
          throw rollback;
        },
        { timeout: 15000 },
      ),
    ).rejects.toBe(rollback);
  });
});
