import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { hash, verify } from "@node-rs/argon2";
import type { Prisma } from "@prisma/client";
import { randomBytes } from "node:crypto";

import { EnvironmentService } from "../config/environment.service";
import { PrismaService } from "../prisma/prisma.service";
import type { AccessTokenPayload } from "./auth.types";
import { clavePublicaValida } from "../sales/firma-venta";
import {
  GRACIA_ROTACION_MS,
  PLATAFORMA_SESION_INACTIVIDAD_MS,
  PLATAFORMA_SESION_MAXIMA_MS,
  inactividadMs,
  leerClaveDeSesion,
  resumenNavegador,
  retirar,
  vencidaPorInactividad,
} from "./sesion-vigencia";
import { filtroDeAbiertas, sesionesAbiertasDe } from "./sesiones-abiertas";

/** Datos para reconocer una sesión en "Sesiones abiertas" (SISTEMA-93). */
export type DatosDeSesion = {
  userAgent?: string;
  ip?: string;
  deviceId?: string;
};

const VENCIDA = "Tu sesión venció. Volvé a iniciar sesión.";

/** Lo que guarda la sesión sobre el navegador que la usa (sin datos sensibles). */
function datosGuardados(datos: DatosDeSesion) {
  return {
    ...(datos.userAgent
      ? { userAgent: resumenNavegador(datos.userAgent) }
      : {}),
    ...(datos.ip ? { ip: datos.ip.slice(0, 64) } : {}),
    ...(datos.deviceId ? { deviceId: datos.deviceId } : {}),
  };
}

/** Una auditoría por cada farmacia del usuario, como el cambio de contraseña. */
async function auditarSesion(
  tx: Prisma.TransactionClient,
  datos: {
    userId: string;
    actorId: string;
    action: string;
    sessionId: string;
    after?: Prisma.InputJsonObject;
  },
) {
  const membresias = await tx.userOrganization.findMany({
    where: { userId: datos.userId },
    select: { organizationId: true },
  });
  if (!membresias.length) return;
  await tx.auditLog.createMany({
    data: membresias.map(({ organizationId }) => ({
      organizationId,
      actorId: datos.actorId,
      entityType: "AUTH_SESSION",
      entityId: datos.sessionId,
      action: datos.action,
      after: { userId: datos.userId, ...datos.after },
    })),
  });
}

/**
 * La cookie del navegador es de otro usuario que la pestaña (SISTEMA-92). La
 * web pausa la pestaña: nunca cambia de usuario sola.
 */
export const SESION_DE_OTRO_USUARIO = "SESION_DE_OTRO_USUARIO";

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly environment: EnvironmentService,
  ) {}

  /** Días sin uso hasta que vence la sesión, en ms (mínimo 72 h). */
  get inactividadMs(): number {
    return inactividadMs(this.environment.sessionInactivityDays);
  }

  async login(email: string, password: string, datos: DatosDeSesion = {}) {
    if (!this.environment.jwtAccessSecret)
      throw new UnauthorizedException("Authentication is not configured.");
    const user = await this.prisma.user.findUnique({
      where: { email: email.trim().toLowerCase() },
      include: { platformAdmin: { select: { active: true } } },
    });
    if (!user?.active || !(await verify(user.passwordHash, password)))
      throw new UnauthorizedException("Email o contraseña incorrectos.");
    // Superadmin: sesión con vencimiento y cookie no persistente (SISTEMA-94).
    const plataforma = user.platformAdmin?.active ?? false;
    return {
      ...(await this.createSession(user.id, user.email, datos, plataforma)),
      persistente: !plataforma,
    };
  }

  /**
   * Guarda la clave con la que esta PC firma las ventas sin conexión del
   * usuario (SISTEMA-66). Se registra al entrar con conexión; volver a
   * registrarla la reemplaza.
   */
  async registerOfflineKey(
    userId: string,
    deviceId: string,
    publicKey: string,
  ) {
    if (!clavePublicaValida(publicKey))
      throw new BadRequestException("La clave de la PC no es válida.");
    await this.prisma.offlineDeviceKey.upsert({
      where: { userId_deviceId: { userId, deviceId } },
      create: { userId, deviceId, publicKey },
      update: { publicKey },
    });
  }

  async getProfile(userId: string) {
    return this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        active: true,
        mustChangePassword: true,
        platformAdmin: { select: { active: true } },
        organizations: {
          include: {
            organization: true,
            roles: {
              include: {
                role: {
                  include: { permissions: { include: { permission: true } } },
                },
              },
            },
          },
        },
        branches: { include: { branch: true } },
      },
    });
  }

  /**
   * Renueva el access token (SISTEMA-93). La sesión vence si no se usa durante
   * el plazo de inactividad. Cada renovación con la clave actual la rota: la
   * anterior vale un rato corto (varias pestañas, reintentos). Una clave vieja
   * fuera de ese margen es señal de que copiaron la cookie: se revoca la sesión
   * y se audita. `refreshToken` sólo viene cuando hay que guardar una cookie
   * nueva.
   */
  async refresh(
    refreshToken: string | undefined,
    usuarioEsperado?: string,
    datos: DatosDeSesion = {},
  ): Promise<{
    accessToken: string;
    refreshToken?: string;
    /** La cookie sobrevive al cierre del navegador (no para superadmin). */
    persistente: boolean;
  }> {
    const clave = leerClaveDeSesion(refreshToken);
    if (!clave) throw new UnauthorizedException(VENCIDA);
    const ahora = new Date();
    // El hash de la clave nueva se calcula antes de bloquear la fila.
    const nuevoSecreto = randomBytes(48).toString("base64url");
    const nuevoHash = await hash(nuevoSecreto);
    const resultado = await this.prisma.$transaction(async (tx) => {
      // Dos renovaciones a la vez no se pisan: la segunda espera a la primera.
      await tx.$queryRaw`SELECT id FROM "AuthSession" WHERE id = ${clave.sessionId}::uuid FOR UPDATE`;
      const session = await tx.authSession.findFirst({
        where: {
          id: clave.sessionId,
          revokedAt: null,
          OR: [{ expiresAt: null }, { expiresAt: { gt: ahora } }],
        },
        include: {
          user: { include: { platformAdmin: { select: { active: true } } } },
        },
      });
      const plataforma = session?.user.platformAdmin?.active ?? false;
      if (
        !session ||
        vencidaPorInactividad(
          session.lastUsedAt,
          ahora,
          plataforma ? PLATAFORMA_SESION_INACTIVIDAD_MS : this.inactividadMs,
        )
      )
        return { tipo: "vencida" } as const;
      const esActual = await verify(session.tokenHash, clave.secret);
      const esAnterior =
        !esActual && session.previousTokenHash
          ? await verify(session.previousTokenHash, clave.secret)
          : false;
      const enGracia =
        esAnterior &&
        !!session.previousTokenValidUntil &&
        session.previousTokenValidUntil > ahora;
      if (!esActual && !enGracia) {
        let copiada = esAnterior;
        for (const retirada of session.retiredTokenHashes) {
          if (copiada) break;
          copiada = await verify(retirada, clave.secret);
        }
        if (!copiada) return { tipo: "vencida" } as const;
        await tx.authSession.update({
          where: { id: session.id },
          data: { revokedAt: ahora },
        });
        await auditarSesion(tx, {
          userId: session.userId,
          actorId: session.userId,
          action: "SESSION_REUSE_DETECTED",
          sessionId: session.id,
          after: {
            navegador: resumenNavegador(datos.userAgent),
            ip: datos.ip ?? null,
          },
        });
        return { tipo: "copiada" } as const;
      }
      if (!session.user.active) return { tipo: "inactivo" } as const;
      // Otra pestaña inició sesión con otro usuario: no se entrega su token ni
      // se toca su sesión, que sigue siendo válida para esa pestaña.
      if (usuarioEsperado && session.user.id !== usuarioEsperado)
        return { tipo: "otro", email: session.user.email } as const;
      await tx.authSession.update({
        where: { id: session.id },
        data: {
          lastUsedAt: ahora,
          ...datosGuardados(datos),
          ...(esActual
            ? {
                tokenHash: nuevoHash,
                previousTokenHash: session.tokenHash,
                previousTokenValidUntil: new Date(
                  ahora.getTime() + GRACIA_ROTACION_MS,
                ),
                retiredTokenHashes: retirar(
                  session.previousTokenHash,
                  session.retiredTokenHashes,
                ),
              }
            : {}),
        },
      });
      return {
        tipo: "ok",
        user: session.user,
        sessionId: session.id,
        rotada: esActual,
        plataforma,
      } as const;
    });
    switch (resultado.tipo) {
      case "vencida":
      case "copiada":
        throw new UnauthorizedException(VENCIDA);
      case "inactivo":
        throw new UnauthorizedException("El usuario está desactivado.");
      case "otro":
        throw new ConflictException({
          message:
            "En este navegador se inició sesión con otro usuario. Esta pestaña se pausó.",
          error: SESION_DE_OTRO_USUARIO,
          details: { email: resultado.email },
        });
    }
    const payload: AccessTokenPayload = {
      sub: resultado.user.id,
      sessionId: resultado.sessionId,
      email: resultado.user.email,
    };
    return {
      accessToken: await this.jwt.signAsync(payload, { expiresIn: "15m" }),
      ...(resultado.rotada
        ? { refreshToken: `${resultado.sessionId}.${nuevoSecreto}` }
        : {}),
      persistente: !resultado.plataforma,
    };
  }

  async logout(refreshToken: string | undefined): Promise<void> {
    const clave = leerClaveDeSesion(refreshToken);
    if (!clave) return;
    const ahora = new Date();
    const session = await this.prisma.authSession.findFirst({
      where: {
        id: clave.sessionId,
        revokedAt: null,
        OR: [{ expiresAt: null }, { expiresAt: { gt: ahora } }],
      },
      select: {
        id: true,
        tokenHash: true,
        previousTokenHash: true,
        previousTokenValidUntil: true,
      },
    });
    if (!session) return;
    // Con la clave actual o con la anterior dentro del margen (otra pestaña
    // pudo rotarla un instante antes).
    const valida =
      (await verify(session.tokenHash, clave.secret)) ||
      (!!session.previousTokenHash &&
        !!session.previousTokenValidUntil &&
        session.previousTokenValidUntil > ahora &&
        (await verify(session.previousTokenHash, clave.secret)));
    if (!valida) return;
    await this.prisma.authSession.update({
      where: { id: session.id },
      data: { revokedAt: ahora },
    });
  }

  /** Sesiones abiertas del propio usuario (menú de la cuenta, SISTEMA-93). */
  async listarSesionesPropias(userId: string, sessionId: string) {
    return sesionesAbiertasDe(
      this.prisma,
      userId,
      new Date(),
      this.inactividadMs,
      sessionId,
    );
  }

  /**
   * Cierra una sesión propia, o todas menos la actual si `sesion` no viene.
   * Lo hecho sin conexión en esa PC no se borra: al volver se pide la
   * contraseña y se sincroniza con su dueño (OFFLINE.md).
   */
  async cerrarSesionesPropias(
    userId: string,
    sessionId: string,
    sesion?: string,
  ): Promise<{ cerradas: number }> {
    if (sesion === sessionId)
      throw new BadRequestException(
        "Para cerrar esta sesión usá Cerrar sesión.",
      );
    const ahora = new Date();
    return this.prisma.$transaction(async (tx) => {
      const where: Prisma.AuthSessionWhereInput = {
        ...filtroDeAbiertas(userId, ahora, this.inactividadMs),
        ...(sesion ? { id: sesion } : { id: { not: sessionId } }),
      };
      const abiertas = await tx.authSession.findMany({
        where,
        select: { id: true },
      });
      if (sesion && !abiertas.length)
        throw new NotFoundException("Esa sesión ya no está abierta.");
      const { count } = await tx.authSession.updateMany({
        where: { id: { in: abiertas.map(({ id }) => id) } },
        data: { revokedAt: ahora },
      });
      for (const { id } of abiertas)
        await auditarSesion(tx, {
          userId,
          actorId: userId,
          action: "SESSION_REVOKED_BY_USER",
          sessionId: id,
        });
      return { cerradas: count };
    });
  }

  /**
   * El usuario cambia su propia contraseña. Conserva la sesión desde la que lo hace y
   * cierra las demás. La clave incorrecta responde 400: un 401 cerraría la sesión en la web.
   */
  async changePassword(
    userId: string,
    sessionId: string,
    currentPassword: string,
    newPassword: string,
  ) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        active: true,
        passwordHash: true,
        organizations: { select: { organizationId: true } },
      },
    });
    if (!user?.active || !(await verify(user.passwordHash, currentPassword)))
      throw new BadRequestException("La contraseña actual no es correcta.");
    if (await verify(user.passwordHash, newPassword))
      throw new BadRequestException(
        "La contraseña nueva tiene que ser distinta de la actual.",
      );
    const passwordHash = await hash(newPassword);
    return this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: userId },
        data: { passwordHash, mustChangePassword: false },
      });
      const revoked = await tx.authSession.updateMany({
        where: { userId, revokedAt: null, id: { not: sessionId } },
        data: { revokedAt: new Date() },
      });
      // Superadmin: el panel vuelve a pedir el código en todas las pestañas.
      await tx.platformToken.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await tx.auditLog.createMany({
        data: user.organizations.map(({ organizationId }) => ({
          organizationId,
          actorId: userId,
          entityType: "USER",
          entityId: userId,
          action: "PASSWORD_CHANGED_BY_USER",
          after: { revokedSessions: revoked.count },
        })),
      });
      return { revokedSessions: revoked.count };
    });
  }

  private async createSession(
    userId: string,
    email: string,
    datos: DatosDeSesion,
    plataforma = false,
  ) {
    const refreshSecret = randomBytes(48).toString("base64url");
    const session = await this.prisma.authSession.create({
      data: {
        userId,
        tokenHash: await hash(refreshSecret),
        expiresAt: plataforma
          ? new Date(Date.now() + PLATAFORMA_SESION_MAXIMA_MS)
          : null,
        ...datosGuardados(datos),
      },
    });
    const payload: AccessTokenPayload = {
      sub: userId,
      sessionId: session.id,
      email,
    };
    return {
      accessToken: await this.jwt.signAsync(payload, { expiresIn: "15m" }),
      refreshToken: `${session.id}.${refreshSecret}`,
    };
  }
}
