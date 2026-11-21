// El menú lateral recuerda si cada usuario lo dejó abierto o cerrado en esta
// PC (SISTEMA-110). Es una comodidad: si el navegador no deja guardar, se usa
// lo de siempre (abierto desde 1800 px, cerrado por debajo).

export type PreferenciaMenu = "abierto" | "cerrado";

const clave = (usuario: string) =>
  `gestion:menu-lateral:${usuario.trim().toLowerCase()}`;

export function leerPreferenciaMenu(
  usuario: string | undefined,
): PreferenciaMenu | undefined {
  if (!usuario) return undefined;
  try {
    const valor = window.localStorage.getItem(clave(usuario));
    return valor === "abierto" || valor === "cerrado" ? valor : undefined;
  } catch {
    return undefined;
  }
}

export function guardarPreferenciaMenu(
  usuario: string | undefined,
  preferencia: PreferenciaMenu,
) {
  if (!usuario) return;
  try {
    window.localStorage.setItem(clave(usuario), preferencia);
  } catch {
    /* sin almacenamiento: sólo no se recuerda */
  }
}

/**
 * Cómo arranca el menú: en el celular siempre cerrado (abierto tapa la
 * pantalla); si no, lo que el usuario dejó; si nunca eligió, abierto en
 * pantallas grandes.
 */
export function menuAbiertoAlEntrar(
  preferencia: PreferenciaMenu | undefined,
  pantalla: { grande: boolean; celular: boolean },
): boolean {
  if (pantalla.celular) return false;
  if (preferencia) return preferencia === "abierto";
  return pantalla.grande;
}
