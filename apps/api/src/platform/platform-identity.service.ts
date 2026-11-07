import {
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
  Injectable,
} from "@nestjs/common";

import { CredentialVault } from "../fiscal/credential-vault";
import { PrismaService } from "../prisma/prisma.service";
import { isPlatformSessionVerified } from "./platform-admin.guard";
import { recordPlatformAudit } from "./platform-audit";
import { generateTotpSecret, matchTotpStep, totpStep, totpUri } from "./totp";

const MAX_ATTEMPTS = 5;
const LOCK_MS = 15 * 60 * 1000;

const vaultContext = (userId: string) => `platform-totp:${userId}`;

@Injectable()
export class PlatformIdentityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly vault: CredentialVault,
  ) {}

  async session(userId: string, sessionId: string) {
    const [admin, session] = await Promise.all([
      this.prisma.platformAdmin.findUniqueOrThrow({
        where: { userId },
        select: { totpConfirmedAt: true },
      }),
      this.prisma.authSession.findUnique({
        where: { id: sessionId },
        select: { platformVerifiedAt: true },
      }),
    ]);
    return {
      enrolled: !!admin.totpConfirmedAt,
      verified: isPlatformSessionVerified(
        session?.platformVerifiedAt,
        new Date(),
      ),
    };
  }

  /** El secreto se muestra una sola vez y queda cifrado hasta confirmarlo con un código. */
  async enroll(userId: string, email: string) {
    const admin = await this.prisma.platformAdmin.findUniqueOrThrow({
      where: { userId },
      select: { totpConfirmedAt: true },
    });
    if (admin.totpConfirmedAt)
      throw new ConflictException(
        "Esta cuenta ya tiene su código configurado. Para reemplazarlo hay que resetearlo desde el servidor.",
      );
    const secret = generateTotpSecret();
    await this.prisma.platformAdmin.update({
      where: { userId },
      data: {
        totpSecret: await this.vault.seal(secret, vaultContext(userId)),
        totpLastStep: null,
        failedAttempts: 0,
        lockedUntil: null,
      },
    });
    return { secret, uri: totpUri(email, secret) };
  }

  async confirm(userId: string, sessionId: string, code: string) {
    return this.verifyCode(userId, sessionId, code, true);
  }

  async verify(userId: string, sessionId: string, code: string) {
    return this.verifyCode(userId, sessionId, code, false);
  }

  audit() {
    return this.prisma.platformAuditLog.findMany({
      orderBy: { createdAt: "desc" },
      take: 100,
    });
  }

  private async verifyCode(
    userId: string,
    sessionId: string,
    code: string,
    confirming: boolean,
  ) {
    const now = new Date();
    const admin = await this.prisma.platformAdmin.findUniqueOrThrow({
      where: { userId },
      select: {
        id: true,
        totpSecret: true,
        totpConfirmedAt: true,
        lockedUntil: true,
      },
    });
    if (!admin.totpSecret || !!admin.totpConfirmedAt === confirming)
      throw new ConflictException(
        confirming
          ? "No hay un código pendiente de confirmar."
          : "Todavía no configuraste el código de esta cuenta.",
      );
    if (admin.lockedUntil && admin.lockedUntil > now)
      throw new HttpException(
        "Demasiados intentos. Esperá unos minutos y volvé a probar.",
        HttpStatus.TOO_MANY_REQUESTS,
      );
    const secret = await this.vault.open(
      admin.totpSecret,
      vaultContext(userId),
    );
    const step = matchTotpStep(secret, code, now);
    // Reclamar el paso de forma atómica impide reutilizar un código, aun en paralelo.
    const claimed =
      step !== undefined &&
      (
        await this.prisma.platformAdmin.updateMany({
          where: {
            id: admin.id,
            OR: [{ totpLastStep: null }, { totpLastStep: { lt: step } }],
          },
          data: { totpLastStep: step, failedAttempts: 0, lockedUntil: null },
        })
      ).count === 1;
    if (!claimed) {
      await this.registerFailure(admin.id, userId, now);
      throw new BadRequestException("El código no es correcto.");
    }
    await this.prisma.$transaction(async (tx) => {
      if (confirming)
        await tx.platformAdmin.update({
          where: { id: admin.id },
          data: { totpConfirmedAt: now },
        });
      await tx.authSession.update({
        where: { id: sessionId },
        data: { platformVerifiedAt: now },
      });
      await recordPlatformAudit(tx, {
        actorId: userId,
        action: confirming
          ? "PLATFORM_TOTP_ENROLLED"
          : "PLATFORM_TOTP_VERIFIED",
        entityType: "PlatformAdmin",
        entityId: admin.id,
        after: { step: totpStep(now) },
      });
    });
    return { verified: true };
  }

  private async registerFailure(adminId: string, userId: string, now: Date) {
    await this.prisma.$transaction(async (tx) => {
      const { failedAttempts } = await tx.platformAdmin.update({
        where: { id: adminId },
        data: { failedAttempts: { increment: 1 } },
        select: { failedAttempts: true },
      });
      const locked = failedAttempts >= MAX_ATTEMPTS;
      if (locked)
        await tx.platformAdmin.update({
          where: { id: adminId },
          data: {
            failedAttempts: 0,
            lockedUntil: new Date(now.getTime() + LOCK_MS),
          },
        });
      await recordPlatformAudit(tx, {
        actorId: userId,
        action: locked ? "PLATFORM_TOTP_LOCKED" : "PLATFORM_TOTP_FAILED",
        entityType: "PlatformAdmin",
        entityId: adminId,
      });
    });
  }
}
