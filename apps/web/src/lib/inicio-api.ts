import { apiFetch as fetch, guardadaEl, SinConexionError } from "./api-fetch";
import {
  apiBaseUrl,
  bandejaDeLaPc,
  getCash,
  getCustomerAccounts,
  getPurchases,
  type ReportSummary,
} from "./api";
import { aplicarCajaLocal } from "./caja-sin-conexion";
import { comprasConPendientes } from "./compras-sin-conexion";
import { deudasDeLaPc } from "../supplier-payables/api";
import { hoyEnArgentina } from "./pagar-sin-conexion";
import { ahoraSegunServidor } from "./venta-sin-conexion";
import {
  aCobrar,
  cajasConPendientes,
  comprasPorRecibir,
  deudaConProveedores,
  ventasConPendientes,
} from "./inicio-sin-conexion";

/** Resumen de Inicio; `guardadaEl` si es la copia de la PC (sin conexión). */
export type ResumenDeInicio = ReportSummary & { guardadaEl?: number };

/**
 * Resumen de Inicio (SISTEMA-86). Con conexión, el del servidor. Sin conexión,
 * la copia guardada con las ventas de esta PC sin enviar sumadas, y lo demás
 * (a cobrar, deuda con proveedores, cajas, compras por recibir) calculado con
 * las copias de la PC. Lo que no se pueda calcular queda como en la copia.
 */
export async function getResumenDeInicio(
  token: string,
  organizationId: string,
  branchId: string,
): Promise<ResumenDeInicio> {
  let response: Response;
  try {
    response = await fetch(
      `${apiBaseUrl}/organizations/${organizationId}/branches/${branchId}/reports/summary`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
  } catch (cause) {
    if (cause instanceof SinConexionError)
      throw new SinConexionError(
        "Sin conexión: el resumen de ventas se ve cuando vuelva internet.",
      );
    throw cause;
  }
  if (!response.ok) throw new Error("No se pudieron cargar los reportes.");
  const servidor = (await response.json()) as ReportSummary;
  const bandeja = await bandejaDeLaPc();
  const hoy = hoyEnArgentina(ahoraSegunServidor());
  const resumen = ventasConPendientes(
    servidor,
    bandeja,
    organizationId,
    branchId,
    hoy,
  );
  const guardada = guardadaEl(response);
  if (!guardada) return resumen;
  // Sin conexión: lo de la PC, sin frenar si alguna copia no está.
  const [cuentas, deudas, caja, compras] = await Promise.all([
    getCustomerAccounts(token, organizationId, branchId).catch(() => undefined),
    deudasDeLaPc({ token, organizationId, branchId }).catch(() => undefined),
    getCash(token, organizationId, branchId).catch(() => undefined),
    getPurchases(token, organizationId, branchId).catch(() => undefined),
  ]);
  return {
    ...resumen,
    guardadaEl: guardada,
    ...(cuentas ? { customerReceivables: aCobrar(cuentas) } : {}),
    ...(deudas ? { supplierDebt: deudaConProveedores(deudas, hoy) } : {}),
    ...(caja && resumen.cashRegisters
      ? {
          cashRegisters: cajasConPendientes(
            resumen.cashRegisters,
            aplicarCajaLocal(caja.sessions, bandeja, organizationId, branchId),
          ),
        }
      : {}),
    ...(compras
      ? {
          pendingPurchases: comprasPorRecibir(
            comprasConPendientes(compras, bandeja, organizationId, branchId),
          ),
        }
      : {}),
  };
}
