import type { EstadoPedido } from "./catalogo-online-api";

/**
 * Lógica de vista del catálogo online en la gestión (SISTEMA-107). El sitio
 * público está en apps/catalogo.
 */

/** Cómo ve cada estado la farmacia y cómo lo ve el cliente. */
export const ESTADOS_PEDIDO: Record<
  EstadoPedido,
  { farmacia: string; cliente: string; detalle: string; tono: Tono }
> = {
  RECEIVED: {
    farmacia: "Por confirmar",
    cliente: "Recibido",
    detalle: "La farmacia lo está revisando.",
    tono: "aviso",
  },
  CONFIRMED: {
    farmacia: "Confirmado",
    cliente: "Confirmado",
    detalle: "La farmacia lo confirmó y lo está preparando.",
    tono: "info",
  },
  DELIVERED: {
    farmacia: "Entregado",
    cliente: "Entregado",
    detalle: "Ya lo recibiste.",
    tono: "bien",
  },
  REJECTED: {
    farmacia: "Rechazado",
    cliente: "Rechazado",
    detalle: "La farmacia no puede prepararlo.",
    tono: "mal",
  },
  CANCELLED: {
    farmacia: "Cancelado por el cliente",
    cliente: "Cancelado",
    detalle: "Lo cancelaste.",
    tono: "neutro",
  },
};

export type Tono = "aviso" | "info" | "bien" | "mal" | "neutro";

/** Clases de la etiqueta de estado (tokens de Tailwind, sirven en modo oscuro). */
export const CLASES_TONO: Record<Tono, string> = {
  aviso: "bg-amber-100 text-amber-800",
  info: "bg-sky-100 text-sky-800",
  bien: "bg-emerald-100 text-emerald-800",
  mal: "bg-rose-100 text-rose-800",
  neutro: "bg-slate-100 text-slate-700",
};

export const pesos = (minor: string | number | bigint) =>
  new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS" }).format(
    Number(minor) / 100,
  );

export const numeroDePedido = (numero: number) =>
  String(numero).padStart(6, "0");

/** Sitio del catálogo público (otro sitio, separado de la gestión). */
export const SITIO_CATALOGO =
  import.meta.env.VITE_CATALOGO_URL ?? "http://localhost:5175";

/** Link que la farmacia le pasa al cliente. */
export const direccionDelCatalogo = (sitio: string, slug: string) =>
  `${sitio.replace(/\/+$/, "")}/${slug}`;

export type PestanaCatalogo = "pedidos" | "usuarios" | "configuracion";

/** Pestañas de Catálogo online según los permisos del usuario. */
export function pestanasVisibles(
  canSeeOrders: boolean,
  canConfigure: boolean,
): { id: PestanaCatalogo; label: string }[] {
  return [
    ...(canSeeOrders ? [{ id: "pedidos" as const, label: "Pedidos" }] : []),
    ...(canConfigure
      ? [
          { id: "usuarios" as const, label: "Usuarios del portal" },
          { id: "configuracion" as const, label: "Configuración" },
        ]
      : []),
  ];
}
