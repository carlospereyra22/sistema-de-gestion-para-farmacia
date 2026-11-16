import type { Oferta } from "./ofertas-api";

/**
 * Ofertas que se muestran según el módulo Catálogo online (SISTEMA-107). Sin
 * el módulo, Ofertas no nombra al catálogo: las que son sólo del catálogo no
 * aparecen y las de "ambos" se ven como una de mostrador. No se borra nada:
 * al habilitarlo vuelven a verse como estaban.
 */
export function ofertasVisibles<T extends Pick<Oferta, "channel">>(
  ofertas: readonly T[],
  catalogoHabilitado: boolean,
): T[] {
  return catalogoHabilitado
    ? [...ofertas]
    : ofertas.filter((oferta) => oferta.channel !== "CATALOG");
}
