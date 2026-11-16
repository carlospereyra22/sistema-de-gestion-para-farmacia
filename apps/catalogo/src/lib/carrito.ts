import type { EstadoPedido } from "./api";

/**
 * Lógica de vista del catálogo online (SISTEMA-107). El carrito es sólo una
 * comodidad del navegador: el precio y el total los decide la API al enviar.
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

export type RenglonCarrito = {
  productId: string;
  name: string;
  /** Precio que se vio al agregarlo; el que vale lo calcula la API. */
  priceMinor: string | null;
  quantity: number;
  hasImage: boolean;
  imageVersion?: string | null;
  presentation: string | null;
};

/** Hasta dos iniciales para el recuadro de un producto sin foto. */
export function iniciales(nombre: string): string {
  const palabras = nombre
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .split(/[^A-Za-z0-9]+/)
    .filter((p) => p.length > 1 && !/^\d+$/.test(p));
  return (
    palabras
      .slice(0, 2)
      .map((p) => p[0]!.toUpperCase())
      .join("") || "?"
  );
}

export const CANTIDAD_MAXIMA = 999;

const acotar = (cantidad: number) =>
  Math.min(CANTIDAD_MAXIMA, Math.max(0, Math.trunc(cantidad)));

/** Suma `cantidad` al producto (lo agrega si no estaba). */
export function agregarAlCarrito(
  carrito: readonly RenglonCarrito[],
  producto: Omit<RenglonCarrito, "quantity">,
  cantidad = 1,
): RenglonCarrito[] {
  const actual = carrito.find((r) => r.productId === producto.productId);
  if (!actual)
    return acotar(cantidad) > 0
      ? [...carrito, { ...producto, quantity: acotar(cantidad) }]
      : [...carrito];
  return cambiarCantidad(
    carrito,
    producto.productId,
    actual.quantity + cantidad,
  );
}

/** Fija la cantidad; en cero el producto sale del carrito. */
export function cambiarCantidad(
  carrito: readonly RenglonCarrito[],
  productId: string,
  cantidad: number,
): RenglonCarrito[] {
  const nueva = acotar(cantidad);
  return carrito
    .map((r) => (r.productId === productId ? { ...r, quantity: nueva } : r))
    .filter((r) => r.quantity > 0);
}

export const unidadesEnCarrito = (carrito: readonly RenglonCarrito[]) =>
  carrito.reduce((total, r) => total + r.quantity, 0);

/** Total estimado; null si algún producto no muestra precio. */
export function totalEstimado(
  carrito: readonly RenglonCarrito[],
): string | null {
  let total = 0n;
  for (const r of carrito) {
    if (r.priceMinor === null) return null;
    total += BigInt(r.priceMinor) * BigInt(r.quantity);
  }
  return total.toString();
}

/** Pone los precios vigentes en el carrito (los que vienen de la API). */
export function actualizarPrecios(
  carrito: readonly RenglonCarrito[],
  precios: ReadonlyMap<string, string | null>,
): RenglonCarrito[] {
  return carrito.map((r) =>
    precios.has(r.productId)
      ? { ...r, priceMinor: precios.get(r.productId)! }
      : r,
  );
}

const claveCarrito = (slug: string) => `catalogo-carrito:${slug}`;

function esRenglon(valor: unknown): valor is RenglonCarrito {
  if (!valor || typeof valor !== "object") return false;
  const r = valor as Record<string, unknown>;
  return (
    typeof r.productId === "string" &&
    typeof r.name === "string" &&
    (r.priceMinor === null || typeof r.priceMinor === "string") &&
    typeof r.quantity === "number" &&
    r.quantity > 0
  );
}

/** Carrito guardado en este navegador (vacío si no hay o no se puede leer). */
export function leerCarrito(
  slug: string,
  almacen: Pick<Storage, "getItem"> | undefined,
): RenglonCarrito[] {
  try {
    const valor: unknown = JSON.parse(
      almacen?.getItem(claveCarrito(slug)) ?? "[]",
    );
    return Array.isArray(valor)
      ? valor.filter(esRenglon).map((r) => ({
          ...r,
          quantity: acotar(r.quantity),
          hasImage: Boolean(r.hasImage),
          presentation: r.presentation ?? null,
        }))
      : [];
  } catch {
    return [];
  }
}

export function guardarCarrito(
  slug: string,
  carrito: readonly RenglonCarrito[],
  almacen: Pick<Storage, "setItem" | "removeItem"> | undefined,
) {
  try {
    if (carrito.length)
      almacen?.setItem(claveCarrito(slug), JSON.stringify(carrito));
    else almacen?.removeItem(claveCarrito(slug));
  } catch {
    // Sin almacenamiento (modo privado): el carrito vive mientras la pestaña.
  }
}
