/**
 * Dónde estaba el superadmin dentro del panel. Al volver de entrar como un
 * usuario (soporte) el panel se vuelve a montar: con esto vuelve a la misma
 * sección y a la misma farmacia o sucursal elegida (SISTEMA-89).
 * Vive en sessionStorage: se pierde al cerrar la pestaña.
 */

export const seccionesDelPanel = [
  "farmacias",
  "pagos",
  "planes",
  "soporte",
  "arca",
  "auditoria",
] as const;
export type SeccionDelPanel = (typeof seccionesDelPanel)[number];

const CLAVE_SECCION = "plataforma:seccion";
const CLAVE_SOPORTE = "plataforma:soporte";

function leer(clave: string): string | null {
  try {
    return window.sessionStorage.getItem(clave);
  } catch {
    return null;
  }
}

function guardar(clave: string, valor: string) {
  try {
    if (valor) window.sessionStorage.setItem(clave, valor);
    else window.sessionStorage.removeItem(clave);
  } catch {
    /* Sin almacenamiento se abre en Farmacias; no es un error. */
  }
}

export function seccionGuardada(): SeccionDelPanel {
  const valor = leer(CLAVE_SECCION);
  return seccionesDelPanel.find((seccion) => seccion === valor) ?? "farmacias";
}

export function guardarSeccion(seccion: SeccionDelPanel) {
  guardar(CLAVE_SECCION, seccion);
}

/** Farmacia o sucursal elegida en Soporte (`org` u `org|sucursal`). */
export function eleccionDeSoporteGuardada(): string {
  return leer(CLAVE_SOPORTE) ?? "";
}

export function guardarEleccionDeSoporte(valor: string) {
  guardar(CLAVE_SOPORTE, valor);
}
