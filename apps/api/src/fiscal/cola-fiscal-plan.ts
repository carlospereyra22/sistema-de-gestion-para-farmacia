// Decide qué comprobantes intenta la cola fiscal en cada vuelta. Es puro para
// poder probarlo con un reloj falso; el envío real lo hace ColaFiscalService.

/** Después de un intento fallido, la cola espera esto antes de reintentar. */
export const ESPERA_ENTRE_INTENTOS_MS = 5 * 60_000;
/** La venta recién hecha intenta enviar su factura sola: la cola no se adelanta. */
export const GRACIA_VENTA_NUEVA_MS = 60_000;
/** Un envío en curso (PENDING) se respeta este tiempo, igual que al conciliar. */
export const ENVIO_EN_CURSO_MS = 2 * 60_000;
/** Fallos seguidos en un mismo punto que hacen pensar en ARCA caída. */
export const FALLOS_SEGUIDOS_PARA_FRENAR = 3;

export type EstadoPendiente = "QUEUED" | "PENDING" | "UNCERTAIN";

export type Pendiente = {
  id: string;
  /**
   * Comprobantes que comparten numeración y se bloquean entre sí: el punto de
   * venta en producción, la organización en homologación.
   */
  grupo: string;
  estado: EstadoPendiente;
  creado: Date;
  actualizado: Date;
  ventaAnulada: boolean;
};

/**
 * Devuelve, por grupo, los comprobantes a intentar en orden: primero los que
 * esperan confirmación (traban el punto), después los que están en cola, del
 * más viejo al más nuevo.
 */
export function planificarCola(
  pendientes: Pendiente[],
  ahora: number,
  ultimoIntento: (id: string) => number | undefined,
): Pendiente[][] {
  const grupos = new Map<string, Pendiente[]>();
  for (const pendiente of pendientes) {
    const grupo = grupos.get(pendiente.grupo) ?? [];
    grupo.push(pendiente);
    grupos.set(pendiente.grupo, grupo);
  }
  const reciente = (id: string) => {
    const intento = ultimoIntento(id);
    return intento !== undefined && ahora - intento < ESPERA_ENTRE_INTENTOS_MS;
  };
  const plan: Pendiente[][] = [];
  for (const grupo of grupos.values()) {
    const sinConfirmar = grupo.filter((p) => p.estado !== "QUEUED");
    // Alguien lo está enviando ahora mismo: no se toca el punto en esta vuelta.
    if (
      sinConfirmar.some(
        (p) =>
          p.estado === "PENDING" &&
          ahora - p.actualizado.getTime() < ENVIO_EN_CURSO_MS,
      )
    )
      continue;
    // Uno sin confirmar traba al resto: si se consultó hace poco, se espera.
    if (sinConfirmar.some((p) => reciente(p.id))) continue;
    const enCola = grupo
      .filter(
        (p) =>
          p.estado === "QUEUED" &&
          !p.ventaAnulada &&
          ahora - p.creado.getTime() >= GRACIA_VENTA_NUEVA_MS &&
          !reciente(p.id),
      )
      .sort(
        (a, b) =>
          a.creado.getTime() - b.creado.getTime() || a.id.localeCompare(b.id),
      );
    const orden = [
      ...sinConfirmar.sort((a, b) => a.creado.getTime() - b.creado.getTime()),
      ...enCola,
    ];
    if (orden.length) plan.push(orden);
  }
  return plan;
}

/** Qué hacer con el resto del grupo según cómo terminó un comprobante. */
export function seguirConElGrupo(
  estadoFinal: string,
  fallosSeguidos: number,
): boolean {
  // Si quedó sin confirmar, traba el punto: no se puede enviar otro.
  if (estadoFinal === "PENDING" || estadoFinal === "UNCERTAIN") return false;
  return fallosSeguidos < FALLOS_SEGUIDOS_PARA_FRENAR;
}
