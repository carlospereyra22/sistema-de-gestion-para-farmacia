import {
  cashSettingsRequest,
  getCashClosures,
  getCashManagement,
  getCashPendingCollections,
  getCashRecentActivity,
  getLatestCashClosure,
} from "./api";
import { defaultClosureRange } from "./cash-session-view";

// Con conexión se deja guardado en la PC lo que usa la pantalla Caja
// (SISTEMA-72): permisos de la caja, reglas, cobros pendientes, historial del
// período por defecto y últimos movimientos de cada caja. Sin esto, sin
// conexión no se podía cerrar ni asignar cobros si nadie había entrado antes a
// Caja con conexión. La copia la guarda la caché local de lecturas, con la
// misma consulta (y los mismos parámetros) que pide la pantalla.

export async function precargarCaja(
  token: string,
  organizationId: string,
  branchId: string,
  hoy = new Date(),
) {
  const rango = defaultClosureRange(hoy);
  const [gestion] = await Promise.all([
    getCashManagement(token, organizationId, branchId),
    cashSettingsRequest(token, organizationId, branchId).catch(() => undefined),
    getCashPendingCollections(token, organizationId, branchId).catch(
      () => undefined,
    ),
    getCashClosures(
      token,
      organizationId,
      branchId,
      rango.from || undefined,
      rango.to || undefined,
      false,
    ).catch(() => undefined),
  ]);
  // De a uno: no compite con lo que se está usando en pantalla.
  for (const caja of gestion.registers) {
    await getCashRecentActivity(token, organizationId, branchId, caja.id).catch(
      () => undefined,
    );
    // Último cierre de cada caja: sin conexión, Caja lo mostraba "sin datos
    // guardados" si nadie había elegido esa caja con conexión (prueba de corte).
    await getLatestCashClosure(token, organizationId, branchId, caja.id).catch(
      () => undefined,
    );
  }
}
