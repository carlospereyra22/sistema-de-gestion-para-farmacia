import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from "@nestjs/common";

import type { AuthenticatedRequest } from "./auth.types";

/**
 * Como soporte (un superadmin que entró como un usuario de la farmacia) se puede
 * hacer todo lo que hace ese usuario, salvo emitir o reprocesar comprobantes en
 * ARCA producción: tendrían validez fiscal a nombre de la farmacia.
 */
export function assertNoEsSoporte(request: AuthenticatedRequest) {
  if (request.auth?.soporte)
    throw new ForbiddenException({
      message:
        "Como soporte no se emiten ni reprocesan comprobantes en ARCA producción. Usá homologación o pedíselo a la farmacia.",
      error: "SOPORTE_SIN_ARCA_PRODUCCION",
    });
}

/**
 * Para controladores enteros de ARCA producción: corta antes de validar el
 * cuerpo. Las consultas (GET) se permiten; lo que escribe, no.
 */
@Injectable()
export class SinSoporteEnProduccionGuard implements CanActivate {
  canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (request.method !== "GET") assertNoEsSoporte(request);
    return true;
  }
}
