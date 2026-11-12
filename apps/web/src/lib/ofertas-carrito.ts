import {
  calcularOfertas,
  estadoOferta,
  etiquetaOferta,
  productoEntra,
  type AplicacionOferta,
  type OfertaMotor,
  type SugerenciaOferta,
} from "./ofertas-motor";

/**
 * Vista previa de las ofertas en el carrito de Ventas (SISTEMA-103). Usa el
 * mismo motor que la API, que es la autoridad: al confirmar recalcula y, si no
 * coincide, responde 409 y la web actualiza el carrito.
 */
export type RenglonCarritoOferta = {
  productId: string;
  description?: string;
  quantity: number;
  /** Precio de lista efectivo, en centavos. */
  listPriceMinor: number;
  /** Precio especial de la cajera: reemplaza la oferta. */
  requestedUnitPriceMinor?: number;
};

export type ProductoOferta = {
  id: string;
  isMedication?: boolean;
  category: { id: string } | null;
  laboratory: { id: string } | null;
};

export type OfertasDelCarrito = {
  /** Ahorro por ofertas de cada producto, en centavos. */
  porProducto: Map<string, { ahorroMinor: number; labels: string[] }>;
  totalMinor: number;
  aplicaciones: AplicacionOferta[];
  sugerencias: SugerenciaOferta[];
};

const VACIO: OfertasDelCarrito = {
  porProducto: new Map(),
  totalMinor: 0,
  aplicaciones: [],
  sugerencias: [],
};

export function ofertasDelCarrito(
  renglones: readonly RenglonCarritoOferta[],
  productos: readonly ProductoOferta[],
  ofertas: readonly OfertaMotor[],
  contexto: { ahora: Date; branchId: string; priceListId: string | null },
): OfertasDelCarrito {
  if (!ofertas.length) return VACIO;
  const porId = new Map(productos.map((producto) => [producto.id, producto]));
  const deCatalogo = renglones.filter(
    (renglon) => !renglon.description && porId.has(renglon.productId),
  );
  if (!deCatalogo.length) return VACIO;
  const resultado = calcularOfertas(
    deCatalogo.map((renglon) => {
      const producto = porId.get(renglon.productId)!;
      return {
        productId: renglon.productId,
        quantity: renglon.quantity,
        unitPriceMinor: BigInt(renglon.listPriceMinor),
        categoryId: producto.category?.id ?? null,
        laboratoryId: producto.laboratory?.id ?? null,
        isMedication: Boolean(producto.isMedication),
        manualPrice:
          renglon.requestedUnitPriceMinor !== undefined &&
          renglon.requestedUnitPriceMinor !== renglon.listPriceMinor,
      };
    }),
    ofertas,
    contexto,
  );
  return {
    porProducto: new Map(
      resultado.renglones.map((renglon) => [
        renglon.productId,
        {
          ahorroMinor: Number(renglon.offerDiscountMinor),
          labels: renglon.labels,
        },
      ]),
    ),
    totalMinor: Number(resultado.totalMinor),
    aplicaciones: resultado.aplicaciones,
    sugerencias: resultado.sugerencias,
  };
}

/** Las ofertas aplicadas, como las manda una venta sin conexión. */
export function ofertasParaEnviar(aplicaciones: readonly AplicacionOferta[]) {
  return aplicaciones.map((aplicacion) => ({
    offerId: aplicacion.offerId,
    version: aplicacion.version,
    items: aplicacion.items.map((item) => ({
      productId: item.productId,
      units: item.units,
      grossMinor: item.grossMinor.toString(),
      discountMinor: item.discountMinor.toString(),
    })),
  }));
}

/**
 * Ofertas activas o programadas que incluyen al producto (marca "En oferta"
 * en el catálogo de Ventas y en Productos). Con sucursal, sólo las de esa.
 */
export function ofertasDelProducto(
  producto: ProductoOferta,
  ofertas: readonly OfertaMotor[],
  ahora: Date,
  branchId?: string,
): { oferta: OfertaMotor; estado: "ACTIVA" | "PROGRAMADA"; label: string }[] {
  return ofertas.flatMap((oferta) => {
    const estado = estadoOferta(oferta, ahora);
    if (estado !== "ACTIVA" && estado !== "PROGRAMADA") return [];
    if (branchId && oferta.branchIds && !oferta.branchIds.includes(branchId))
      return [];
    if (
      !productoEntra(oferta, {
        productId: producto.id,
        categoryId: producto.category?.id ?? null,
        laboratoryId: producto.laboratory?.id ?? null,
        isMedication: Boolean(producto.isMedication),
      })
    )
      return [];
    return [{ oferta, estado, label: etiquetaOferta(oferta) }];
  });
}
