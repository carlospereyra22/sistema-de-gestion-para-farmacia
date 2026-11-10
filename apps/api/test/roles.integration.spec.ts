import { randomUUID } from "node:crypto";
import { Test, type TestingModule } from "@nestjs/testing";
import { Prisma } from "@prisma/client";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/prisma/prisma.service";
import { RolesService } from "../src/roles/roles.service";

describe("roles y permisos (datos locales que se descartan)", () => {
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

  it("lista usuarios activos, edita nombre, descripción y permisos con auditoría y protege al dueño", async () => {
    const rollback = new Error("ROLLBACK_ROLES_FIXTURES");
    await expect(
      prisma.$transaction(
        async (tx) => {
          const org = await tx.organization.create({
            data: { name: "Roles fixture" },
          });
          const permissions = await tx.permission.findMany({
            where: {
              code: { in: ["ROLE_READ", "ROLE_MANAGE", "SALE_READ"] },
            },
          });
          expect(permissions).toHaveLength(3);
          const owner = await tx.role.create({
            data: {
              organizationId: org.id,
              name: "Owner",
              code: "OWNER",
              permissions: {
                create: permissions.map((p) => ({ permissionId: p.id })),
              },
            },
          });
          const employee = await tx.role.create({
            data: { organizationId: org.id, name: "Empleado", code: "EMP" },
          });
          const createUser = async (roleId: string, active: boolean) => {
            const user = await tx.user.create({
              data: {
                email: `${randomUUID()}@example.invalid`,
                passwordHash: "test-only",
              },
            });
            await tx.userOrganization.create({
              data: {
                organizationId: org.id,
                userId: user.id,
                active,
                roles: { create: { roleId } },
              },
            });
            return user;
          };
          const actor = await createUser(owner.id, true);
          await createUser(employee.id, true);
          await createUser(employee.id, false);
          const scoped = new Proxy(tx, {
            get(target, key) {
              return key === "$transaction"
                ? (
                    fn: (client: Prisma.TransactionClient) => Promise<unknown>,
                  ) => fn(tx)
                : Reflect.get(target, key);
            },
          });
          const service = new RolesService(scoped as unknown as PrismaService);

          const listed = await service.list(actor.id, org.id);
          expect(
            listed.map(({ code, userCount }) => ({ code, userCount })),
          ).toEqual([
            { code: "EMP", userCount: 1 },
            { code: "OWNER", userCount: 1 },
          ]);

          const updated = await service.update(actor.id, org.id, employee.id, {
            name: "  Cajero  ",
            description: " Cobra en mostrador ",
            permissionCodes: ["SALE_READ", "SALE_READ"],
          });
          expect(updated).toEqual({
            id: employee.id,
            name: "Cajero",
            description: "Cobra en mostrador",
            permissionCodes: ["SALE_READ"],
          });
          const renamedOnly = await service.update(
            actor.id,
            org.id,
            employee.id,
            { description: "" },
          );
          expect(renamedOnly.description).toBeNull();
          expect(renamedOnly.permissionCodes).toEqual(["SALE_READ"]);
          expect(
            await tx.auditLog.findMany({
              where: { organizationId: org.id, entityType: "ROLE" },
              select: { action: true },
              orderBy: { createdAt: "asc" },
            }),
          ).toEqual([
            { action: "ROLE_PERMISSIONS_UPDATED" },
            { action: "ROLE_UPDATED" },
          ]);

          await expect(
            service.update(actor.id, org.id, owner.id, { name: "Otro" }),
          ).rejects.toThrow("dueño");
          await expect(
            service.update(actor.id, org.id, employee.id, {
              permissionCodes: ["NO_EXISTE"],
            }),
          ).rejects.toThrow("Revisá los permisos");
          await expect(
            service.update(actor.id, org.id, employee.id, { name: " a " }),
          ).rejects.toThrow("al menos 2");
          const created = await service.create(
            actor.id,
            org.id,
            "Farmacéutico",
            "FARMA",
            ["SALE_READ"],
            "Atiende recetas",
          );
          expect(created.description).toBe("Atiende recetas");
          throw rollback;
        },
        { timeout: 15000 },
      ),
    ).rejects.toBe(rollback);
  });
});
