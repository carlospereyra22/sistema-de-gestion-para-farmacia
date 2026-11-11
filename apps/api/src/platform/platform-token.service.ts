import { Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma } from "@prisma/client";

import { resumenNavegador } from "../auth/sesion-vigencia";
import { PrismaService } from "../prisma/prisma.service";
import { recordPlatformAudit } from "./platform-audit";
import {
  PLATAFORMA_INACTIVIDAD_MS,
  PLATAFORMA_MAXIMO_MS,
  estadoDelToken,
  leerTokenDePlataforma,
  nuevoSecreto,
} from "./platform-token";

/** IP y navegador del pedido, para la auditoría (nunca el token). */
export type DatosDelPedido = { ip?: string; userAgent?: string };

const datosAuditados = (datos: DatosDelPedido) => ({
  ip: datos.ip ?? null,
  navegador: resumenNavegador(datos.userAgent),
});

/** Sesión de plataforma abierta, para "Sesiones del panel". */
export type SesionDePlataforma = {
  id: string;
  navegador: string | null;
  ip: string | null;
  deviceId: null;
  iniciada: string;
  ultimoUso: string;
  actual: boolean;
};

@Injectable()
export class PlatformTokenService {
  constructor(private readonly prisma: PrismaService) {}

  /** Entrega un token nuevo al ingresar bien el código. */
  async emitir(
    tx: Prisma.TransactionClient,
    userId: string,
    sessionId: string,
    datos: DatosDelPedido,
  ): Promise<string> {
    const { secreto, hash } = nuevoSecreto();
    const ahora = new Date();
    const token = await tx.platformToken.create({
      data: {
        userId,
        sessionId,
        tokenHash: hash,
        lastUsedAt: ahora,
        expiresAt: new Date(ahora.getTime() + PLATAFORMA_MAXIMO_MS),
        userAgent: resumenNavegador(datos.userAgent),
        ip: datos.ip?.slice(0, 64) ?? null,
      },
      select: { id: true },
    });
    await recordPlatformAudit(tx, {
      actorId: userId,
      action: "PLATFORM_TOKEN_ISSUED",
      entityType: "PlatformToken",
      entityId: token.id,
      after: datosAuditados(datos),
    });
    return `${token.id}.${secreto}`;
  }

  /**
   * Valida el token del encabezado para el usuario y la sesión del access
   * token. Devuelve su id o undefined. Renueva el uso cada pocos minutos.
   */
  async validar(
    encabezado: string | string[] | undefined,
    quien: { userId: string; sessionId: string },
    datos: DatosDelPedido,
  ): Promise<string | undefined> {
    const leido = leerTokenDePlataforma(encabezado);
    if (!leido) return undefined;
    const token = await this.prisma.platformToken.findUnique({
      where: { id: leido.id },
    });
    if (!token) return undefined;
    const ahora = new Date();
    const estado = estadoDelToken(token, quien, leido.secreto, ahora);
    if (!estado.valido) return undefined;
    if (estado.renovar)
      await this.prisma.$transaction(async (tx) => {
        // Sólo uno de varios pedidos simultáneos registra la renovación.
        const { count } = await tx.platformToken.updateMany({
          where: { id: token.id, lastUsedAt: token.lastUsedAt },
          data: { lastUsedAt: ahora },
        });
        if (count)
          await recordPlatformAudit(tx, {
            actorId: quien.userId,
            action: "PLATFORM_TOKEN_RENEWED",
            entityType: "PlatformToken",
            entityId: token.id,
            after: datosAuditados(datos),
          });
      });
    return token.id;
  }

  /** Revoca el token de esta pestaña ("Salir del panel"). */
  async revocarPropio(
    encabezado: string | string[] | undefined,
    quien: { userId: string; sessionId: string },
    datos: DatosDelPedido,
  ) {
    const leido = leerTokenDePlataforma(encabezado);
    if (!leido) return;
    const token = await this.prisma.platformToken.findUnique({
      where: { id: leido.id },
    });
    if (
      !token ||
      token.revokedAt ||
      estadoDelToken(token, quien, leido.secreto, new Date()).valido === false
    )
      return;
    await this.revocar(
      quien.userId,
      { id: token.id },
      "PLATFORM_TOKEN_REVOKED",
      datos,
    );
  }

  /** Revoca uno o varios tokens del usuario y lo audita. */
  async revocar(
    userId: string,
    filtro: Prisma.PlatformTokenWhereInput,
    action: string,
    datos: DatosDelPedido,
    db?: Prisma.TransactionClient,
  ): Promise<number> {
    const hacer = async (tx: Prisma.TransactionClient) => {
      const abiertos = await tx.platformToken.findMany({
        where: { ...filtro, userId, revokedAt: null },
        select: { id: true },
      });
      if (!abiertos.length) return 0;
      const ids = abiertos.map(({ id }) => id);
      await tx.platformToken.updateMany({
        where: { id: { in: ids } },
        data: { revokedAt: new Date() },
      });
      await recordPlatformAudit(tx, {
        actorId: userId,
        action,
        entityType: "PlatformToken",
        after: { tokenIds: ids, ...datosAuditados(datos) },
      });
      return ids.length;
    };
    return db ? hacer(db) : this.prisma.$transaction(hacer);
  }

  /** Sesiones del panel abiertas del superadmin. */
  async listar(userId: string, actual?: string): Promise<SesionDePlataforma[]> {
    const ahora = new Date();
    const tokens = await this.prisma.platformToken.findMany({
      where: {
        userId,
        revokedAt: null,
        expiresAt: { gt: ahora },
        lastUsedAt: {
          gte: new Date(ahora.getTime() - PLATAFORMA_INACTIVIDAD_MS),
        },
        session: { revokedAt: null },
      },
      orderBy: { lastUsedAt: "desc" },
    });
    return tokens.map((token) => ({
      id: token.id,
      navegador: token.userAgent,
      ip: token.ip,
      deviceId: null,
      iniciada: token.createdAt.toISOString(),
      ultimoUso: token.lastUsedAt.toISOString(),
      actual: token.id === actual,
    }));
  }

  async cerrarUno(userId: string, id: string, datos: DatosDelPedido) {
    const cerrados = await this.revocar(
      userId,
      { id },
      "PLATFORM_TOKEN_REVOKED",
      datos,
    );
    if (!cerrados)
      throw new NotFoundException("Esa sesión del panel ya no está abierta.");
    return { cerradas: cerrados };
  }
}
