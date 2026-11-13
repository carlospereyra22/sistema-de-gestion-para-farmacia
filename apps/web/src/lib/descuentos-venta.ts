import type { OfertaDeVentaRegistrada } from "./api";

/**
 * Descuentos de una venta ya registrada, para el historial (SISTEMA-104).
 * `discountMinor` de cada renglón es el descuento total e incluye la parte de
 * ofertas (`offerDiscountMinor`); el resto es descuento manual o general.
 */
export type RenglonVendido = {
  quantity: number;
  unitPriceMinor?: string;
  discountMinor?: string;
  offerDiscountMinor?: string;
};

export type DescuentosVenta = {
  /** Precio de lista por cantidad, antes de cualquier descuento. */
  subtotalMinor: number;
  ofertasMinor: number;
  /** Descuento que no viene de ofertas (manual o general). */
  descuentoMinor: number;
};

export function descuentosDeRenglon(item: RenglonVendido): DescuentosVenta {
  const total = Number(item.discountMinor ?? 0);
  const ofertas = Math.min(Number(item.offerDiscountMinor ?? 0), total);
  return {
    subtotalMinor: Number(item.unitPriceMinor ?? 0) * item.quantity,
    ofertasMinor: ofertas,
    descuentoMinor: total - ofertas,
  };
}

export function descuentosDeVenta(
  items: readonly RenglonVendido[],
): DescuentosVenta {
  return items.reduce<DescuentosVenta>(
    (suma, item) => {
      const renglon = descuentosDeRenglon(item);
      return {
        subtotalMinor: suma.subtotalMinor + renglon.subtotalMinor,
        ofertasMinor: suma.ofertasMinor + renglon.ofertasMinor,
        descuentoMinor: suma.descuentoMinor + renglon.descuentoMinor,
      };
    },
    { subtotalMinor: 0, ofertasMinor: 0, descuentoMinor: 0 },
  );
}

/** Ofertas (nombre y etiqueta) que tocaron un producto de la venta. */
export function ofertasDeProducto(
  offers: readonly OfertaDeVentaRegistrada[],
  productId: string | null,
): { name: string; label: string }[] {
  if (!productId) return [];
  return offers
    .filter((offer) => offer.items.some((item) => item.productId === productId))
    .map((offer) => ({ name: offer.name, label: offer.label }));
}
