/**
 * Llamadas del catálogo online público (SISTEMA-107). Sólo las rutas
 * /catalogo/... de la API: el sitio del catálogo no llega a nada de la gestión.
 * El cliente se identifica con la cookie del portal (credentials: include).
 */

const base = import.meta.env.VITE_API_URL ?? "http://localhost:3000/api/v1";

export type EstadoPedido =
  "RECEIVED" | "CONFIRMED" | "REJECTED" | "DELIVERED" | "CANCELLED";
export type Entrega = "PICKUP" | "DELIVERY";

export type RenglonDePedido = {
  productId: string;
  productName: string;
  quantity: number;
  unitPriceMinor: string;
  /** Descuento de ofertas del renglón. */
  discountMinor: string;
  totalMinor: string;
};

export type Pedido = {
  id: string;
  number: number;
  status: EstadoPedido;
  delivery: Entrega;
  deliveryAddress: string | null;
  notes: string | null;
  decisionNote: string | null;
  totalMinor: string;
  ahorroMinor: string;
  createdAt: string;
  decidedAt: string | null;
  deliveredAt: string | null;
  items: RenglonDePedido[];
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

export type PortadaCatalogo = {
  slug: string;
  name: string;
  organizationName: string;
  hasLogo: boolean;
  requireLogin: boolean;
  showPrices: boolean;
  pickupEnabled: boolean;
  deliveryEnabled: boolean;
  address: string;
  phone: string;
  user: { name: string; email: string } | null;
  /** Hay ofertas vigentes: se muestra el apartado Ofertas. */
  hayOfertas: boolean;
};

export type ProductoCatalogo = {
  id: string;
  name: string;
  brand: string | null;
  presentation: string | null;
  categoryId: string | null;
  hasImage: boolean;
  /** Cambia cuando cambia la foto: va en su dirección. */
  imageVersion: string | null;
  priceMinor: string | null;
  inStock: boolean;
  /** Ofertas del catálogo que tocan al producto (SISTEMA-107). */
  ofertas: OfertaDelProducto[];
};

export type OfertaDelProducto = {
  id: string;
  /** Escalones completos: "x2 → 3% | x4 → 5%". */
  label: string;
  /** Para la píldora de la tarjeta: "-15%", "3x2", "Llevando 2: -5%". */
  corta: string;
  /** Precio de una unidad con la oferta (las que valen desde 1). */
  precioOfertaMinor?: string | null;
  /** Ofertas por cantidad: precio de cada unidad llevando `cantidad`. */
  porCantidad?: { cantidad: number; precioUnitarioMinor: string } | null;
  /** Frases para el cliente: "Llevando 2 o más: 3% de descuento". */
  detalle: string[];
  /** Sólo las de toda la compra: desde cuánto y qué se lleva. */
  minimoMinor?: string;
  beneficio?: string;
};

/** Precios y ofertas del carrito, calculados por el servidor. */
export type Cotizacion = {
  items: {
    productId: string;
    quantity: number;
    unitPriceMinor: string;
    discountMinor: string;
    totalMinor: string;
    labels: string[];
    inStock: boolean;
  }[];
  noDisponibles: string[];
  sugerencias: {
    offerId: string;
    label: string;
    productIds: string[];
    faltan: number;
    mensaje: string;
    faltaMinor: string | null;
  }[];
  ofertasDeLaCompra: OfertaDelProducto[];
  aplicadas: {
    offerId: string;
    label: string;
    name: string;
    discountMinor: string;
  }[];
  ahorroMinor: string;
  totalMinor: string;
};

/** El catálogo pidió iniciar sesión (o la sesión venció). */
export class IngresoRequeridoError extends Error {}

const publico = (slug: string, ruta = "") =>
  `${base}/catalogo/${encodeURIComponent(slug)}${ruta}`;

async function pedirPublico<T>(
  url: string,
  fallback: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(url, {
    ...init,
    credentials: "include",
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  if (response.status === 401)
    throw new IngresoRequeridoError((await error(response, fallback)).message);
  if (!response.ok) throw await error(response, fallback);
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export const imagenDeProducto = (
  slug: string,
  productId: string,
  version?: string | null,
) =>
  publico(
    slug,
    `/productos/${productId}/imagen${version ? `?v=${encodeURIComponent(version)}` : ""}`,
  );
export const logoDelCatalogo = (slug: string) => publico(slug, "/logo");

export const getPortada = (slug: string) =>
  pedirPublico<PortadaCatalogo>(
    publico(slug),
    "Este catálogo no está disponible.",
  );

export function getProductosCatalogo(
  slug: string,
  filtro: {
    q?: string;
    categoria?: string;
    pagina?: number;
    ids?: string[];
    soloOfertas?: boolean;
  },
) {
  const params = new URLSearchParams();
  if (filtro.soloOfertas) params.set("ofertas", "1");
  if (filtro.ids?.length) params.set("ids", filtro.ids.slice(0, 100).join(","));
  if (filtro.q?.trim()) params.set("q", filtro.q.trim());
  if (filtro.categoria) params.set("categoria", filtro.categoria);
  if (filtro.pagina && filtro.pagina > 1)
    params.set("pagina", String(filtro.pagina));
  const query = params.toString();
  return pedirPublico<{
    total: number;
    pagina: number;
    porPagina: number;
    items: ProductoCatalogo[];
  }>(
    publico(slug, `/productos${query ? `?${query}` : ""}`),
    "No se pudieron ver los productos.",
  );
}

export const getCategoriasCatalogo = (slug: string) =>
  pedirPublico<{ id: string; name: string }[]>(
    publico(slug, "/categorias"),
    "No se pudieron ver las categorías.",
  );

export const ingresarAlCatalogo = (
  slug: string,
  email: string,
  password: string,
) =>
  pedirPublico<PortadaCatalogo>(
    publico(slug, "/ingresar"),
    "No se pudo ingresar.",
    { method: "POST", body: JSON.stringify({ email, password }) },
  );

export const salirDelCatalogo = (slug: string) =>
  pedirPublico<void>(publico(slug, "/salir"), "No se pudo salir.", {
    method: "POST",
  });

export const getMisPedidos = (slug: string) =>
  pedirPublico<Pedido[]>(
    publico(slug, "/pedidos"),
    "No se pudieron ver tus pedidos.",
  );

export const getMiPedido = (slug: string, id: string) =>
  pedirPublico<Pedido>(
    publico(slug, `/pedidos/${id}`),
    "No se pudo ver el pedido.",
  );

export const enviarPedido = (
  slug: string,
  pedido: {
    requestId: string;
    items: { productId: string; quantity: number }[];
    delivery: Entrega;
    deliveryAddress?: string;
    notes?: string;
    expectedTotalMinor?: string;
  },
) =>
  pedirPublico<Pedido>(
    publico(slug, "/pedidos"),
    "No se pudo enviar el pedido.",
    {
      method: "POST",
      body: JSON.stringify(pedido),
    },
  );

export const cancelarMiPedido = (slug: string, id: string) =>
  pedirPublico<Pedido>(
    publico(slug, `/pedidos/${id}/cancelar`),
    "No se pudo cancelar el pedido.",
    { method: "POST" },
  );

export const cotizarCarrito = (
  slug: string,
  items: { productId: string; quantity: number }[],
) =>
  pedirPublico<Cotizacion>(
    publico(slug, "/cotizar"),
    "No se pudieron calcular los precios.",
    { method: "POST", body: JSON.stringify({ items }) },
  );
