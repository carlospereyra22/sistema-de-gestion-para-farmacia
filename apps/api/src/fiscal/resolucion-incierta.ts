import { list, obj, str } from "./arca-soap";

/**
 * Tiempo mínimo desde el último intento antes de declarar que un comprobante
 * no llegó a ARCA. Cubre respuestas demoradas de ARCA.
 */
export const ESPERA_PARA_LIBERAR_MS = 10 * 60_000;

/** Código que devuelve FECompConsultar cuando el comprobante no existe. */
export const SIN_RESULTADOS = 602;

export function codigosArca(result: Record<string, unknown>): number[] {
  return list(obj(result.Errors).Err)
    .map((error) => Number(str(obj(error).Code)))
    .filter((code) => Number.isInteger(code));
}

/** ARCA confirma que no tiene registrado ese número (y no devolvió datos). */
export function comprobanteInexistente(
  response: Record<string, unknown>,
): boolean {
  const result = obj(response.ResultGet);
  return (
    codigosArca(response).includes(SIN_RESULTADOS) &&
    !str(result.CodAutorizacion) &&
    !str(result.CbteDesde)
  );
}

/**
 * Lee la respuesta de FECompUltimoAutorizado. Devuelve null si no es
 * confiable (errores, otro punto u otro tipo, número inválido).
 */
export function ultimoAutorizado(
  response: Record<string, unknown>,
  point: number,
  voucherType: number,
): number | null {
  const raw = str(response.CbteNro);
  const number = Number(raw);
  if (
    codigosArca(response).length ||
    !/^\d+$/.test(raw) ||
    !Number.isSafeInteger(number) ||
    number < 0 ||
    number >= 99999999 ||
    Number(str(response.PtoVta)) !== point ||
    Number(str(response.CbteTipo)) !== voucherType
  )
    return null;
  return number;
}

export type ResultadoIncierto = "NO_EMITIDO" | "SIGUE_INCIERTO";

/**
 * Un comprobante sin respuesta confirmada sólo se declara "no emitido" cuando
 * se cumplen las tres condiciones a la vez:
 * - pasó la espera mínima desde el último intento;
 * - ARCA responde que ese número no existe;
 * - el último número autorizado en ARCA es menor al reservado.
 * Ante cualquier duda queda incierto: nunca se libera un número que ARCA
 * podría haber usado.
 */
export function decidirIncierto(params: {
  esperaMs: number;
  consultaInexistente: boolean;
  ultimoAutorizado: number | null;
  numeroReservado: number;
}): ResultadoIncierto {
  if (
    params.esperaMs >= ESPERA_PARA_LIBERAR_MS &&
    params.consultaInexistente &&
    params.ultimoAutorizado !== null &&
    params.ultimoAutorizado < params.numeroReservado
  )
    return "NO_EMITIDO";
  return "SIGUE_INCIERTO";
}

export function minutosRestantes(esperaMs: number) {
  return Math.max(1, Math.ceil((ESPERA_PARA_LIBERAR_MS - esperaMs) / 60_000));
}
