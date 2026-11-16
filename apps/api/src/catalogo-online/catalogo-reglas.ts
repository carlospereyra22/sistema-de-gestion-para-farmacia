import { createHash } from "node:crypto";

/**
 * Reglas puras del catálogo online (SISTEMA-107). Sin base de datos: las usan
 * los servicios y se prueban solas.
 */

export type EstadoPedido =
  "RECEIVED" | "CONFIRMED" | "REJECTED" | "DELIVERED" | "CANCELLED";

export type AccionPedido = "confirmar" | "rechazar" | "entregar" | "cancelar";

/** Desde qué estado se puede hacer cada acción y a cuál lleva. */
const TRANSICIONES: Record<
  AccionPedido,
  { desde: readonly EstadoPedido[]; hacia: EstadoPedido }
> = {
  confirmar: { desde: ["RECEIVED"], hacia: "CONFIRMED" },
  rechazar: { desde: ["RECEIVED", "CONFIRMED"], hacia: "REJECTED" },
  entregar: { desde: ["CONFIRMED"], hacia: "DELIVERED" },
  // Sólo el cliente cancela, y mientras la farmacia no lo confirmó.
  cancelar: { desde: ["RECEIVED"], hacia: "CANCELLED" },
};

/** Estado al que lleva la acción, o null si no corresponde desde `estado`. */
export function siguienteEstado(
  estado: EstadoPedido,
  accion: AccionPedido,
): EstadoPedido | null {
  const regla = TRANSICIONES[accion];
  return regla.desde.includes(estado) ? regla.hacia : null;
}

const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** Dirección pública válida: minúsculas, números y guiones; 3 a 60 caracteres. */
export function slugValido(slug: string): boolean {
  return slug.length >= 3 && slug.length <= 60 && SLUG.test(slug);
}

/** Propuesta de dirección a partir del nombre: "Farmacia Pérez" -> "farmacia-perez". */
export function slugDesdeNombre(nombre: string): string {
  const base = nombre
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/g, "");
  return base.length >= 3 ? base : `farmacia-${base || "online"}`;
}

/**
 * Precio de un producto para el catálogo, igual que en Ventas: la lista
 * elegida, después su lista de respaldo y por último Precio general.
 */
export function precioDeCatalogo(
  precios: ReadonlyMap<string, bigint>,
  listas: {
    elegida: string;
    respaldo?: string | null;
    general?: string | null;
  },
): bigint | null {
  for (const lista of [listas.elegida, listas.respaldo, listas.general])
    if (lista && precios.has(lista)) return precios.get(lista)!;
  return null;
}

export type RenglonPedido = { productId: string; quantity: number };

/** Junta renglones repetidos del mismo producto y descarta cantidades vacías. */
export function unirRenglones(
  renglones: readonly RenglonPedido[],
): RenglonPedido[] {
  const cantidades = new Map<string, number>();
  for (const { productId, quantity } of renglones)
    cantidades.set(productId, (cantidades.get(productId) ?? 0) + quantity);
  return [...cantidades]
    .filter(([, quantity]) => quantity > 0)
    .map(([productId, quantity]) => ({ productId, quantity }));
}

/** Total de los renglones ya con precio. En centavos, sin decimales. */
export function totalDelPedido(
  renglones: readonly { quantity: number; unitPriceMinor: bigint }[],
): bigint {
  return renglones.reduce(
    (total, { quantity, unitPriceMinor }) =>
      total + unitPriceMinor * BigInt(quantity),
    0n,
  );
}

/**
 * Huella del contenido del pedido: el mismo requestId con otro contenido es
 * otro pedido y se rechaza.
 */
export function huellaDelPedido(pedido: {
  items: readonly RenglonPedido[];
  delivery: string;
  deliveryAddress?: string | null;
  notes?: string | null;
}): string {
  const items = [...pedido.items]
    .sort((a, b) => a.productId.localeCompare(b.productId))
    .map(({ productId, quantity }) => [productId, quantity]);
  return createHash("sha256")
    .update(
      JSON.stringify({
        items,
        delivery: pedido.delivery,
        deliveryAddress: pedido.deliveryAddress?.trim() || null,
        notes: pedido.notes?.trim() || null,
      }),
    )
    .digest("hex");
}

/** Correo normalizado para buscar y guardar usuarios del portal. */
export const correoNormalizado = (email: string) => email.trim().toLowerCase();

/**
 * Categorías con productos visibles, con su ruta "Padre › Hijo" como en la
 * gestión, ordenadas por esa ruta. Sólo las activas.
 */
export function categoriasConRuta(
  todas: readonly {
    id: string;
    name: string;
    parentId: string | null;
    active: boolean;
  }[],
  visibles: ReadonlySet<string>,
): { id: string; name: string }[] {
  const porId = new Map(todas.map((c) => [c.id, c]));
  const ruta = (id: string) => {
    const partes: string[] = [];
    const vistos = new Set<string>();
    for (
      let actual = porId.get(id);
      actual && !vistos.has(actual.id);
      actual = actual.parentId ? porId.get(actual.parentId) : undefined
    ) {
      vistos.add(actual.id);
      partes.unshift(actual.name);
    }
    return partes.join(" › ");
  };
  return todas
    .filter((c) => c.active && visibles.has(c.id))
    .map((c) => ({ id: c.id, name: ruta(c.id) }))
    .sort((a, b) => a.name.localeCompare(b.name, "es"));
}

export type LoteEntrega = {
  id: string;
  quantity: number;
  expiresAt: Date | null;
};

/**
 * Lotes de los que sale un pedido entregado: primero lo que vence antes, sin
 * tocar lotes vencidos, como en Ventas. Si no alcanza, devuelve el faltante
 * (nunca deja stock negativo).
 */
export function repartirEntrega(
  lotes: readonly LoteEntrega[],
  cantidad: number,
  ahora: Date,
): { salidas: { lotId: string; quantity: number }[]; faltante: number } {
  const vendibles = lotes
    .filter((l) => l.quantity > 0 && !(l.expiresAt && l.expiresAt < ahora))
    .sort(
      (a, b) =>
        (a.expiresAt?.getTime() ?? Number.MAX_SAFE_INTEGER) -
        (b.expiresAt?.getTime() ?? Number.MAX_SAFE_INTEGER),
    );
  const salidas: { lotId: string; quantity: number }[] = [];
  let resta = cantidad;
  for (const lote of vendibles) {
    if (!resta) break;
    const sale = Math.min(resta, lote.quantity);
    salidas.push({ lotId: lote.id, quantity: sale });
    resta -= sale;
  }
  return { salidas, faltante: resta };
}
