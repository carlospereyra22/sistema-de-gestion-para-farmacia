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
    /** Código del error de la API (`code`), si lo trae. */
    readonly codigo?: string,
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

/** Código con el que la API marca lo que tiene que mandar quien lo hizo. */
export const PARA_SU_DUENO = "PARA_SU_DUENO";

/**
 * Operación de otro usuario de la PC que esta sesión no puede mandar: quien
 * manda no tiene acceso a la sucursal o a la farmacia (403), o la PC todavía no
 * registró la clave de su dueño (código `PARA_SU_DUENO`). Queda pendiente para
 * otro; no es un rechazo. Cualquier otro 404/409 es un conflicto de la
 * operación (por ejemplo, un pedido que otra PC ya recibió): rechazo
 * definitivo, para que no frene al resto de la sucursal (prueba de corte del
 * 10/11/2026).
 */
export function quedaParaSuDueno(
  status: number,
  codigo?: string,
  mensaje = "",
) {
  if (status === 403 || codigo === PARA_SU_DUENO) return true;
  // API anterior a SISTEMA-87: el 409 de la clave venía sin código.
  return status === 409 && !codigo?.length
    ? /registró la clave/i.test(mensaje)
    : false;
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
    (venta) => venta.estado === "PENDIENTE",
  );
  // El orden importa (SISTEMA-67): una venta usa la caja que se abrió antes.
  // Si esta sesión no puede mandar algo, lo que vino después en esa sucursal
  // espera, para no llegar antes que la apertura de la que depende.
  const frenadas = new Set<string>();
  for (const venta of pendientes) {
    const sucursal = `${venta.organizationId}|${venta.branchId}`;
    if (frenadas.has(sucursal)) continue;
    const propia = venta.alcance === opciones.alcance;
    if (
      !propia &&
      (!opciones.enviarDeOtro || !sePuedeEnviar(venta, opciones.alcance))
    ) {
      frenadas.add(sucursal);
      continue;
    }
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
        quedaParaSuDueno(cause.status, cause.codigo, cause.message)
      ) {
        frenadas.add(sucursal);
        continue;
      }
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
