import { randomUUID } from "node:crypto";
import { Test, type TestingModule } from "@nestjs/testing";
import { Prisma } from "@prisma/client";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/prisma/prisma.service";
import { UsersService } from "../src/users/users.service";

describe("edición de usuarios (datos locales que se descartan)", () => {
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

  it("cambia nombre, roles y sucursales con auditoría, y protege los accesos propios y al último dueño", async () => {
    const rollback = new Error("ROLLBACK_USER_UPDATE_FIXTURES");
    await expect(
      prisma.$transaction(
        async (tx) => {
          const org = await tx.organization.create({
            data: { name: "Usuarios fixture" },
          });
          const branch = (code: string) =>
            tx.branch.create({
              data: { organizationId: org.id, name: code, code },
            });
          const centro = await branch("CENTRO");
          const norte = await branch("NORTE");
          const manage = await tx.permission.findMany({
            where: { code: { in: ["USER_READ", "USER_MANAGE"] } },
          });
          const owner = await tx.role.create({
            data: {
              organizationId: org.id,
              name: "Owner",
              code: "OWNER",
              permissions: {
                create: manage.map((p) => ({ permissionId: p.id })),
              },
            },
          });
          const cashier = await tx.role.create({
            data: { organizationId: org.id, name: "Cajero", code: "CAJERO" },
          });
          const seller = await tx.role.create({
            data: { organizationId: org.id, name: "Vendedor", code: "VENDE" },
          });
          const createUser = async (roleId: string) => {
            const user = await tx.user.create({
              data: {
                email: `${randomUUID()}@example.invalid`,
                passwordHash: "test-only",
                branches: { create: { branchId: centro.id } },
              },
            });
            await tx.userOrganization.create({
              data: {
                organizationId: org.id,
                userId: user.id,
                roles: { create: { roleId } },
              },
            });
            return user;
          };
          const actor = await createUser(owner.id);
          const employee = await createUser(cashier.id);
          const scoped = new Proxy(tx, {
            get(target, key) {
              return key === "$transaction"
                ? (
                    fn: (client: Prisma.TransactionClient) => Promise<unknown>,
                  ) => fn(tx)
                : Reflect.get(target, key);
            },
          });
          const service = new UsersService(scoped as unknown as PrismaService);

          const listed = await service.list(actor.id, org.id);
          expect(
            listed.find(({ userId }) => userId === actor.id)?.isCurrentUser,
          ).toBe(true);
          expect(
            listed.find(({ userId }) => userId === employee.id)?.isCurrentUser,
          ).toBe(false);

          const updated = await service.update(actor.id, org.id, employee.id, {
            active: true,
            displayName: "  Ana  ",
            roleIds: [seller.id, cashier.id],
            branchIds: [norte.id, centro.id],
          });
          expect(updated.displayName).toBe("Ana");
          expect(updated.roleIds).toEqual([cashier.id, seller.id].sort());
          expect(
            await tx.userBranch.count({ where: { userId: employee.id } }),
          ).toBe(2);
          const audit = await tx.auditLog.findFirstOrThrow({
            where: { organizationId: org.id, action: "USER_UPDATED" },
          });
          expect(audit.before).toMatchObject({ displayName: null });
          expect(audit.after).toMatchObject({ displayName: "Ana" });

          await expect(
            service.update(actor.id, org.id, employee.id, {
              active: true,
              roleIds: [randomUUID()],
              branchIds: [centro.id],
            }),
          ).rejects.toThrow("Revisá los roles");

          // Cambiarse el nombre sí, los accesos propios no.
          const renamed = await service.update(actor.id, org.id, actor.id, {
            active: true,
            displayName: "Dueña",
            roleIds: [owner.id],
            branchIds: [centro.id],
          });
          expect(renamed.displayName).toBe("Dueña");
          await expect(
            service.update(actor.id, org.id, actor.id, {
              active: true,
              roleIds: [owner.id, seller.id],
              branchIds: [centro.id],
            }),
          ).rejects.toThrow("tus propios roles");

          // El último dueño activo no puede perder el rol.
          await tx.userOrganizationRole.create({
            data: {
              membershipId: (
                await tx.userOrganization.findFirstOrThrow({
                  where: { userId: employee.id },
                })
              ).id,
              roleId: owner.id,
            },
          });
          await service.update(actor.id, org.id, employee.id, {
            active: true,
            roleIds: [seller.id],
            branchIds: [centro.id],
          });
          await expect(
            service.update(employee.id, org.id, actor.id, {
              active: false,
              roleIds: [owner.id],
              branchIds: [centro.id],
            }),
          ).rejects.toThrow();
          throw rollback;
        },
        { timeout: 20000 },
      ),
    ).rejects.toBe(rollback);
  });
});
