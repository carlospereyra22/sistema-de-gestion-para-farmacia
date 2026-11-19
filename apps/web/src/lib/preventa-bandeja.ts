import { SinConexionError } from "./api-fetch";
import type { PedidoPreventa, RenglonPedido } from "./preventa-api";

/**
 * Bandeja de salida de la preventa (SISTEMA-108): los pedidos tomados sin
 * señal esperan en el teléfono y se mandan solos al volver la conexión. Cada
 * uno lleva su `requestId`: reenviarlo nunca duplica el pedido. El servidor
 * vuelve a calcular precios y ofertas al recibirlo: el total que se vio sin
 * señal es estimado.
 */

export type PedidoEnBandeja = {
  requestId: string;
  customerId: string;
  customerName: string;
  items: (RenglonPedido & { productName: string })[];
  notes: string | null;
  /** Total que se vio al tomarlo (estimado). */
  totalEstimadoMinor: string;
  tomadoEl: string;
  /** Lo rechazó el servidor: queda para que el preventista lo revise. */
  error?: string;
};

export type Almacen = Pick<Storage, "getItem" | "setItem">;

const clave = (usuarioId: string, organizationId: string) =>
  `preventa:bandeja:${organizationId}:${usuarioId}`;

function almacenDelNavegador(): Almacen | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

export function leerBandeja(
  usuarioId: string,
  organizationId: string,
  almacen: Almacen | null = almacenDelNavegador(),
): PedidoEnBandeja[] {
  try {
    const texto = almacen?.getItem(clave(usuarioId, organizationId));
    const datos: unknown = texto ? JSON.parse(texto) : [];
    return Array.isArray(datos) ? (datos as PedidoEnBandeja[]) : [];
  } catch {
    return [];
  }
}

function guardar(
  usuarioId: string,
  organizationId: string,
  pedidos: readonly PedidoEnBandeja[],
  almacen: Almacen | null,
) {
  try {
    almacen?.setItem(clave(usuarioId, organizationId), JSON.stringify(pedidos));
  } catch {
    // Sin espacio o almacenamiento bloqueado: el pedido sigue en pantalla.
  }
  if (typeof window !== "undefined")
    window.dispatchEvent(new Event("preventa:bandeja"));
}

export function agregarABandeja(
  usuarioId: string,
  organizationId: string,
  pedido: PedidoEnBandeja,
  almacen: Almacen | null = almacenDelNavegador(),
) {
  const actuales = leerBandeja(usuarioId, organizationId, almacen).filter(
    (p) => p.requestId !== pedido.requestId,
  );
  guardar(usuarioId, organizationId, [...actuales, pedido], almacen);
}

export function quitarDeBandeja(
  usuarioId: string,
  organizationId: string,
  requestId: string,
  almacen: Almacen | null = almacenDelNavegador(),
) {
  guardar(
    usuarioId,
    organizationId,
    leerBandeja(usuarioId, organizationId, almacen).filter(
      (p) => p.requestId !== requestId,
    ),
    almacen,
  );
}

/**
 * Manda los pedidos de la bandeja, de a uno y en el orden en que se
 * tomaron. Sin conexión se detiene (se reintenta después); un rechazo del
 * servidor queda marcado para revisar y se sigue con el resto.
 */
export async function enviarBandeja(
  usuarioId: string,
  organizationId: string,
  enviar: (pedido: PedidoEnBandeja) => Promise<PedidoPreventa>,
  almacen: Almacen | null = almacenDelNavegador(),
): Promise<{ enviados: PedidoPreventa[]; conError: number; quedan: number }> {
  const enviados: PedidoPreventa[] = [];
  let conError = 0;
  for (const pedido of leerBandeja(usuarioId, organizationId, almacen)) {
    if (pedido.error) {
      conError += 1;
      continue;
    }
    try {
      enviados.push(await enviar(pedido));
      quitarDeBandeja(usuarioId, organizationId, pedido.requestId, almacen);
    } catch (causa) {
      if (causa instanceof SinConexionError) break;
      conError += 1;
      guardar(
        usuarioId,
        organizationId,
        leerBandeja(usuarioId, organizationId, almacen).map((p) =>
          p.requestId === pedido.requestId
            ? {
                ...p,
                error:
                  causa instanceof Error ? causa.message : "No se pudo enviar.",
              }
            : p,
        ),
        almacen,
      );
    }
  }
  return {
    enviados,
    conError,
    quedan: leerBandeja(usuarioId, organizationId, almacen).length,
  };
}

/** Vuelve a intentar uno que el servidor había rechazado (ya corregido). */
export function reintentarDeBandeja(
  usuarioId: string,
  organizationId: string,
  requestId: string,
  almacen: Almacen | null = almacenDelNavegador(),
) {
  guardar(
    usuarioId,
    organizationId,
    leerBandeja(usuarioId, organizationId, almacen).map((p) =>
      p.requestId === requestId ? { ...p, error: undefined } : p,
    ),
    almacen,
  );
}
