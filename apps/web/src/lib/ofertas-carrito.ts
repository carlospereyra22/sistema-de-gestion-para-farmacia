import {
  calcularOfertas,
  estadoOferta,
  etiquetaOferta,
  pesos,
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

/** Una oferta explicada para la cajera (detalle del producto en Ventas). */
export type DetalleOfertaVenta = {
  id: string;
  label: string;
  nombre: string;
  texto: string;
  combo?: {
    componentes: {
      productId: string;
      nombre: string;
      cantidad: number;
      precioMinor: number;
    }[];
    listaMinor: number;
    comboMinor: number;
  };
};

const porcentajeTexto = (bps: number | null) =>
  `${String((bps ?? 0) / 100).replace(".", ",")}%`;

export function detalleOfertaVenta(
  oferta: OfertaMotor,
  producto: (id: string) => { nombre: string; precioMinor: number } | undefined,
): DetalleOfertaVenta {
  const base = {
    id: oferta.id,
    label: etiquetaOferta(oferta),
    nombre: oferta.name,
  };
  switch (oferta.type) {
    case "PERCENT":
      return {
        ...base,
        texto: `${porcentajeTexto(oferta.percentBps)} menos en cada unidad`,
      };
    case "AMOUNT_OFF":
      return {
        ...base,
        texto: `${pesos(oferta.amountMinor ?? 0n)} menos en cada unidad`,
      };
    case "FIXED_PRICE":
      return {
        ...base,
        texto: `Cada unidad a ${pesos(oferta.fixedPriceMinor ?? 0n)}`,
      };
    case "BUY_X_PAY_Y":
      return {
        ...base,
        texto: `Llevando ${oferta.buyQuantity} pagás ${oferta.payQuantity}`,
      };
    case "NTH_UNIT_PERCENT":
      return {
        ...base,
        texto:
          oferta.percentBps === 10000
            ? `La unidad ${oferta.nthUnit} es gratis`
            : `La unidad ${oferta.nthUnit} con ${porcentajeTexto(oferta.percentBps)} menos`,
      };
    case "TIERED":
      return {
        ...base,
        texto: [...oferta.tiers]
          .sort((a, b) => a.minQuantity - b.minQuantity)
          .map(
            (tier) =>
              `Desde ${tier.minQuantity}: ${tier.percentBps ? porcentajeTexto(tier.percentBps) : pesos(tier.amountMinor ?? 0n)} menos`,
          )
          .join(" · "),
      };
    case "BUNDLE": {
      const componentes = oferta.targets
        .filter((target) => target.kind === "PRODUCT" && !target.exclude)
        .map((target) => ({
          productId: target.id,
          nombre: producto(target.id)?.nombre ?? "Producto",
          cantidad: target.quantity ?? 1,
          precioMinor: producto(target.id)?.precioMinor ?? 0,
        }));
      const lista = componentes.reduce(
        (suma, item) => suma + item.precioMinor * item.cantidad,
        0,
      );
      const combo =
        oferta.bundlePriceMinor !== null
          ? Math.min(Number(oferta.bundlePriceMinor), lista)
          : lista - Math.round((lista * (oferta.percentBps ?? 0)) / 10000);
      return {
        ...base,
        texto: componentes
          .map((item) => `${item.cantidad} × ${item.nombre}`)
          .join(" + "),
        combo: { componentes, listaMinor: lista, comboMinor: combo },
      };
    }
  }
}

/**
 * Lo que gana el cliente si completa la oferta, en dos partes para mostrarla
 * clara en el carrito: qué agregar y qué gana ("y te llevás 1 gratis").
 */
export function partesSugerencia(
  oferta: OfertaMotor,
  faltan: number,
  extra: {
    /** Unidades de la oferta que ya hay en el carrito (escalonada). */
    enCarrito?: number;
    combo?: { faltantes: string[]; ahorroMinor: number; listaMinor: number };
  } = {},
): { agregar: string; gana: string } {
  const combo = extra.combo;
  const agregar = faltan === 1 ? "Agregá 1 más" : `Agregá ${faltan} más`;
  switch (oferta.type) {
    case "BUY_X_PAY_Y": {
      const gratis = (oferta.buyQuantity ?? 0) - (oferta.payQuantity ?? 0);
      return {
        agregar,
        gana: `y te llevás ${gratis} gratis (${etiquetaOferta(oferta)})`,
      };
    }
    case "NTH_UNIT_PERCENT":
      return {
        agregar,
        gana:
          oferta.percentBps === 10000
            ? `y la unidad ${oferta.nthUnit} te sale gratis`
            : `y la unidad ${oferta.nthUnit} sale ${porcentajeTexto(oferta.percentBps)} menos`,
      };
    case "TIERED": {
      const escalon = [...oferta.tiers]
        .sort((a, b) => a.minQuantity - b.minQuantity)
        .find((tier) => tier.minQuantity > (extra.enCarrito ?? 0));
      const beneficio = escalon?.percentBps
        ? `${porcentajeTexto(escalon.percentBps)} menos`
        : `${pesos(escalon?.amountMinor ?? 0n)} menos por unidad`;
      return { agregar, gana: `y tenés ${beneficio} en cada una` };
    }
    case "BUNDLE": {
      if (!combo) return { agregar, gana: `y armás el combo «${oferta.name}»` };
      const pct =
        combo.listaMinor > 0
          ? Math.round((combo.ahorroMinor / combo.listaMinor) * 100)
          : 0;
      return {
        agregar: `Agregá ${combo.faltantes.join(" + ")}`,
        gana: `y ahorrás ${pesos(BigInt(combo.ahorroMinor))}${pct ? ` (${pct}%)` : ""} con «${oferta.name}»`,
      };
    }
    default:
      return { agregar, gana: `y aprovechás «${oferta.name}»` };
  }
}

/** La sugerencia en una sola frase. */
export function mensajeSugerencia(
  ...args: Parameters<typeof partesSugerencia>
): string {
  const { agregar, gana } = partesSugerencia(...args);
  return `${agregar} ${gana}`;
}
