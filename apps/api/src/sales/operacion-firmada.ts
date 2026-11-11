import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from "@nestjs/common";
import type { PrismaService } from "../prisma/prisma.service";
import { firmaValida } from "./firma-venta";

/**
 * Código del error para lo que tiene que mandar quien lo hizo (la PC todavía no
 * registró su clave). La web lo deja pendiente sin frenar por otros 409, que son
 * conflictos de la operación (prueba de corte del 10/11/2026).
 */
export const PARA_SU_DUENO = "PARA_SU_DUENO";

export function sinClaveRegistrada(que: "la operación" | "la venta") {
  return new ConflictException(
    `Esta PC todavía no registró la clave de quien hizo ${que}. La va a enviar esa persona al entrar con conexión.`,
    { description: PARA_SU_DUENO },
  );
}

/**
 * Operación sin conexión de otro usuario de la misma PC (SISTEMA-66/69): quien
 * la manda sólo la reenvía. Valida que sea de la farmacia, que la firma de la
 * clave de esa PC coincida con el texto exacto y que quien la hizo siga
 * teniendo la sucursal. Los permisos de la operación los controla el servicio
 * que la registra, a nombre de quien la hizo.
 */
export async function verificarOperacionDeOtro(
  prisma: PrismaService,
  datos: {
    senderId: string;
    actorId: string;
    deviceId: string;
    payload: string;
    signature: string;
    organizationId: string;
    branchId: string;
  },
) {
  const { organizationId, branchId } = datos;
  if (
    !(await prisma.userOrganization.findFirst({
      where: { userId: datos.senderId, organizationId, active: true },
    }))
  )
    throw new ForbiddenException("No pertenecés a esta farmacia.");
  const clave = await prisma.offlineDeviceKey.findUnique({
    where: {
      userId_deviceId: { userId: datos.actorId, deviceId: datos.deviceId },
    },
  });
  if (!clave) throw sinClaveRegistrada("la operación");
  if (!firmaValida(clave.publicKey, datos.payload, datos.signature))
    throw new BadRequestException(
      "La firma de la operación no es válida: no se registra a nombre de otro usuario.",
    );
  if (
    !(await prisma.userBranch.findFirst({
      where: {
        userId: datos.actorId,
        branchId,
        branch: { organizationId, active: true },
      },
    }))
  )
    throw new BadRequestException(
      "Quien hizo la operación ya no tiene acceso a esta sucursal. Revisala a mano.",
    );
}
