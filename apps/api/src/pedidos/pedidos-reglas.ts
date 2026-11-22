import type { EstadoPedido } from "../catalogo-online/catalogo-reglas";
import type { EstadoPreventa } from "../preventa/preventa-reglas";

/**
 * Pantalla Pedidos (SISTEMA-119): reglas puras para mostrar juntos los pedidos
 * del catálogo online y los de preventa. Cada pedido sigue con sus estados y
 * sus acciones; acá sólo se agrupan para leerlos igual.
 */

export type OrigenPedido = "catalogo" | "preventa";

/** Cómo se agrupan los estados de los dos módulos. */
export type GrupoPedidos =
  "por-atender" | "en-curso" | "entregados" | "cerrados";

export const GRUPOS: readonly GrupoPedidos[] = [
  "por-atender",
  "en-curso",
  "entregados",
  "cerrados",
];

export const ESTADOS_POR_GRUPO: Record<
  GrupoPedidos,
  { catalogo: readonly EstadoPedido[]; preventa: readonly EstadoPreventa[] }
> = {
  // Lo que alguien de la farmacia tiene que mirar.
  "por-atender": { catalogo: ["RECEIVED"], preventa: ["PENDING"] },
  // Ya resuelto, falta entregarlo.
  "en-curso": { catalogo: ["CONFIRMED"], preventa: ["IN_DELIVERY"] },
  entregados: { catalogo: ["DELIVERED"], preventa: ["DELIVERED"] },
  // No se entregan: rechazados por la farmacia o cancelados.
  cerrados: { catalogo: ["REJECTED", "CANCELLED"], preventa: ["CANCELLED"] },
};

/**
 * Lo abierto (por atender y en curso) se ve siempre, sin importar las fechas:
 * un pedido viejo sin resolver no puede quedar escondido por el filtro.
 */
export const grupoUsaFechas = (grupo?: GrupoPedidos) =>
  grupo !== "por-atender" && grupo !== "en-curso";

/** Sólo con los dos módulos habilitados tiene sentido verlos juntos. */
export const vistaUnificadaDisponible = (organizacion: {
  catalogEnabled: boolean;
  preventaEnabled: boolean;
}) => organizacion.catalogEnabled && organizacion.preventaEnabled;

/** Estados que no suman al total: no se entregan. */
const NO_SUMAN = new Set<string>(["CANCELLED", "REJECTED"]);

type ConFecha = { createdAt: string; status: string; totalMinor: string };

export type PedidoDeOrigen<C extends ConFecha, P extends ConFecha> =
  { origen: "catalogo"; pedido: C } | { origen: "preventa"; pedido: P };

/**
 * Une las dos listas, del más nuevo al más viejo, con un tope. Las fechas
 * vienen en ISO (UTC), así que se comparan como texto.
 */
export function mezclarPedidos<C extends ConFecha, P extends ConFecha>(
  catalogo: readonly C[],
  preventa: readonly P[],
  limite: number,
): PedidoDeOrigen<C, P>[] {
  const todos: PedidoDeOrigen<C, P>[] = [
    ...catalogo.map((pedido) => ({ origen: "catalogo" as const, pedido })),
    ...preventa.map((pedido) => ({ origen: "preventa" as const, pedido })),
  ];
  return todos
    .sort((a, b) =>
      a.pedido.createdAt < b.pedido.createdAt
        ? 1
        : a.pedido.createdAt > b.pedido.createdAt
          ? -1
          : 0,
    )
    .slice(0, limite);
}

/** Cantidad e importe de lo que se entrega (sin cancelados ni rechazados). */
export function resumirPedidos(items: readonly { pedido: ConFecha }[]) {
  const vivos = items.filter(({ pedido }) => !NO_SUMAN.has(pedido.status));
  return {
    cantidad: vivos.length,
    totalMinor: vivos
      .reduce((suma, { pedido }) => suma + BigInt(pedido.totalMinor), 0n)
      .toString(),
  };
}
