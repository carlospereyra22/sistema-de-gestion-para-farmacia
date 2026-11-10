import { createHash } from "node:crypto";
import { ConflictException } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import type { PrismaService } from "../../prisma/prisma.service";
import { offlineOccurredAt } from "../../sales/offline-sale";
import { subscriptionAccessAt } from "../../platform/subscription-access";
import { subscriptionDenied } from "../../platform/subscription-gate";

// Registro común de las operaciones hechas sin conexión (SISTEMA-70): la
// operación queda una sola vez (`OfflineOperation`), con sus avisos "a
// revisar" y, si la mandó otro usuario de la PC, con quién la reenvió. Todo en
// la misma transacción que la operación: si algo falla, se deshace entero.

export type AvisoSinConexion = {
  kind: string;
  detail: Prisma.InputJsonValue;
};

export type ContextoSinConexion = {
  /** Id de la operación en la PC (`clientOperationId`). */
  operationId: string;
  kind: string;
  occurredAt: Date;
  deviceId: string;
  requestHash: string;
  avisos: AvisoSinConexion[];
  /** Quien la mandó, si no es quien la hizo (operación firmada). */
  reenviadaPor?: string;
};

function canonico(valor: unknown): unknown {
  if (Array.isArray(valor)) return valor.map(canonico);
  if (valor && typeof valor === "object")
    return Object.fromEntries(
      Object.entries(valor as Record<string, unknown>)
        .filter(([, item]) => item !== undefined)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([clave, item]) => [clave, canonico(item)]),
    );
  return valor;
}

/** Huella de los datos de negocio: el mismo id con otros datos es un error. */
export function huellaSinConexion(datos: unknown) {
  return createHash("sha256")
    .update(JSON.stringify(canonico(datos)))
    .digest("hex");
}

/** Arma el contexto validando la hora real y la suscripción de ese momento. */
export async function contextoSinConexion(
  prisma: PrismaService,
  organizationId: string,
  datos: {
    operationId: string;
    kind: string;
    occurredAt: string;
    deviceId: string;
    negocio: unknown;
    reenviadaPor?: string;
    /** Termina algo pendiente (recibir): se acepta también en solo lectura. */
    permitirSoloLectura?: boolean;
  },
): Promise<ContextoSinConexion> {
  const occurredAt = offlineOccurredAt(datos.occurredAt, new Date());
  const subscription = await prisma.organizationSubscription.findUnique({
    where: { organizationId },
  });
  if (subscription) {
    const { access, stage } = subscriptionAccessAt(subscription, occurredAt);
    if (
      access !== "FULL" &&
      !(access === "READ_ONLY" && datos.permitirSoloLectura)
    )
      throw subscriptionDenied(
        access === "READ_ONLY" ? "READ_ONLY" : "BLOCKED",
        stage,
      );
  }
  return {
    operationId: datos.operationId,
    kind: datos.kind,
    occurredAt,
    deviceId: datos.deviceId,
    requestHash: huellaSinConexion(datos.negocio),
    avisos: [],
    reenviadaPor: datos.reenviadaPor,
  };
}

/**
 * La operación ya se registró: devuelve lo que se registró entonces. El mismo
 * id con otros datos es un conflicto.
 */
export async function operacionYaRegistrada(
  tx: Prisma.TransactionClient,
  organizationId: string,
  contexto: ContextoSinConexion,
) {
  const previa = await tx.offlineOperation.findUnique({
    where: { id: contexto.operationId },
    include: { issues: true },
  });
  if (!previa) return null;
  if (
    previa.organizationId !== organizationId ||
    previa.kind !== contexto.kind ||
    previa.requestHash !== contexto.requestHash
  )
    throw new ConflictException(
      "Esta operación sin conexión ya se registró con otros datos.",
    );
  return { entityId: previa.entityId, offlineIssues: previa.issues };
}

/** Guarda la operación, sus avisos y quién la reenvió, dentro de `tx`. */
export async function guardarOperacionSinConexion(
  tx: Prisma.TransactionClient,
  contexto: ContextoSinConexion,
  datos: {
    organizationId: string;
    branchId: string;
    actorId: string;
    entityId: string | null;
  },
) {
  await tx.offlineOperation.create({
    data: {
      id: contexto.operationId,
      organizationId: datos.organizationId,
      branchId: datos.branchId,
      kind: contexto.kind,
      actorId: datos.actorId,
      deviceId: contexto.deviceId,
      occurredAt: contexto.occurredAt,
      requestHash: contexto.requestHash,
      entityId: datos.entityId,
    },
  });
  const offlineIssues = [];
  for (const aviso of contexto.avisos)
    offlineIssues.push(
      await tx.offlineSyncIssue.create({
        data: {
          organizationId: datos.organizationId,
          branchId: datos.branchId,
          operationId: contexto.operationId,
          kind: aviso.kind,
          detail: aviso.detail,
        },
      }),
    );
  if (contexto.reenviadaPor && contexto.reenviadaPor !== datos.actorId)
    await tx.auditLog.create({
      data: {
        organizationId: datos.organizationId,
        branchId: datos.branchId,
        actorId: contexto.reenviadaPor,
        entityType: "OFFLINE_OPERATION",
        entityId: contexto.operationId,
        action: "SINCRONIZADA_POR_OTRO",
        after: {
          hizoId: datos.actorId,
          deviceId: contexto.deviceId,
          tipo: contexto.kind,
        },
      },
    });
  return { entityId: datos.entityId, offlineIssues };
}
