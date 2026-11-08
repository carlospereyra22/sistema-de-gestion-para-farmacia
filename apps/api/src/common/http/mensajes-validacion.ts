import { BadRequestException } from "@nestjs/common";
import type { ValidationError } from "class-validator";

// Mensajes de validación en castellano (SISTEMA-67). class-validator los arma en
// inglés ("property x should not exist"); el usuario los ve, por ejemplo, al
// revisar una operación sin conexión rechazada.

const TEXTOS: Record<string, (campo: string) => string> = {
  whitelistValidation: (c) => `El dato «${c}» no corresponde.`,
  isArray: (c) => `«${c}» tiene que ser una lista.`,
  isString: (c) => `«${c}» tiene que ser un texto.`,
  isInt: (c) => `«${c}» tiene que ser un número entero.`,
  isNumber: (c) => `«${c}» tiene que ser un número.`,
  isBoolean: (c) => `«${c}» tiene que ser sí o no.`,
  isUuid: (c) => `«${c}» no es un identificador válido.`,
  isEmail: () => "El email no es válido.",
  isIn: (c) => `«${c}» tiene un valor no admitido.`,
  isEnum: (c) => `«${c}» tiene un valor no admitido.`,
  isIso8601: (c) => `«${c}» no es una fecha válida.`,
  isDateString: (c) => `«${c}» no es una fecha válida.`,
  min: (c) => `«${c}» es menor al mínimo permitido.`,
  max: (c) => `«${c}» supera el máximo permitido.`,
  minLength: (c) => `«${c}» es demasiado corto.`,
  maxLength: (c) => `«${c}» es demasiado largo.`,
  isNotEmpty: (c) => `Falta «${c}».`,
  isDefined: (c) => `Falta «${c}».`,
};

/** Traduce los errores de class-validator, incluidos los anidados. */
export function mensajesValidacion(
  errores: readonly ValidationError[],
  prefijo = "",
): string[] {
  return errores.flatMap((error) => {
    const campo = prefijo ? `${prefijo}.${error.property}` : error.property;
    const propios = Object.keys(error.constraints ?? {}).map((clave) =>
      (TEXTOS[clave] ?? ((c: string) => `«${c}» no es válido.`))(campo),
    );
    return [...propios, ...mensajesValidacion(error.children ?? [], campo)];
  });
}

/** Para el ValidationPipe global: 400 con los mensajes en castellano. */
export const errorDeValidacion = (errores: ValidationError[]) =>
  new BadRequestException(mensajesValidacion(errores));
