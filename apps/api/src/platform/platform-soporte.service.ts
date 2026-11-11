import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { hash } from "@node-rs/argon2";
import { randomBytes } from "node:crypto";

import type { AccessTokenPayload } from "../auth/auth.types";
import { PrismaService } from "../prisma/prisma.service";
import { recordPlatformAudit } from "./platform-audit";

/** Cuánto dura una sesión de soporte: después hay que volver a entrar. */
export const DURACION_SOPORTE_MS = 4 * 60 * 60 * 1000;

/**
 * Entrar como un usuario de una farmacia, para reproducir y arreglar un problema
 * (SISTEMA-89, decisión del usuario del 11/11/2026). Se crea una sesión del
 * usuario que no se puede renovar (no hay clave de renovación) y vence sola; el
 * token lleva la marca `soporte`. La farmacia no lo ve: queda sólo en la
 * auditoría de la plataforma, con la hora de entrada y de salida.
 */
@Injectable()
export class PlatformSoporteService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  async entrar(adminId: string, organizationId: string, userId: string) {
    const membresia = await this.prisma.userOrganization.findFirst({
      where: { organizationId, userId },
      select: { active: true, user: { select: { email: true, active: true } } },
    });
    if (!membresia)
      throw new NotFoundException("Ese usuario no es de esta farmacia.");
    if (!membresia.active || !membresia.user.active)
      throw new BadRequestException(
        "El usuario está desactivado: activalo desde la farmacia para entrar como él.",
      );
    if (
      await this.prisma.platformAdmin.findFirst({
        where: { userId, active: true },
      })
    )
      throw new BadRequestException(
        "No se puede entrar como otra cuenta de plataforma.",
      );
    const expiresAt = new Date(Date.now() + DURACION_SOPORTE_MS);
    const session = await this.prisma.$transaction(async (tx) => {
      const nueva = await tx.authSession.create({
        data: {
          userId,
          // Sin clave de renovación: el secreto no se entrega a nadie.
          tokenHash: await hash(randomBytes(48).toString("base64url")),
          expiresAt,
        },
        select: { id: true },
      });
      await recordPlatformAudit(tx, {
        actorId: adminId,
        action: "SOPORTE_ENTRO",
        entityType: "User",
        entityId: userId,
        organizationId,
        after: { email: membresia.user.email, sessionId: nueva.id },
      });
      return nueva;
    });
    const payload: AccessTokenPayload = {
      sub: userId,
      sessionId: session.id,
      email: membresia.user.email,
      soporte: { adminId },
    };
    return {
      accessToken: await this.jwt.signAsync(payload, {
        expiresIn: Math.floor(DURACION_SOPORTE_MS / 1000),
      }),
      sessionId: session.id,
      expiresAt: expiresAt.toISOString(),
    };
  }

  /** Volver al panel: la sesión de soporte deja de servir en el momento. */
  async salir(adminId: string, sessionId: string) {
    const entrada = await this.prisma.platformAuditLog.findFirst({
      where: {
        actorId: adminId,
        action: "SOPORTE_ENTRO",
        after: { path: ["sessionId"], equals: sessionId },
      },
      select: { entityId: true, organizationId: true },
    });
    if (!entrada)
      throw new NotFoundException("Sesión de soporte no encontrada.");
    await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.authSession.updateMany({
        where: { id: sessionId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      if (count)
        await recordPlatformAudit(tx, {
          actorId: adminId,
          action: "SOPORTE_SALIO",
          entityType: "User",
          entityId: entrada.entityId,
          organizationId: entrada.organizationId,
          after: { sessionId },
        });
    });
  }
}
