import { useEffect, useRef } from "react";
import {
  sendOfflineAccount,
  sendOfflineCash,
  sendOfflineCustomer,
  sendOfflinePayable,
  sendOfflinePurchase,
  sendOfflineSupplier,
  sendOfflineSale,
  sendOfflineTransfer,
  sendSignedOfflineAccount,
  sendSignedOfflineCash,
  sendSignedOfflineCustomer,
  sendSignedOfflinePayable,
  sendSignedOfflinePurchase,
  sendSignedOfflineSupplier,
  sendSignedOfflineSale,
  sendSignedOfflineTransfer,
} from "./api";
import {
  olvidarEnviadasViejas,
  suscribirBandeja,
  ventasDeLaPc,
} from "./bandeja-ventas";
import { TOKEN_SIN_CONEXION } from "./cache-local";
import { useConectividad } from "./conectividad";
import {
  VENTAS_SINCRONIZADAS,
  conCandado,
  sePuedeEnviar,
  sincronizarVentas,
} from "./sincronizacion-ventas";

const CADA_MS = 30_000;

/**
 * Manda sola la bandeja de ventas sin conexión: al volver la conexión, cuando
 * se guarda una venta nueva y cada 30 segundos mientras quede algo.
 */
export function useSincronizarVentas(
  token: string | undefined,
  alcance: string | undefined,
) {
  const { enLinea } = useConectividad();
  const tokenActual = useRef(token);
  tokenActual.current = token;
  const listo = Boolean(
    enLinea && alcance && token && token !== TOKEN_SIN_CONEXION,
  );
  useEffect(() => {
    if (!listo || !alcance) return;
    let activo = true;
    const intentar = () =>
      void conCandado(async () => {
        const token = tokenActual.current;
        if (!activo || !token || token === TOKEN_SIN_CONEXION) return;
        const resultado = await sincronizarVentas({
          alcance,
          // Ventas y operaciones de caja, en el orden en que pasaron.
          enviar: (venta) =>
            // Proveedores y cuentas por pagar (SISTEMA-73).
            venta.operacion === "PROVEEDOR" || venta.operacion === "PAGAR"
              ? (venta.operacion === "PROVEEDOR"
                  ? sendOfflineSupplier
                  : sendOfflinePayable)(
                  token,
                  venta.organizationId,
                  venta.branchId,
                  venta.cuerpo,
                )
              : venta.operacion === "CUENTA" || venta.operacion === "CLIENTE"
                ? (venta.operacion === "CUENTA"
                    ? sendOfflineAccount
                    : sendOfflineCustomer)(
                    token,
                    venta.organizationId,
                    venta.branchId,
                    venta.cuerpo,
                  )
                : venta.operacion === "COMPRA" ||
                    venta.operacion === "TRANSFERENCIA"
                  ? (venta.operacion === "COMPRA"
                      ? sendOfflinePurchase
                      : sendOfflineTransfer)(
                      token,
                      venta.organizationId,
                      venta.branchId,
                      venta.cuerpo,
                    )
                  : venta.operacion === "CAJA"
                    ? sendOfflineCash(
                        token,
                        venta.organizationId,
                        venta.branchId,
                        venta.cuerpo,
                      )
                    : sendOfflineSale(
                        token,
                        venta.organizationId,
                        venta.branchId,
                        venta.cuerpo,
                      ),
          // Las de otros usuarios de la PC van firmadas por ellos (SISTEMA-66).
          enviarDeOtro: (venta) => {
            const firmada = {
              deviceId: String(venta.cuerpo.deviceId),
              payload: venta.payload!,
              signature: venta.firma!,
            };
            if (venta.operacion === "PROVEEDOR" || venta.operacion === "PAGAR")
              return (
                venta.operacion === "PROVEEDOR"
                  ? sendSignedOfflineSupplier
                  : sendSignedOfflinePayable
              )(token, venta.organizationId, venta.branchId, {
                ...firmada,
                actorId: venta.vendedorId!,
              });
            if (venta.operacion === "CUENTA" || venta.operacion === "CLIENTE")
              return (
                venta.operacion === "CUENTA"
                  ? sendSignedOfflineAccount
                  : sendSignedOfflineCustomer
              )(token, venta.organizationId, venta.branchId, {
                ...firmada,
                actorId: venta.vendedorId!,
              });
            if (
              venta.operacion === "COMPRA" ||
              venta.operacion === "TRANSFERENCIA"
            )
              return (
                venta.operacion === "COMPRA"
                  ? sendSignedOfflinePurchase
                  : sendSignedOfflineTransfer
              )(token, venta.organizationId, venta.branchId, {
                ...firmada,
                actorId: venta.vendedorId!,
              });
            return venta.operacion === "CAJA"
              ? sendSignedOfflineCash(
                  token,
                  venta.organizationId,
                  venta.branchId,
                  {
                    ...firmada,
                    actorId: venta.vendedorId!,
                  },
                )
              : sendSignedOfflineSale(
                  token,
                  venta.organizationId,
                  venta.branchId,
                  {
                    ...firmada,
                    sellerId: venta.vendedorId!,
                  },
                );
          },
        });
        await olvidarEnviadasViejas();
        if (resultado.enviadas && typeof window !== "undefined")
          window.dispatchEvent(new Event(VENTAS_SINCRONIZADAS));
      }).catch(() => {});
    intentar();
    // Hay algo para mandar: propio o firmado por otro usuario de la PC.
    const siHayPendientes = () =>
      void ventasDeLaPc().then((ventas) => {
        if (
          ventas.some(
            (venta) =>
              venta.estado === "PENDIENTE" && sePuedeEnviar(venta, alcance),
          )
        )
          intentar();
      });
    const dejar = suscribirBandeja(siHayPendientes);
    const timer = window.setInterval(siHayPendientes, CADA_MS);
    return () => {
      activo = false;
      dejar();
      window.clearInterval(timer);
    };
  }, [listo, alcance]);
}
