import { numeroDePedido as numeroDelCatalogo } from "./catalogo-online";
import type {
  GrupoPedidos,
  OrigenPedido,
  PedidoUnificado,
} from "./pedidos-api";
import { COBROS, numeroDePedido as numeroDePreventa } from "./preventa";

/**
 * Lógica de vista de la pantalla Pedidos (SISTEMA-119). Los estados, los
 * permisos y los totales los decide la API; acá sólo se muestran.
 */

export type TonoPedido = "warning" | "info" | "ok" | "danger" | "muted";

export const GRUPOS: { id: GrupoPedidos | ""; label: string }[] = [
  { id: "", label: "Todos" },
  { id: "por-atender", label: "Por atender" },
  { id: "en-curso", label: "En curso" },
  { id: "entregados", label: "Entregados" },
  { id: "cerrados", label: "Cancelados" },
];

/** Qué muestra cada grupo, para el texto de ayuda y la lista vacía. */
export const DETALLE_GRUPO: Record<GrupoPedidos | "", string> = {
  "": "Todos los pedidos de las fechas elegidas.",
  "por-atender":
    "Del catálogo, por confirmar; de preventa, pendientes. Se ven todos, sin importar la fecha.",
  "en-curso":
    "Del catálogo, confirmados; de preventa, en reparto. Se ven todos, sin importar la fecha.",
  entregados: "Entregados en las fechas elegidas.",
  cerrados: "Rechazados por la farmacia o cancelados.",
};

export const ORIGENES: Record<OrigenPedido, string> = {
  catalogo: "Catálogo online",
  preventa: "Preventa",
};

/** Etiqueta corta del origen, para la tabla. */
export const ORIGEN_CORTO: Record<OrigenPedido, string> = {
  catalogo: "Catálogo",
  preventa: "Preventa",
};

const ESTADOS_CATALOGO: Record<string, { label: string; tono: TonoPedido }> = {
  RECEIVED: { label: "Por confirmar", tono: "warning" },
  CONFIRMED: { label: "Confirmado", tono: "info" },
  DELIVERED: { label: "Entregado", tono: "ok" },
  REJECTED: { label: "Rechazado", tono: "danger" },
  CANCELLED: { label: "Cancelado por el cliente", tono: "muted" },
};

const ESTADOS_PREVENTA: Record<string, { label: string; tono: TonoPedido }> = {
  PENDING: { label: "Pendiente", tono: "warning" },
  IN_DELIVERY: { label: "En reparto", tono: "info" },
  DELIVERED: { label: "Entregado", tono: "ok" },
  CANCELLED: { label: "Cancelado", tono: "muted" },
};

export function estadoDe(item: PedidoUnificado) {
  return item.origen === "catalogo"
    ? ESTADOS_CATALOGO[item.pedido.status]
    : ESTADOS_PREVENTA[item.pedido.status];
}

export const numeroDe = (item: PedidoUnificado) =>
  item.origen === "catalogo"
    ? numeroDelCatalogo(item.pedido.number)
    : numeroDePreventa(item.pedido.number);

/** Segunda línea del cliente: cómo llega el pedido o quién lo tomó. */
export function detalleDe(item: PedidoUnificado): string {
  if (item.origen === "catalogo")
    return item.pedido.delivery === "DELIVERY"
      ? "Envío a domicilio"
      : `Retira en ${item.pedido.branchName}`;
  const partes = [
    item.pedido.sellerName ? `Preventista: ${item.pedido.sellerName}` : "",
    item.pedido.status === "IN_DELIVERY" && item.pedido.delivererName
      ? `Reparte: ${item.pedido.delivererName}`
      : "",
  ].filter(Boolean);
  return partes.join(" · ") || "Pedido de preventa";
}

/** Cobro que falta en un pedido de preventa ya entregado. */
export function cobroPendiente(item: PedidoUnificado) {
  if (item.origen !== "preventa" || item.pedido.status !== "DELIVERED")
    return null;
  return item.pedido.paymentStatus === "PAGADO"
    ? null
    : COBROS[item.pedido.paymentStatus];
}

const sinTildes = (texto: string) =>
  texto.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Busca por cliente o por número, sin importar tildes ni mayúsculas. */
export function buscarPedidos(
  items: readonly PedidoUnificado[],
  texto: string,
): PedidoUnificado[] {
  const buscado = sinTildes(texto.trim());
  if (!buscado) return [...items];
  return items.filter(
    (item) =>
      sinTildes(item.pedido.customerName).includes(buscado) ||
      sinTildes(numeroDe(item)).includes(buscado),
  );
}

/** Los de preventa que se pueden pasar a reparto juntos. */
export const paraReparto = (item: PedidoUnificado) =>
  item.origen === "preventa" && item.pedido.status === "PENDING";

/** Clave única en la lista (los ids de los dos módulos no se cruzan). */
export const claveDe = (item: PedidoUnificado) =>
  `${item.origen}:${item.pedido.id}`;

/** Pestañas de Pedidos con Preventa y Catálogo online adentro (SISTEMA-119). */
export type PestanaPedidos = "pedidos" | "preventa" | "catalogo";

/** Pestañas que ve cada uno, según lo que puede abrir. */
export function pestanasDePedidos(acceso: {
  verPedidos: boolean;
  verPreventa: boolean;
  configurarCatalogo: boolean;
}): PestanaPedidos[] {
  return (["pedidos", "preventa", "catalogo"] as const).filter((id) =>
    id === "pedidos"
      ? acceso.verPedidos
      : id === "preventa"
        ? acceso.verPreventa
        : acceso.configurarCatalogo,
  );
}
