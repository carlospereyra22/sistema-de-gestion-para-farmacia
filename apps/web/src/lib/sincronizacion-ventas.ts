import {
  actualizarVentaPendiente,
  ventasDeLaPc,
  type VentaPendiente,
} from "./bandeja-ventas";

// Envía al servidor las ventas cobradas sin conexión (SISTEMA-64). De a una,
// de la más vieja a la más nueva. El servidor no duplica (mismo id = misma
// venta), así que reenviar después de un corte es seguro.

/** El servidor respondió con un error (no un corte de conexión). */
export class EnvioRechazado extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "EnvioRechazado";
  }
}

/** Evento de ventana cuando se mandaron ventas: actualizar historial y stock. */
export const VENTAS_SINCRONIZADAS = "gestion:ventas-sincronizadas";

/**
 * ¿El rechazo es definitivo? Datos inválidos, permisos, corte por falta de
 * pago o conflicto: reintentar no cambia nada, queda para revisar a mano.
 * Sesión vencida, demora o error del servidor se reintentan.
 */
export function rechazoDefinitivo(status: number) {
  return status >= 400 && status < 500 && ![401, 408, 429].includes(status);
}

/**
 * Venta de otro usuario de la PC que esta sesión no puede mandar: no tiene
 * acceso a esa sucursal (403/404) o la PC todavía no registró la clave de su
 * dueño (409). Queda pendiente para otro; no es un rechazo.
 */
export function quedaParaSuDueno(status: number) {
  return [403, 404, 409].includes(status);
}

/** ¿Esta sesión puede mandar la venta? Las de otros, sólo firmadas. */
export function sePuedeEnviar(venta: VentaPendiente, alcance: string) {
  return (
    venta.alcance === alcance ||
    Boolean(venta.vendedorId && venta.payload && venta.firma)
  );
}

export type ResultadoSincronizacion = {
  enviadas: number;
  rechazadas: number;
  /** Se frenó por un corte o un error del servidor: quedan para después. */
  interrumpida: boolean;
};

export async function sincronizarVentas(opciones: {
  alcance: string;
  enviar: (venta: VentaPendiente) => Promise<{ offlineIssues?: unknown[] }>;
  /** Venta firmada de otro usuario de la PC (SISTEMA-66). */
  enviarDeOtro?: (
    venta: VentaPendiente,
  ) => Promise<{ offlineIssues?: unknown[] }>;
  ahora?: () => Date;
}): Promise<ResultadoSincronizacion> {
  const ahora = opciones.ahora ?? (() => new Date());
  const resultado: ResultadoSincronizacion = {
    enviadas: 0,
    rechazadas: 0,
    interrumpida: false,
  };
  const pendientes = (await ventasDeLaPc()).filter(
    (venta) =>
      venta.estado === "PENDIENTE" &&
      (venta.alcance === opciones.alcance ||
        (Boolean(opciones.enviarDeOtro) &&
          sePuedeEnviar(venta, opciones.alcance))),
  );
  for (const venta of pendientes) {
    const propia = venta.alcance === opciones.alcance;
    try {
      const respuesta = propia
        ? await opciones.enviar(venta)
        : await opciones.enviarDeOtro!(venta);
      await actualizarVentaPendiente({
        ...venta,
        estado: "ENVIADA",
        enviadaEl: ahora().toISOString(),
        intentos: venta.intentos + 1,
        ultimoError: undefined,
        avisos: respuesta.offlineIssues?.length ?? 0,
      });
      resultado.enviadas++;
    } catch (cause) {
      const mensaje =
        cause instanceof Error ? cause.message : "No se pudo enviar la venta.";
      // De otro usuario y sin permiso o sin su clave: queda para su dueño.
      if (
        !propia &&
        cause instanceof EnvioRechazado &&
        quedaParaSuDueno(cause.status)
      )
        continue;
      if (cause instanceof EnvioRechazado && rechazoDefinitivo(cause.status)) {
        await actualizarVentaPendiente({
          ...venta,
          estado: "RECHAZADA",
          intentos: venta.intentos + 1,
          ultimoError: mensaje,
        });
        resultado.rechazadas++;
        continue;
      }
      // Corte o error del servidor: se respeta el orden y se reintenta luego.
      await actualizarVentaPendiente({
        ...venta,
        intentos: venta.intentos + 1,
        ultimoError: mensaje,
      });
      resultado.interrumpida = true;
      break;
    }
  }
  return resultado;
}

let enCurso = false;

/**
 * Una sola sincronización a la vez, aunque haya varias pestañas abiertas
 * (Web Locks). Si ya hay una en curso, no hace nada.
 */
export async function conCandado<T>(
  tarea: () => Promise<T>,
): Promise<T | undefined> {
  if (enCurso) return undefined;
  enCurso = true;
  try {
    const locks =
      typeof navigator !== "undefined" ? navigator.locks : undefined;
    if (locks?.request)
      return await locks.request(
        "gestion-sincronizar-ventas",
        { ifAvailable: true },
        async (lock) => (lock ? tarea() : undefined),
      );
    return await tarea();
  } finally {
    enCurso = false;
  }
}
