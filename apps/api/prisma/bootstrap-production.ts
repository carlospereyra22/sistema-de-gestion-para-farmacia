import { hash } from "@node-rs/argon2";
import { Prisma, PrismaClient } from "@prisma/client";
import { z } from "zod";

const settingsSchema = z.object({
  organizationName: z.string().trim().min(1).max(200),
  branchName: z.string().trim().min(1).max(200),
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(16).max(256),
});

export class BootstrapInputError extends Error {}

export function parseBootstrapSettings(input: unknown) {
  const result = settingsSchema.safeParse(input);
  if (!result.success) {
    throw new BootstrapInputError(
      "Datos invalidos: nombres y correo requeridos; clave de 16 a 256 caracteres.",
    );
  }
  return result.data;
}

export const productionPermissions = [
  ["USER_READ", "Read users"],
  ["USER_MANAGE", "Manage users"],
  ["ROLE_READ", "Read roles"],
  ["ROLE_MANAGE", "Manage roles"],
  ["ORGANIZATION_READ", "Read organization settings"],
  ["ORGANIZATION_MANAGE", "Manage branches"],
  ["CATALOG_READ", "Read catalog"],
  ["CATALOG_MANAGE", "Manage catalog"],
  ["PARTY_READ", "Read customers and suppliers"],
  ["PARTY_MANAGE", "Manage customers and suppliers"],
  ["ACCOUNT_READ", "Read customer current accounts"],
  ["ACCOUNT_MANAGE", "Manage customer current accounts"],
  ["INVENTORY_READ", "Read inventory"],
  ["INVENTORY_MANAGE", "Receive and adjust inventory"],
  ["SALE_READ", "Read sales"],
  ["SALE_MANAGE", "Complete sales"],
  ["CASH_READ", "Read cash registers and sessions"],
  ["CASH_MANAGE", "Manage cash registers and sessions"],
  ["PURCHASE_READ", "Read purchases"],
  ["PURCHASE_MANAGE", "Manage purchases and receipts"],
  ["REPORT_READ", "Read operational reports"],
] as const;

/** One-shot setup for a freshly migrated database, never a password reset. */
export async function bootstrapProduction(
  prisma: PrismaClient,
  input: unknown,
) {
  const settings = parseBootstrapSettings(input);
  const passwordHash = await hash(settings.password);
  return prisma.$transaction(
    async (tx) => {
      // Serialize concurrent invocations before checking the empty database.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(741286301)`;
      if (
        (await tx.organization.count()) > 0 ||
        (await tx.user.count()) > 0 ||
        (await tx.branch.count()) > 0
      ) {
        throw new BootstrapInputError(
          "La base ya tiene organizaciones, sucursales o usuarios. No se modifico nada. No repitas el seed.",
        );
      }
      const organization = await tx.organization.create({
        data: { name: settings.organizationName },
      });
      const branch = await tx.branch.create({
        data: {
          organizationId: organization.id,
          name: settings.branchName,
          code: "PRINCIPAL",
        },
      });
      const roles = [];
      for (const [code, name] of [
        ["OWNER", "Owner"],
        ["ADMIN", "Administrator"],
        ["USER", "User"],
      ] as const) {
        roles.push(
          await tx.role.create({
            data: { organizationId: organization.id, code, name },
          }),
        );
      }
      for (const [code, description] of productionPermissions) {
        const permission = await tx.permission.upsert({
          where: { code },
          update: {},
          create: { code, description },
        });
        for (const role of roles.filter((item) => item.code !== "USER")) {
          await tx.rolePermission.create({
            data: { roleId: role.id, permissionId: permission.id },
          });
        }
      }
      const ownerRole = roles.find((role) => role.code === "OWNER");
      if (!ownerRole) throw new Error("Owner role missing");
      const owner = await tx.user.create({
        data: { email: settings.email, passwordHash },
      });
      const membership = await tx.userOrganization.create({
        data: { userId: owner.id, organizationId: organization.id },
      });
      await tx.userBranch.create({
        data: { userId: owner.id, branchId: branch.id },
      });
      await tx.userOrganizationRole.create({
        data: { membershipId: membership.id, roleId: ownerRole.id },
      });
      await tx.auditLog.create({
        data: {
          organizationId: organization.id,
          branchId: branch.id,
          actorId: owner.id,
          entityType: "Organization",
          entityId: organization.id,
          action: "PRODUCTION_BOOTSTRAP",
          after: {
            organizationName: organization.name,
            branchName: branch.name,
            email: owner.email,
          },
        },
      });
      return {
        organizationName: organization.name,
        branchName: branch.name,
        email: owner.email,
      };
    },
    {
      isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
      timeout: 30000,
    },
  );
}

async function main(): Promise<void> {
  const prisma = new PrismaClient({ log: [] });
  try {
    const result = await bootstrapProduction(prisma, {
      organizationName: process.env.BOOTSTRAP_ORGANIZATION,
      branchName: process.env.BOOTSTRAP_BRANCH,
      email: process.env.BOOTSTRAP_EMAIL,
      password: process.env.BOOTSTRAP_PASSWORD,
    });
    console.log("Alta inicial completada:", result);
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  void main().catch((error: unknown) => {
    // Never print Prisma's full error: it can contain query inputs or credentials.
    console.error(
      error instanceof BootstrapInputError
        ? error.message
        : "No se completo el alta. Verifica la conexion y las migraciones. La transaccion no guardo cambios parciales.",
    );
    process.exitCode = 1;
  });
}
