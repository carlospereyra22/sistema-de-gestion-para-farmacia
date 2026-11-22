import { apiFetch } from "./api-fetch";
import type { PedidoDeLaFarmacia } from "./catalogo-online-api";
import type { PedidoPreventa } from "./preventa-api";

/**
 * Pantalla Pedidos (SISTEMA-119): los pedidos del catálogo online y los de
 * preventa juntos. Sólo lee; cada pedido se resuelve con la API de su módulo.
 */

const base = import.meta.env.VITE_API_URL ?? "http://localhost:3000/api/v1";

export type OrigenPedido = "catalogo" | "preventa";
export type GrupoPedidos =
  "por-atender" | "en-curso" | "entregados" | "cerrados";

export type PedidoUnificado =
  | { origen: "catalogo"; pedido: PedidoDeLaFarmacia }
  | { origen: "preventa"; pedido: PedidoPreventa };

export type ListaPedidosUnificados = {
  /** Qué orígenes puede ver el usuario según sus permisos. */
  origenes: { catalogo: boolean; preventa: boolean };
  /** Lo que falta atender de cada lado, sin filtros. */
  porAtender: { catalogo: number; preventa: number };
  descuentaStock: boolean;
  resumen: { cantidad: number; totalMinor: string };
  items: PedidoUnificado[];
};

export type FiltroPedidosUnificados = {
  grupo?: GrupoPedidos;
  origen?: OrigenPedido;
  desde?: string;
  hasta?: string;
  vendedor?: string;
};

async function error(response: Response, fallback: string): Promise<Error> {
  try {
    const result = (await response.json()) as { message?: string | string[] };
    return new Error(
      Array.isArray(result.message)
        ? result.message.join(", ")
        : (result.message ?? fallback),
    );
  } catch {
    return new Error(fallback);
  }
}

const cabeceras = (token: string): HeadersInit => ({
  Authorization: `Bearer ${token}`,
  "Content-Type": "application/json",
});

export async function getPedidosUnificados(
  token: string,
  organizationId: string,
  filtro: FiltroPedidosUnificados,
): Promise<ListaPedidosUnificados> {
  const params = new URLSearchParams();
  for (const [clave, valor] of Object.entries(filtro))
    if (valor) params.set(clave, valor);
  const consulta = params.toString();
  const response = await apiFetch(
    `${base}/organizations/${organizationId}/pedidos${consulta ? `?${consulta}` : ""}`,
    { headers: cabeceras(token) },
  );
  if (!response.ok)
    throw await error(response, "No se pudieron ver los pedidos.");
  return (await response.json()) as ListaPedidosUnificados;
}

/** La farmacia elige ver los pedidos juntos o cada uno en su módulo. */
export async function cambiarVistaPedidos(
  token: string,
  organizationId: string,
  unificados: boolean,
): Promise<{ unifiedOrders: boolean }> {
  const response = await apiFetch(
    `${base}/organizations/${organizationId}/pedidos/vista`,
    {
      method: "PUT",
      headers: cabeceras(token),
      body: JSON.stringify({ unificados }),
    },
  );
  if (!response.ok)
    throw await error(response, "No se pudo guardar cómo ver los pedidos.");
  return (await response.json()) as { unifiedOrders: boolean };
}
