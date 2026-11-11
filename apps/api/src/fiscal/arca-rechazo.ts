import {
  BadGatewayException,
  UnprocessableEntityException,
} from "@nestjs/common";

/** ARCA rechazó la conexión (certificado, autorización, CUIT...). */
export const ARCA_RECHAZO = "ARCA_RECHAZO";
/** ARCA no respondió (caída, timeout, respuesta inválida). */
export const ARCA_SIN_RESPUESTA = "ARCA_SIN_RESPUESTA";

/**
 * Problemas con ARCA al probar la conexión (SISTEMA-97). Antes se devolvían
 * como 502 y la web los tomaba como corte de internet: mostraba "Sin
 * conexión" y pasaba la app al modo sin internet. Ahora van como 422, con un
 * código que distingue un rechazo de ARCA de una falta de respuesta y el
 * código de falla de ARCA (sin el cuerpo SOAP) para el detalle técnico.
 */
export function rechazoDeArca(cause: unknown): unknown {
  if (!(cause instanceof BadGatewayException)) return cause;
  const codigo = (cause as { arcaFault?: unknown }).arcaFault;
  return new UnprocessableEntityException({
    message: cause.message,
    error: codigo ? ARCA_RECHAZO : ARCA_SIN_RESPUESTA,
    details: typeof codigo === "string" && codigo ? { codigo } : {},
  });
}

export async function conRechazoDeArca<T>(operacion: Promise<T>): Promise<T> {
  try {
    return await operacion;
  } catch (cause) {
    throw rechazoDeArca(cause);
  }
}
