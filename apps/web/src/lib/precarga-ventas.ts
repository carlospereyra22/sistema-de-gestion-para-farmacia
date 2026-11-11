import { getSaleFiscalCapabilities } from "./api";

/**
 * Con conexión se deja guardado en la PC lo que Ventas necesita para facturar
 * sin conexión: las opciones fiscales de la sucursal. Antes sólo se pedían al
 * abrir Ventas, y en una PC que no había pasado por Ventas antes del corte el
 * botón "Factura" quedaba deshabilitado ("No se pudo verificar la
 * configuración fiscal"). La copia la guarda la caché local de lecturas.
 */
export async function precargarVentas(
  token: string,
  organizationId: string,
  branchId: string,
) {
  await getSaleFiscalCapabilities(token, organizationId, branchId);
}
