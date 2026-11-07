import { hash } from "@node-rs/argon2";
import { Prisma, PrismaClient } from "@prisma/client";
import { z } from "zod";

import { provisionOrganizationGraph } from "../src/organizations/organization-provisioning";

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

export { organizationPermissions as productionPermissions } from "../src/organizations/organization-provisioning";

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
      const { organization, branch, owner } = await provisionOrganizationGraph(
        tx,
        {
          organizationName: settings.organizationName,
          branchName: settings.branchName,
          ownerEmail: settings.email,
          ownerPasswordHash: passwordHash,
        },
      );
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
