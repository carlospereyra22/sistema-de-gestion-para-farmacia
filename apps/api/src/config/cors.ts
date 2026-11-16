/**
 * Orígenes que pueden llamar a cada ruta (SISTEMA-107). La gestión sólo desde su
 * web; el sitio del catálogo online, sólo a las rutas públicas /catalogo/...
 * Así un cliente del catálogo no tiene camino a la API de la gestión.
 */
export function origenesPermitidos(
  url: string,
  origenes: { gestion: string; catalogo: string },
): string[] {
  const ruta = url.split("?")[0] ?? "";
  return ruta.startsWith("/api/v1/catalogo/")
    ? [origenes.gestion, origenes.catalogo]
    : [origenes.gestion];
}
