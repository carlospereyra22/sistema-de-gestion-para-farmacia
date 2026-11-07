import { randomUUID } from "node:crypto";
import { ForbiddenException } from "@nestjs/common";
import { Test, type TestingModule } from "@nestjs/testing";
import { Prisma } from "@prisma/client";
import { AppModule } from "../src/app.module";
import { changeBranchProduct } from "../src/catalog/branch-product-lifecycle";
import {
  organizationPermissions,
  provisionOrganizationGraph,
} from "../src/organizations/organization-provisioning";
import { PrismaService } from "../src/prisma/prisma.service";

describe("alta de farmacias con datos existentes (fixtures con rollback)", () => {
  let app: TestingModule;
  let prisma: PrismaService;

  beforeAll(async () => {
    app = await Test.createTestingModule({ imports: [AppModule] }).compile();
    const url = new URL(process.env.DATABASE_URL!);
    if (
      !["localhost", "127.0.0.1"].includes(url.hostname) ||
      url.pathname !== "/gestion_dev"
    )
      throw new Error("Solo base local de desarrollo");
    prisma = app.get(PrismaService);
    await prisma.$connect();
  });

  afterAll(async () => {
    await app?.close();
  });

  async function rollback(
    run: (tx: Prisma.TransactionClient) => Promise<void>,
  ) {
    const sentinel = new Error("ROLLBACK_PROVISIONING");
    await expect(
      prisma.$transaction(
        async (tx) => {
          await run(tx);
          throw sentinel;
        },
        { timeout: 30000 },
      ),
    ).rejects.toBe(sentinel);
  }

  const provision = (tx: Prisma.TransactionClient, organizationName: string) =>
    provisionOrganizationGraph(tx, {
      organizationName,
      branchName: "Sucursal de prueba",
      ownerEmail: `${randomUUID()}@example.invalid`,
      ownerPasswordHash: "fixture",
    });

  it("crea dos farmacias en la misma base, cada una con sus roles", async () => {
    await rollback(async (tx) => {
      const first = await provision(tx, "Farmacia uno");
      const second = await provision(tx, "Farmacia dos");

      expect(second.organization.id).not.toBe(first.organization.id);
      const roles = await tx.role.findMany({
        where: { organizationId: second.organization.id },
        include: { _count: { select: { permissions: true } } },
      });
      expect(
        Object.fromEntries(
          roles.map((role) => [role.code, role._count.permissions]),
        ),
      ).toEqual({
        OWNER: organizationPermissions.length,
        ADMIN: organizationPermissions.length,
        USER: 0,
      });
    });
  });

  it("deja al dueño asignado a la sucursal principal con el rol OWNER", async () => {
    await rollback(async (tx) => {
      const { organization, branch, owner } = await provision(tx, "Farmacia");

      const membership = await tx.userOrganization.findUniqueOrThrow({
        where: {
          userId_organizationId: {
            userId: owner.id,
            organizationId: organization.id,
          },
        },
        include: { roles: { include: { role: true } } },
      });
      expect(membership.roles.map(({ role }) => role.code)).toEqual(["OWNER"]);
      expect(branch.code).toBe("PRINCIPAL");
      await expect(
        tx.userBranch.count({
          where: { userId: owner.id, branchId: branch.id },
        }),
      ).resolves.toBe(1);
    });
  });

  it("permite al dueño cambiar el estado de un producto, pero no al rol USER", async () => {
    await rollback(async (tx) => {
      const { organization, branch, owner } = await provision(tx, "Farmacia");
      const product = await tx.product.create({
        data: { organizationId: organization.id, name: "Producto de prueba" },
      });
      const change = {
        status: "ARCHIVED",
        expectedStatus: "ACTIVE",
        expectedUpdatedAt: null,
        reason: "Prueba de permisos",
      } as const;

      const userRole = await tx.role.findFirstOrThrow({
        where: { organizationId: organization.id, code: "USER" },
      });
      const employee = await tx.user.create({
        data: {
          email: `${randomUUID()}@example.invalid`,
          passwordHash: "fixture",
        },
      });
      await tx.userOrganization.create({
        data: {
          organizationId: organization.id,
          userId: employee.id,
          roles: { create: { roleId: userRole.id } },
        },
      });
      await tx.userBranch.create({
        data: { userId: employee.id, branchId: branch.id },
      });

      await expect(
        changeBranchProduct(
          tx,
          employee.id,
          organization.id,
          branch.id,
          product.id,
          change,
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
      await expect(
        changeBranchProduct(
          tx,
          owner.id,
          organization.id,
          branch.id,
          product.id,
          change,
        ),
      ).resolves.toEqual({ id: product.id, status: "ARCHIVED" });
    });
  });
});
