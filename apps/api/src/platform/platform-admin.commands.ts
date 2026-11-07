import type { PrismaClient } from "@prisma/client";

import { recordPlatformAudit } from "./platform-audit";

export class PlatformCommandError extends Error {}

const normalize = (email: string) => email.trim().toLowerCase();

async function findAdmin(
  prisma: Pick<PrismaClient, "platformAdmin">,
  email: string,
) {
  const admin = await prisma.platformAdmin.findFirst({
    where: { user: { email: normalize(email) } },
    select: { id: true, userId: true },
  });
  if (!admin)
    throw new PlatformCommandError(
      "Ese correo no es una cuenta de plataforma.",
    );
  return admin;
}

/**
 * Único camino para otorgar acceso: no existe ningún endpoint que lo haga. La cuenta es
 * exclusiva: si el correo ya pertenece a una farmacia se rechaza, para no mezclar accesos.
 */
export async function createPlatformAdmin(
  prisma: PrismaClient,
  email: string,
  passwordHash: string,
) {
  const address = normalize(email);
  return prisma.$transaction(async (tx) => {
    const existing = await tx.user.findUnique({
      where: { email: address },
      select: { _count: { select: { organizations: true } } },
    });
    if (existing?._count.organizations)
      throw new PlatformCommandError(
        "Ese correo pertenece a una farmacia. Usá uno exclusivo para la plataforma.",
      );
    const user = await tx.user.upsert({
      where: { email: address },
      update: { passwordHash, active: true },
      create: { email: address, passwordHash },
      select: { id: true },
    });
    await tx.authSession.updateMany({
      where: { userId: user.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    const admin = await tx.platformAdmin.upsert({
      where: { userId: user.id },
      update: { active: true },
      create: { userId: user.id },
      select: { id: true },
    });
    await recordPlatformAudit(tx, {
      action: "PLATFORM_ADMIN_GRANTED",
      entityType: "PlatformAdmin",
      entityId: admin.id,
      after: { email: address },
    });
    return { email: address };
  });
}

export async function revokePlatformAdmin(prisma: PrismaClient, email: string) {
  const admin = await findAdmin(prisma, email);
  await prisma.$transaction(async (tx) => {
    await tx.platformAdmin.update({
      where: { id: admin.id },
      data: { active: false },
    });
    await tx.authSession.updateMany({
      where: { userId: admin.userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    await recordPlatformAudit(tx, {
      action: "PLATFORM_ADMIN_REVOKED",
      entityType: "PlatformAdmin",
      entityId: admin.id,
    });
  });
}

/** Para un celular perdido: obliga a configurar el código de nuevo. */
export async function resetPlatformCode(prisma: PrismaClient, email: string) {
  const admin = await findAdmin(prisma, email);
  await prisma.$transaction(async (tx) => {
    await tx.platformAdmin.update({
      where: { id: admin.id },
      data: {
        totpSecret: null,
        totpConfirmedAt: null,
        totpLastStep: null,
        failedAttempts: 0,
        lockedUntil: null,
      },
    });
    await tx.authSession.updateMany({
      where: { userId: admin.userId },
      data: { platformVerifiedAt: null },
    });
    await recordPlatformAudit(tx, {
      action: "PLATFORM_TOTP_RESET",
      entityType: "PlatformAdmin",
      entityId: admin.id,
    });
  });
}

export function listPlatformAdmins(prisma: PrismaClient) {
  return prisma.platformAdmin.findMany({
    orderBy: { createdAt: "asc" },
    select: {
      active: true,
      totpConfirmedAt: true,
      user: { select: { email: true } },
    },
  });
}
