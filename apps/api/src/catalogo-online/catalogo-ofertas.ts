import {
  aplicaEn,
  calcularOfertas,
  etiquetaOferta,
  pesos,
  productoEntra,
  type ContextoOfertas,
  type OfertaMotor,
  type RenglonMotor,
} from "../offers/ofertas-motor";

/**
 * Ofertas en el catálogo online (SISTEMA-107). Usa el mismo motor que Ventas;
 * acá sólo se arma cómo se le muestran al cliente.
 */

function porcentaje(bps: number): string {
  const entero = Math.trunc(bps / 100);
  const resto = bps % 100;
  if (!resto) return String(entero);
  return `${entero},${String(resto).padStart(2, "0").replace(/0$/, "")}`;
}

const ORDINALES = [
  "",
  "1ra",
  "2da",
  "3ra",
  "4ta",
  "5ta",
  "6ta",
  "7ma",
  "8va",
  "9na",
  "10ma",
];
const ordinal = (n: number) => ORDINALES[n] ?? `${n}ª`;

/** Etiqueta corta para la tarjeta. Los escalones van todos: "x2 → 3% | x4 → 5%". */
export function etiquetaCatalogo(oferta: OfertaMotor): string {
  if (oferta.type === "TIERED" && oferta.tiers.length > 1)
    return [...oferta.tiers]
      .sort((a, b) => a.minQuantity - b.minQuantity)
      .map(
        (t) =>
          `x${t.minQuantity} → ${
            t.percentBps
              ? `${porcentaje(t.percentBps)}%`
              : `-${pesos(t.amountMinor ?? 0n)}`
          }`,
      )
      .join(" | ");
  return etiquetaOferta(oferta);
}

/** Qué dice la oferta, en frases cortas para el cliente. */
export function detalleOferta(oferta: OfertaMotor): string[] {
  switch (oferta.type) {
    case "PERCENT":
      return [`${porcentaje(oferta.percentBps ?? 0)}% de descuento`];
    case "AMOUNT_OFF":
      return [`${pesos(oferta.amountMinor ?? 0n)} menos por unidad`];
    case "FIXED_PRICE":
      return [`Precio especial: ${pesos(oferta.fixedPriceMinor ?? 0n)}`];
    case "BUY_X_PAY_Y":
      return [
        `Llevando ${oferta.buyQuantity ?? 0} pagás ${oferta.payQuantity ?? 0}`,
      ];
    case "NTH_UNIT_PERCENT":
      return [
        `La ${ordinal(oferta.nthUnit ?? 2)} unidad con ${porcentaje(oferta.percentBps ?? 0)}% de descuento`,
      ];
    case "TIERED":
      return [...oferta.tiers]
        .sort((a, b) => a.minQuantity - b.minQuantity)
        .map(
          (t) =>
            `Llevando ${t.minQuantity} o más: ${
              t.percentBps
                ? `${porcentaje(t.percentBps)}% de descuento`
                : `${pesos(t.amountMinor ?? 0n)} menos por unidad`
            }`,
        );
    case "BUNDLE":
      return [
        oferta.bundlePriceMinor !== null
          ? `Combo: llevándolos juntos pagás ${pesos(oferta.bundlePriceMinor)}`
          : `Combo: llevándolos juntos, ${porcentaje(oferta.percentBps ?? 0)}% de descuento`,
      ];
    case "SPEND_THRESHOLD":
      return [
        `Comprando desde ${pesos(oferta.minPurchaseMinor ?? 0n)}: ${
          oferta.percentBps
            ? `${porcentaje(oferta.percentBps)}% de descuento`
            : `${pesos(oferta.amountMinor ?? 0n)} menos`
        }`,
      ];
    default:
      return [];
  }
}

export type OfertaDelProducto = {
  id: string;
  /** Escalones completos: "x2 → 5% | x4 → 10%". */
  label: string;
  /** Etiqueta corta para la píldora de la tarjeta: "-15%", "3x2", "Llevando 2: -5%". */
  corta: string;
  detalle: string[];
  /** Precio de una unidad con la oferta (ofertas que valen desde 1 unidad). */
  precioOfertaMinor?: string | null;
  /** Ofertas por cantidad: precio de cada unidad llevando `cantidad`. */
  porCantidad?: { cantidad: number; precioUnitarioMinor: string } | null;
  /** Sólo las de toda la compra: desde cuánto y qué se lleva ("5% de descuento"). */
  minimoMinor?: string;
  beneficio?: string;
};

/** Etiqueta corta y clara para la píldora de la tarjeta. */
export function etiquetaCorta(oferta: OfertaMotor): string {
  switch (oferta.type) {
    case "PERCENT":
      return `-${porcentaje(oferta.percentBps ?? 0)}%`;
    case "AMOUNT_OFF":
      return `-${pesos(oferta.amountMinor ?? 0n)}`;
    case "FIXED_PRICE":
      return "Precio especial";
    case "BUY_X_PAY_Y":
      return `${oferta.buyQuantity ?? 0}x${oferta.payQuantity ?? 0}`;
    case "NTH_UNIT_PERCENT":
      return `${ordinal(oferta.nthUnit ?? 2)} al ${porcentaje(oferta.percentBps ?? 0)}%`;
    case "TIERED": {
      const primero = [...oferta.tiers].sort(
        (a, b) => a.minQuantity - b.minQuantity,
      )[0];
      if (!primero) return "Por cantidad";
      return `Llevando ${primero.minQuantity}: ${
        primero.percentBps
          ? `-${porcentaje(primero.percentBps)}%`
          : `-${pesos(primero.amountMinor ?? 0n)}`
      }`;
    }
    case "BUNDLE":
      return "Combo";
    default:
      return etiquetaOferta(oferta);
  }
}

/** Unidades con las que arranca una oferta por cantidad (null: vale desde 1). */
function unidadesDeLaOferta(oferta: OfertaMotor): number | null {
  if (oferta.type === "TIERED")
    return (
      [...oferta.tiers].sort((a, b) => a.minQuantity - b.minQuantity)[0]
        ?.minQuantity ?? null
    );
  if (oferta.type === "BUY_X_PAY_Y") return oferta.buyQuantity;
  if (oferta.type === "NTH_UNIT_PERCENT") return oferta.nthUnit;
  return null;
}

/**
 * Precio con la oferta, calculado con el mismo motor que Ventas: una unidad
 * para las de precio directo; para las de cantidad, el precio de cada unidad
 * llevando lo justo para que aplique.
 */
export function preciosConOferta(
  oferta: OfertaMotor,
  producto: Pick<
    RenglonMotor,
    "productId" | "categoryId" | "laboratoryId" | "isMedication"
  >,
  precioMinor: bigint,
  contexto: ContextoOfertas,
): Pick<OfertaDelProducto, "precioOfertaMinor" | "porCantidad"> {
  if (oferta.type === "BUNDLE") return {};
  const cantidad = unidadesDeLaOferta(oferta) ?? 1;
  const resultado = calcularOfertas(
    [
      {
        ...producto,
        quantity: cantidad,
        unitPriceMinor: precioMinor,
        manualPrice: false,
      },
    ],
    [oferta],
    contexto,
  );
  const descuento = resultado.totalMinor;
  if (descuento <= 0n) return {};
  if (cantidad === 1)
    return { precioOfertaMinor: (precioMinor - descuento).toString() };
  const n = BigInt(cantidad);
  const unitario = (precioMinor * n - descuento + n / 2n) / n;
  return {
    porCantidad: { cantidad, precioUnitarioMinor: unitario.toString() },
  };
}

/**
 * Ofertas vigentes que tocan a un producto (para la tarjeta y la foto
 * ampliada). Las de toda la compra (desde $X) se muestran en el carrito.
 */
export function ofertasDelProducto(
  ofertas: readonly OfertaMotor[],
  producto: Pick<
    RenglonMotor,
    "productId" | "categoryId" | "laboratoryId" | "isMedication"
  >,
  contexto: ContextoOfertas,
  precioMinor: bigint | null = null,
): OfertaDelProducto[] {
  return ofertas
    .filter(
      (o) =>
        o.type !== "SPEND_THRESHOLD" &&
        o.type !== "PAYMENT_METHOD" &&
        aplicaEn(o, contexto) &&
        o.remainingUnits !== 0 &&
        productoEntra(o, producto),
    )
    .sort((a, b) => b.priority - a.priority)
    .map((o) => ({
      id: o.id,
      label: etiquetaCatalogo(o),
      corta: etiquetaCorta(o),
      detalle: detalleOferta(o),
      ...(precioMinor !== null
        ? preciosConOferta(o, producto, precioMinor, contexto)
        : {}),
    }));
}

/** Ofertas de toda la compra ("desde $X") vigentes en el catálogo. */
export function ofertasDeLaCompra(
  ofertas: readonly OfertaMotor[],
  contexto: ContextoOfertas,
): OfertaDelProducto[] {
  return ofertas
    .filter((o) => o.type === "SPEND_THRESHOLD" && aplicaEn(o, contexto))
    .map((o) => ({
      id: o.id,
      label: etiquetaOferta(o),
      corta: etiquetaOferta(o),
      detalle: detalleOferta(o),
      minimoMinor: (o.minPurchaseMinor ?? 0n).toString(),
      beneficio: o.percentBps
        ? `${porcentaje(o.percentBps)}% de descuento`
        : `${pesos(o.amountMinor ?? 0n)} de descuento`,
    }));
}

/**
 * Aviso de "agregá N más" pensado para el cliente: en escalones habla del
 * escalón siguiente al que ya tiene, no del primero.
 */
export function mensajeSugerencia(
  oferta: OfertaMotor | undefined,
  sugerencia: { faltan: number; mensaje: string },
  unidadesEnGrupo: number,
): string {
  if (oferta?.type !== "TIERED") return sugerencia.mensaje;
  const siguiente = [...oferta.tiers]
    .sort((a, b) => a.minQuantity - b.minQuantity)
    .find((t) => t.minQuantity > unidadesEnGrupo);
  if (!siguiente) return sugerencia.mensaje;
  const faltan = siguiente.minQuantity - unidadesEnGrupo;
  return `Agregá ${faltan} más y llevás ${
    siguiente.percentBps
      ? `${porcentaje(siguiente.percentBps)}% de descuento`
      : `${pesos(siguiente.amountMinor ?? 0n)} menos por unidad`
  }`;
}
