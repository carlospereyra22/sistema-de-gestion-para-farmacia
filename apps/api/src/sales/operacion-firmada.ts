import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from "@nestjs/common";
import type { PrismaService } from "../prisma/prisma.service";
import { firmaValida } from "./firma-venta";

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
  if (!clave)
    throw new ConflictException(
      "Esta PC todavía no registró la clave de quien hizo la operación. La va a enviar esa persona al entrar con conexión.",
    );
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
