import type { DatosDePadron, FiscalProfile } from "./api";
import { avisoCuit } from "./cuit";

/**
 * Datos de la farmacia para facturar (SISTEMA-96): vista previa de la
 * validación y autocompletado desde el padrón de ARCA. La validación de verdad
 * la hace el servidor al guardar.
 */

export type CampoFiscal = keyof FiscalProfile;

/** Condiciones del padrón → las del perfil fiscal. */
const condiciones: Record<string, string> = {
  Monotributista: "MONOTAX",
  Exento: "EXEMPT",
  "Responsable inscripto": "REGISTERED",
};

/** Hoy el sistema sólo emite factura C (monotributo o exento). */
export const SOLO_FACTURA_C =
  "Hoy el sistema sólo emite factura C (monotributo o exento). Con Responsable inscripto no se puede seguir con la configuración.";

export function esResponsableInscripto(vatCondition: string): boolean {
  return vatCondition === "REGISTERED";
}

/** ¿La fecha AAAA-MM-DD existe y no es futura? */
export function fechaDeInicioValida(valor: string, hoy = new Date()): boolean {
  const partes = /^(\d{4})-(\d{2})-(\d{2})$/.exec(valor);
  if (!partes) return false;
  const [anio, mes, dia] = [
    Number(partes[1]),
    Number(partes[2]),
    Number(partes[3]),
  ];
  const fecha = new Date(Date.UTC(anio, mes - 1, dia));
  return (
    fecha.getUTCFullYear() === anio &&
    fecha.getUTCMonth() === mes - 1 &&
    fecha.getUTCDate() === dia &&
    anio >= 1900 &&
    fecha.getTime() <= hoy.getTime()
  );
}

/** Avisos por campo para mostrar debajo de cada uno (sin bloquear el borrador). */
export function avisosDeDatosFiscales(
  perfil: FiscalProfile,
  hoy = new Date(),
): Partial<Record<CampoFiscal, string>> {
  const avisos: Partial<Record<CampoFiscal, string>> = {};
  const cuit = avisoCuit(perfil.cuit);
  if (cuit) avisos.cuit = cuit;
  if (perfil.activityStart && !fechaDeInicioValida(perfil.activityStart, hoy))
    avisos.activityStart =
      "Revisá la fecha: tiene que existir y no ser futura.";
  if (
    perfil.postalCode &&
    !/^[A-Za-z]?\d{4}[A-Za-z]{0,3}$/.test(perfil.postalCode.trim())
  )
    avisos.postalCode =
      "Revisá el código postal (por ejemplo 3300 o N3300ABC).";
  if (esResponsableInscripto(perfil.vatCondition))
    avisos.vatCondition = SOLO_FACTURA_C;
  return avisos;
}

/** ¿Se puede guardar y continuar al paso siguiente? (el borrador siempre). */
export function puedeContinuar(perfil: FiscalProfile, hoy = new Date()) {
  return Object.keys(avisosDeDatosFiscales(perfil, hoy)).length === 0;
}

/** Completa el perfil con lo que devolvió el padrón de ARCA. */
export function perfilDesdePadron(
  perfil: FiscalProfile,
  padron: DatosDePadron,
): FiscalProfile {
  return {
    ...perfil,
    cuit: padron.cuit,
    legalName: padron.nombre || perfil.legalName,
    address: padron.domicilio || perfil.address,
    city: padron.localidad || perfil.city,
    province: padron.provincia || perfil.province,
    postalCode: padron.codigoPostal || perfil.postalCode,
    vatCondition: condiciones[padron.condicionIva] ?? perfil.vatCondition,
  };
}
