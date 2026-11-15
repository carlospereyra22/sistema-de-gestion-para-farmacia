import { getSaleFiscalCapabilities } from "./api";
import { getOfertasVigentes } from "./ofertas-api";

/**
 * Con conexión se deja guardado en la PC lo que Ventas necesita para vender
 * sin conexión: las opciones fiscales de la sucursal y las ofertas vigentes y
 * programadas (SISTEMA-103). Antes las opciones fiscales sólo se pedían al
 * abrir Ventas, y en una PC que no había pasado por Ventas antes del corte el
 * botón "Factura" quedaba deshabilitado ("No se pudo verificar la
 * configuración fiscal"). La copia la guarda la caché local de lecturas.
 */
export async function precargarVentas(
  token: string,
  organizationId: string,
  branchId: string,
) {
  await Promise.all([
    getSaleFiscalCapabilities(token, organizationId, branchId),
    // Una falla de ofertas no frena la precarga fiscal.
    getOfertasVigentes(token, organizationId).catch(() => []),
  ]);
}
