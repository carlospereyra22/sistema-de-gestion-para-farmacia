import type { DestinoOfertaVista } from "./ofertas-api";

/** Nombre entendible de cada dato de la oferta que guarda la auditoría. */
const CAMPOS_OFERTA: Record<string, string> = {
  name: "nombre",
  type: "tipo de oferta",
  status: "estado",
  priority: "prioridad",
  combinable: "combinable con otras",
  startsAt: "fecha de inicio",
  endsAt: "fecha de fin",
  weekdays: "días de la semana",
  dayStartMinute: "horario",
  dayEndMinute: "horario",
  branchIds: "sucursales",
  priceListIds: "listas de precios",
  productKind: "tipo de producto",
  maxUnitsPerSale: "tope por venta",
  maxUnitsTotal: "stock de oferta",
  percentBps: "porcentaje de descuento",
  amountMinor: "monto de descuento",
  fixedPriceMinor: "precio fijo",
  buyQuantity: "cantidad que lleva",
  payQuantity: "cantidad que paga",
  nthUnit: "unidad con descuento",
  bundlePriceMinor: "precio del combo",
  tiers: "escalas por cantidad",
  paymentMethods: "medios de pago",
  allProducts: "todos los productos",
  minPurchaseMinor: "monto mínimo de compra",
  targets: "productos",
};

/**
 * Qué datos cambió una edición, en palabras del usuario (nunca el nombre
 * técnico del campo). Devuelve "" si no hay diferencias.
 */
export function describirCambiosOferta(
  antes: unknown,
  despues: unknown,
): string {
  if (
    !antes ||
    !despues ||
    typeof antes !== "object" ||
    typeof despues !== "object"
  )
    return "";
  const a = antes as Record<string, unknown>;
  const b = despues as Record<string, unknown>;
  const etiquetas = Object.keys(b)
    .filter(
      (clave) =>
        clave !== "version" &&
        JSON.stringify(a[clave]) !== JSON.stringify(b[clave]),
    )
    .map((clave) => CAMPOS_OFERTA[clave] ?? "otros datos");
  const unicas = [...new Set(etiquetas)];
  if (!unicas.length) return "";
  const texto = unicas.join(", ");
  return `cambió ${texto}`;
}

export type DestinoAgrupado = DestinoOfertaVista & {
  /** Unidades totales cuando el mismo producto aparece más de una vez. */
  quantity: number | null;
};

/**
 * Junta los destinos repetidos (mismo producto en un combo cargado dos veces)
 * sumando cantidades, y separa incluidos de excluidos para mostrarlos.
 */
export function agruparDestinosOferta(targets: readonly DestinoOfertaVista[]): {
  incluidos: DestinoAgrupado[];
  excluidos: DestinoAgrupado[];
} {
  const mapa = new Map<string, DestinoAgrupado>();
  for (const target of targets) {
    const clave = `${target.exclude ? "x" : "i"}:${target.kind}:${target.id}`;
    const previo = mapa.get(clave);
    if (!previo) {
      mapa.set(clave, { ...target });
      continue;
    }
    previo.quantity =
      previo.quantity !== null || target.quantity !== null
        ? (previo.quantity ?? 1) + (target.quantity ?? 1)
        : null;
  }
  const todos = [...mapa.values()];
  return {
    incluidos: todos.filter((target) => !target.exclude),
    excluidos: todos.filter((target) => target.exclude),
  };
}

export const TIPO_DESTINO_OFERTA: Record<DestinoOfertaVista["kind"], string> = {
  PRODUCT: "Producto",
  CATEGORY: "Categoría",
  LABORATORY: "Laboratorio",
};
