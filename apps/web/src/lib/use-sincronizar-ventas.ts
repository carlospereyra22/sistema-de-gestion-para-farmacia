import { useEffect, useRef } from "react";
import { sendOfflineSale, sendSignedOfflineSale } from "./api";
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
          enviar: (venta) =>
            sendOfflineSale(
              token,
              venta.organizationId,
              venta.branchId,
              venta.cuerpo,
            ),
          // Las de otros usuarios de la PC van firmadas por ellos (SISTEMA-66).
          enviarDeOtro: (venta) =>
            sendSignedOfflineSale(token, venta.organizationId, venta.branchId, {
              sellerId: venta.vendedorId!,
              deviceId: String(venta.cuerpo.deviceId),
              payload: venta.payload!,
              signature: venta.firma!,
            }),
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
