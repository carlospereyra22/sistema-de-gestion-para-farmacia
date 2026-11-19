/**
 * ¿Al entrar se abre la preventa a pantalla completa (celular) o la gestión?
 * (SISTEMA-108). Quien sólo toma pedidos o reparte va directo a la preventa;
 * quien atiende el mostrador o administra entra a la gestión y puede abrir la
 * versión celular. La elección manual vale para esa pestaña.
 */

export type ModoPreventa = "movil" | "gestion";

const CLAVE = "preventa:modo";

export function abrePreventaMovil(datos: {
  habilitada: boolean;
  permisos: readonly string[];
  preferencia: ModoPreventa | null;
}): boolean {
  const { habilitada, permisos, preferencia } = datos;
  if (!habilitada) return false;
  const tiene = (codigo: string) => permisos.includes(codigo);
  if (
    !tiene("PREVENTA_SELL") &&
    !tiene("PREVENTA_DELIVER") &&
    !tiene("PREVENTA_MANAGE")
  )
    return false;
  if (preferencia) return preferencia === "movil";
  return (
    (tiene("PREVENTA_SELL") || tiene("PREVENTA_DELIVER")) &&
    !tiene("SALE_MANAGE") &&
    !tiene("PREVENTA_MANAGE") &&
    !tiene("ORGANIZATION_MANAGE")
  );
}

export function leerModoPreventa(): ModoPreventa | null {
  try {
    const valor = sessionStorage.getItem(CLAVE);
    return valor === "movil" || valor === "gestion" ? valor : null;
  } catch {
    return null;
  }
}

export function guardarModoPreventa(modo: ModoPreventa) {
  try {
    sessionStorage.setItem(CLAVE, modo);
  } catch {
    // Sin almacenamiento: vale hasta recargar.
  }
}
