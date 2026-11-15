/**
 * Motor de ofertas (SISTEMA-103).
 *
 * Este archivo es IDÉNTICO en `apps/api/src/offers/ofertas-motor.ts` y
 * `apps/web/src/lib/ofertas-motor.ts`: la API lo usa para cobrar (es la
 * autoridad) y la web para la vista previa del carrito y la venta sin
 * conexión. Un test de la web compara los dos archivos: si se cambia uno, se
 * copia al otro. Sin dependencias ni importaciones.
 *
 * Importes en centavos `bigint`, porcentajes en puntos básicos. Cada renglón
 * se redondea una sola vez, a centavos (mitad hacia arriba).
 */

export type TipoOferta =
  | "PERCENT"
  | "AMOUNT_OFF"
  | "FIXED_PRICE"
  | "BUY_X_PAY_Y"
  | "NTH_UNIT_PERCENT"
  | "TIERED"
  | "BUNDLE"
  /** Porcentaje por pagar con ciertos medios; se calcula en el cobro. */
  | "PAYMENT_METHOD"
  /** Desde un monto de compra, un % o $ menos (una vez por venta). */
  | "SPEND_THRESHOLD";

export type MedioPago = "CASH" | "CARD" | "TRANSFER" | "ACCOUNT" | "OTHER";

/** Estado guardado. Programada, activa y vencida se calculan con la hora. */
export type EstadoGuardadoOferta =
  "DRAFT" | "PUBLISHED" | "PAUSED" | "FINISHED" | "ARCHIVED";

export type EstadoOferta =
  | "BORRADOR"
  | "PROGRAMADA"
  | "ACTIVA"
  | "PAUSADA"
  | "VENCIDA"
  | "FINALIZADA"
  | "ARCHIVADA";

export type TipoProductoOferta = "ALL" | "MEDICATION" | "NON_MEDICATION";

export type DestinoOferta = {
  kind: "PRODUCT" | "CATEGORY" | "LABORATORY";
  id: string;
  /** Exclusión: no entra aunque esté en la categoría o el laboratorio. */
  exclude: boolean;
  /** Unidades del producto en el combo (sólo BUNDLE). */
  quantity: number | null;
  /** Categoría con todas sus subcategorías (la resuelve el servidor). */
  categoryIds?: readonly string[];
};

export type EscalonOferta = {
  minQuantity: number;
  percentBps: number | null;
  amountMinor: bigint | null;
};

export type OfertaMotor = {
  id: string;
  version: number;
  name: string;
  type: TipoOferta;
  status: EstadoGuardadoOferta;
  priority: number;
  combinable: boolean;
  createdAt: string;
  startsAt: string;
  endsAt: string | null;
  /** Bit 0 = domingo ... bit 6 = sábado, en Argentina. Nulo = todos. */
  weekdays: number | null;
  /** Minutos desde las 00:00 de Argentina; ambos o ninguno. */
  dayStartMinute: number | null;
  dayEndMinute: number | null;
  /** Nulo = todas las sucursales. */
  branchIds: readonly string[] | null;
  /** Nulo = todas las listas de precios. */
  priceListIds: readonly string[] | null;
  productKind: TipoProductoOferta;
  maxUnitsPerSale: number | null;
  /** Unidades que quedan del tope total; nulo = sin tope. */
  remainingUnits: number | null;
  percentBps: number | null;
  amountMinor: bigint | null;
  fixedPriceMinor: bigint | null;
  buyQuantity: number | null;
  payQuantity: number | null;
  nthUnit: number | null;
  bundlePriceMinor: bigint | null;
  tiers: readonly EscalonOferta[];
  targets: readonly DestinoOferta[];
  /** Medios que dan el descuento (sólo PAYMENT_METHOD). */
  paymentMethods?: readonly MedioPago[];
  /** Todos los productos, salvo los excluidos en `targets`. */
  allProducts?: boolean;
  /** Monto mínimo de compra (sólo SPEND_THRESHOLD). */
  minPurchaseMinor?: bigint | null;
};

/** La misma oferta tal como viaja en JSON (importes como texto). */
export type OfertaMotorJson = Omit<
  OfertaMotor,
  | "amountMinor"
  | "fixedPriceMinor"
  | "bundlePriceMinor"
  | "tiers"
  | "minPurchaseMinor"
> & {
  minPurchaseMinor?: string | null;
  amountMinor: string | null;
  fixedPriceMinor: string | null;
  bundlePriceMinor: string | null;
  tiers: {
    minQuantity: number;
    percentBps: number | null;
    amountMinor: string | null;
  }[];
};

export type RenglonMotor = {
  productId: string;
  quantity: number;
  /** Precio de lista efectivo de la venta (lista del cliente o su respaldo). */
  unitPriceMinor: bigint;
  categoryId: string | null;
  laboratoryId: string | null;
  isMedication: boolean;
  /** Precio especial de la cajera: reemplaza la oferta. */
  manualPrice: boolean;
  /** La cajera eligió no aplicarle ofertas a este renglón. */
  sinOfertas?: boolean;
};

export type ContextoOfertas = {
  ahora: Date;
  branchId: string;
  priceListId: string | null;
  /**
   * Pagos de la venta, para las ofertas por medio de pago. Sin pagos (el
   * carrito antes de cobrar) esas ofertas no se aplican: sólo se sugieren.
   */
  cobro?: CobroOfertas;
};

export type CobroOfertas = {
  pagos: readonly { method: MedioPago; amountMinor: bigint }[];
  /**
   * Lo que suma al total de la venta fuera de los renglones del motor:
   * conceptos manuales menos descuentos generales (puede ser negativo).
   */
  otrosMinor: bigint;
};

export type ItemAplicacion = {
  productId: string;
  units: number;
  grossMinor: bigint;
  discountMinor: bigint;
};

export type AplicacionOferta = {
  offerId: string;
  version: number;
  name: string;
  label: string;
  type: TipoOferta;
  units: number;
  discountMinor: bigint;
  items: ItemAplicacion[];
};

export type RenglonResultado = {
  productId: string;
  offerDiscountMinor: bigint;
  labels: string[];
};

export type SugerenciaOferta = {
  offerId: string;
  label: string;
  productIds: string[];
  /** Unidades que faltan; 0 en las ofertas por medio de pago. */
  faltan: number;
  mensaje: string;
  /** Sólo ofertas por medio de pago: ahorro si se paga todo con esos medios. */
  medioDePago?: { medios: MedioPago[]; ahorroMinor: bigint };
  /** Sólo ofertas por monto de compra: cuánto falta para llegar. */
  porMonto?: { faltaMinor: bigint };
};

export type ResultadoOfertas = {
  renglones: RenglonResultado[];
  aplicaciones: AplicacionOferta[];
  sugerencias: SugerenciaOferta[];
  totalMinor: bigint;
};

const ARGENTINA_MS = 3 * 60 * 60 * 1000;
const DIAS = [
  "Domingo",
  "Lunes",
  "Martes",
  "Miércoles",
  "Jueves",
  "Viernes",
  "Sábado",
] as const;

export function ofertaDesdeJson(json: OfertaMotorJson): OfertaMotor {
  const monto = (value: string | null) =>
    value === null ? null : BigInt(value);
  return {
    ...json,
    amountMinor: monto(json.amountMinor),
    fixedPriceMinor: monto(json.fixedPriceMinor),
    bundlePriceMinor: monto(json.bundlePriceMinor),
    minPurchaseMinor:
      json.minPurchaseMinor == null ? undefined : BigInt(json.minPurchaseMinor),
    tiers: json.tiers.map((tier) => ({
      ...tier,
      amountMinor: monto(tier.amountMinor),
    })),
  };
}

export function ofertaAJson(oferta: OfertaMotor): OfertaMotorJson {
  const texto = (value: bigint | null) =>
    value === null ? null : value.toString();
  return {
    ...oferta,
    amountMinor: texto(oferta.amountMinor),
    fixedPriceMinor: texto(oferta.fixedPriceMinor),
    bundlePriceMinor: texto(oferta.bundlePriceMinor),
    minPurchaseMinor:
      oferta.minPurchaseMinor == null
        ? undefined
        : oferta.minPurchaseMinor.toString(),
    tiers: oferta.tiers.map((tier) => ({
      ...tier,
      amountMinor: texto(tier.amountMinor),
    })),
  };
}

/** Día de la semana (0 = domingo) y minuto del día en Argentina (UTC-3). */
export function horaArgentina(ahora: Date): { dia: number; minuto: number } {
  const local = new Date(ahora.getTime() - ARGENTINA_MS);
  return {
    dia: local.getUTCDay(),
    minuto: local.getUTCHours() * 60 + local.getUTCMinutes(),
  };
}

export function estadoOferta(
  oferta: Pick<OfertaMotor, "status" | "startsAt" | "endsAt">,
  ahora: Date,
): EstadoOferta {
  if (oferta.status === "DRAFT") return "BORRADOR";
  if (oferta.status === "ARCHIVED") return "ARCHIVADA";
  if (oferta.status === "FINISHED") return "FINALIZADA";
  if (oferta.status === "PAUSED") return "PAUSADA";
  const momento = ahora.getTime();
  if (oferta.endsAt && new Date(oferta.endsAt).getTime() <= momento)
    return "VENCIDA";
  if (new Date(oferta.startsAt).getTime() > momento) return "PROGRAMADA";
  return "ACTIVA";
}

/** Vigente ahora en esa sucursal y lista: estado, día y franja horaria. */
export function aplicaEn(
  oferta: OfertaMotor,
  contexto: ContextoOfertas,
): boolean {
  if (estadoOferta(oferta, contexto.ahora) !== "ACTIVA") return false;
  if (oferta.branchIds && !oferta.branchIds.includes(contexto.branchId))
    return false;
  if (
    oferta.priceListIds &&
    (!contexto.priceListId ||
      !oferta.priceListIds.includes(contexto.priceListId))
  )
    return false;
  const { dia, minuto } = horaArgentina(contexto.ahora);
  if (oferta.weekdays !== null && !(oferta.weekdays & (1 << dia))) return false;
  if (
    oferta.dayStartMinute !== null &&
    oferta.dayEndMinute !== null &&
    (minuto < oferta.dayStartMinute || minuto >= oferta.dayEndMinute)
  )
    return false;
  return true;
}

function porcentaje(bps: number): string {
  const entero = Math.trunc(bps / 100);
  const resto = bps % 100;
  if (!resto) return String(entero);
  return `${entero},${String(resto).padStart(2, "0").replace(/0$/, "")}`;
}

const MEDIOS_CORTOS: Record<MedioPago, string> = {
  CASH: "efectivo",
  CARD: "tarjeta",
  TRANSFER: "transferencia",
  ACCOUNT: "cuenta corriente",
  OTHER: "otro medio",
};

/** "efectivo", "efectivo o transferencia". */
export function textoMedios(medios: readonly MedioPago[]): string {
  const nombres = medios.map((medio) => MEDIOS_CORTOS[medio]);
  if (nombres.length <= 1) return nombres[0] ?? "";
  return `${nombres.slice(0, -1).join(", ")} o ${nombres[nombres.length - 1]}`;
}

export function pesos(minor: bigint): string {
  const negativo = minor < 0n;
  const valor = negativo ? -minor : minor;
  const entero = (valor / 100n)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  const centavos = valor % 100n;
  return `${negativo ? "-" : ""}$${entero}${centavos ? `,${centavos.toString().padStart(2, "0")}` : ""}`;
}

function ordinal(n: number): string {
  const sufijos: Record<number, string> = {
    1: "ra",
    2: "da",
    3: "ra",
    4: "ta",
    5: "ta",
    6: "ta",
    7: "ma",
    8: "va",
    9: "na",
    10: "ma",
  };
  return `${n}${sufijos[n] ?? "°"}`;
}

/** Etiqueta corta: "-20%", "2x1", "2da al 50%", "Martes -10%". */
export function etiquetaOferta(
  oferta: Pick<
    OfertaMotor,
    | "type"
    | "percentBps"
    | "amountMinor"
    | "fixedPriceMinor"
    | "buyQuantity"
    | "payQuantity"
    | "nthUnit"
    | "tiers"
    | "weekdays"
    | "paymentMethods"
    | "minPurchaseMinor"
  >,
): string {
  let base = "Oferta";
  if (oferta.type === "PERCENT" && oferta.percentBps)
    base = `-${porcentaje(oferta.percentBps)}%`;
  else if (oferta.type === "AMOUNT_OFF" && oferta.amountMinor !== null)
    base = `-${pesos(oferta.amountMinor)}`;
  else if (oferta.type === "FIXED_PRICE" && oferta.fixedPriceMinor !== null)
    base = pesos(oferta.fixedPriceMinor);
  else if (
    oferta.type === "BUY_X_PAY_Y" &&
    oferta.buyQuantity &&
    oferta.payQuantity
  )
    base = `${oferta.buyQuantity}x${oferta.payQuantity}`;
  else if (oferta.type === "NTH_UNIT_PERCENT" && oferta.nthUnit)
    base = `${ordinal(oferta.nthUnit)} al ${porcentaje(oferta.percentBps ?? 0)}%`;
  else if (oferta.type === "TIERED") {
    const primero = [...oferta.tiers].sort(
      (a, b) => a.minQuantity - b.minQuantity,
    )[0];
    if (primero)
      base = `${primero.minQuantity}+ ${
        primero.percentBps
          ? `-${porcentaje(primero.percentBps)}%`
          : `-${pesos(primero.amountMinor ?? 0n)}`
      }`;
  } else if (oferta.type === "BUNDLE") base = "Combo";
  else if (oferta.type === "PAYMENT_METHOD" && oferta.percentBps)
    base = `-${porcentaje(oferta.percentBps)}% ${textoMedios(oferta.paymentMethods ?? [])}`;
  else if (oferta.type === "SPEND_THRESHOLD" && oferta.minPurchaseMinor)
    base = `Desde ${pesos(oferta.minPurchaseMinor)} ${
      oferta.percentBps
        ? `-${porcentaje(oferta.percentBps)}%`
        : `-${pesos(oferta.amountMinor ?? 0n)}`
    }`;
  const dias = oferta.weekdays;
  if (dias !== null) {
    const unico = DIAS.findIndex((_, dia) => dias === 1 << dia);
    if (unico >= 0) return `${DIAS[unico]} ${base}`;
  }
  return base;
}

/** Si el producto del renglón entra en la oferta (sin mirar el precio manual). */
export function productoEntra(
  oferta: Pick<OfertaMotor, "productKind" | "targets" | "allProducts">,
  producto: Pick<
    RenglonMotor,
    "productId" | "categoryId" | "laboratoryId" | "isMedication"
  >,
): boolean {
  if (oferta.productKind === "MEDICATION" && !producto.isMedication)
    return false;
  if (oferta.productKind === "NON_MEDICATION" && producto.isMedication)
    return false;
  const coincide = (destino: DestinoOferta) =>
    destino.kind === "PRODUCT"
      ? destino.id === producto.productId
      : destino.kind === "LABORATORY"
        ? destino.id === producto.laboratoryId
        : producto.categoryId !== null &&
          (destino.categoryIds ?? [destino.id]).includes(producto.categoryId);
  return (
    (oferta.allProducts ||
      oferta.targets.some(
        (destino) => !destino.exclude && coincide(destino),
      )) &&
    !oferta.targets.some((destino) => destino.exclude && coincide(destino))
  );
}

/** División redondeada mitad hacia arriba (numerador y divisor positivos). */
function redondear(numerador: bigint, divisor: bigint): bigint {
  if (numerador <= 0n) return 0n;
  return (numerador * 2n + divisor) / (divisor * 2n);
}

type EstadoRenglon = {
  indice: number;
  renglon: RenglonMotor;
  brutoMinor: bigint;
  descuentoMinor: bigint;
  ofertas: OfertaMotor[];
};

type Unidad = { estado: EstadoRenglon; orden: number };

/** Valor neto por unidad de un renglón, como fracción neto / unidades. */
const netoRenglon = (estado: EstadoRenglon) =>
  estado.brutoMinor - estado.descuentoMinor;

/** Ordena unidades de mayor a menor valor neto (estable). */
function ordenarUnidades(unidades: Unidad[]): Unidad[] {
  return [...unidades].sort((a, b) => {
    const izquierda = netoRenglon(a.estado) * BigInt(b.estado.renglon.quantity);
    const derecha = netoRenglon(b.estado) * BigInt(a.estado.renglon.quantity);
    if (izquierda !== derecha) return izquierda > derecha ? -1 : 1;
    return a.orden - b.orden;
  });
}

type Evaluacion = Map<EstadoRenglon, { units: number; numerador: bigint }>;

/**
 * Lo que daría la oferta sobre esos renglones. El descuento de cada renglón
 * se acumula como fracción de denominador `unidades × 10000` y se redondea
 * una sola vez al final.
 */
function evaluar(oferta: OfertaMotor, renglones: EstadoRenglon[]): Evaluacion {
  const resultado: Evaluacion = new Map();
  const tope = Math.min(
    oferta.maxUnitsPerSale ?? Number.MAX_SAFE_INTEGER,
    oferta.remainingUnits ?? Number.MAX_SAFE_INTEGER,
  );
  if (tope <= 0 || !renglones.length) return resultado;
  const sumar = (estado: EstadoRenglon, units: number, numerador: bigint) => {
    const actual = resultado.get(estado) ?? { units: 0, numerador: 0n };
    resultado.set(estado, {
      units: actual.units + units,
      numerador: actual.numerador + numerador,
    });
  };
  let orden = 0;
  const unidades = ordenarUnidades(
    renglones.flatMap((estado) =>
      Array.from({ length: estado.renglon.quantity }, () => ({
        estado,
        orden: orden++,
      })),
    ),
  );
  // Valor de una unidad en "diezmilésimos": neto × 10000 / unidades, con el
  // denominador del renglón implícito.
  const unidadCompleta = (estado: EstadoRenglon) =>
    netoRenglon(estado) * 10000n;
  const porUnidad = (
    calcular: (estado: EstadoRenglon) => bigint,
    cantidad: number,
  ) => {
    for (const unidad of unidades.slice(0, Math.min(cantidad, tope)))
      sumar(unidad.estado, 1, calcular(unidad.estado));
  };
  const total = unidades.length;
  switch (oferta.type) {
    case "PERCENT": {
      const bps = BigInt(oferta.percentBps ?? 0);
      porUnidad((estado) => netoRenglon(estado) * bps, total);
      break;
    }
    case "AMOUNT_OFF": {
      const monto = oferta.amountMinor ?? 0n;
      porUnidad((estado) => {
        const maximo = unidadCompleta(estado);
        const pedido = monto * BigInt(estado.renglon.quantity) * 10000n;
        return pedido < maximo ? pedido : maximo;
      }, total);
      break;
    }
    case "FIXED_PRICE": {
      const fijo = oferta.fixedPriceMinor ?? 0n;
      porUnidad((estado) => {
        const diferencia =
          unidadCompleta(estado) -
          fijo * BigInt(estado.renglon.quantity) * 10000n;
        return diferencia > 0n ? diferencia : 0n;
      }, total);
      break;
    }
    case "BUY_X_PAY_Y":
    case "NTH_UNIT_PERCENT": {
      const grupo =
        oferta.type === "BUY_X_PAY_Y"
          ? (oferta.buyQuantity ?? 0)
          : (oferta.nthUnit ?? 0);
      if (grupo < 2) break;
      const regalo =
        oferta.type === "BUY_X_PAY_Y"
          ? grupo - (oferta.payQuantity ?? grupo)
          : 1;
      const bps =
        oferta.type === "BUY_X_PAY_Y" ? 10000n : BigInt(oferta.percentBps ?? 0);
      const grupos = Math.min(
        Math.floor(total / grupo),
        Math.floor(tope / grupo),
      );
      // Los grupos se arman de la unidad más cara a la más barata; en cada
      // grupo, la de regalo (o la n-ésima) es la más barata.
      for (let g = 0; g < grupos; g += 1) {
        const integrantes = unidades.slice(g * grupo, (g + 1) * grupo);
        integrantes.forEach((unidad, posicion) =>
          sumar(
            unidad.estado,
            1,
            posicion >= grupo - regalo ? netoRenglon(unidad.estado) * bps : 0n,
          ),
        );
      }
      break;
    }
    case "TIERED": {
      const escalon = [...oferta.tiers]
        .filter((tier) => tier.minQuantity <= total)
        .sort((a, b) => b.minQuantity - a.minQuantity)[0];
      if (!escalon) break;
      if (escalon.percentBps) {
        const bps = BigInt(escalon.percentBps);
        porUnidad((estado) => netoRenglon(estado) * bps, total);
      } else {
        const monto = escalon.amountMinor ?? 0n;
        porUnidad((estado) => {
          const maximo = unidadCompleta(estado);
          const pedido = monto * BigInt(estado.renglon.quantity) * 10000n;
          return pedido < maximo ? pedido : maximo;
        }, total);
      }
      break;
    }
    case "BUNDLE": {
      const componentes = oferta.targets.filter(
        (destino) =>
          destino.kind === "PRODUCT" && !destino.exclude && destino.quantity,
      );
      if (!componentes.length) break;
      const unidadesCombo = componentes.reduce(
        (suma, destino) => suma + (destino.quantity ?? 0),
        0,
      );
      let combos = Math.floor(tope / unidadesCombo);
      const partes: { estado: EstadoRenglon; cantidad: number }[] = [];
      for (const destino of componentes) {
        const estado = renglones.find(
          (item) => item.renglon.productId === destino.id,
        );
        if (!estado) return resultado;
        const cantidad = destino.quantity ?? 0;
        combos = Math.min(
          combos,
          Math.floor(estado.renglon.quantity / cantidad),
        );
        partes.push({ estado, cantidad });
      }
      if (combos <= 0) break;
      // Importe de lista del combo (por unidad: neto del renglón entero
      // dividido por sus unidades, en diezmilésimos).
      const valorParte = (parte: { estado: EstadoRenglon; cantidad: number }) =>
        (netoRenglon(parte.estado) * BigInt(parte.cantidad * combos) * 10000n) /
        BigInt(parte.estado.renglon.quantity);
      const valores = partes.map(valorParte);
      const bruto = valores.reduce((suma, valor) => suma + valor, 0n);
      const descuento =
        oferta.bundlePriceMinor !== null
          ? bruto - oferta.bundlePriceMinor * BigInt(combos) * 10000n
          : (bruto * BigInt(oferta.percentBps ?? 0)) / 10000n;
      if (descuento <= 0n || bruto <= 0n) break;
      // Reparto proporcional acumulado; el remanente va al último renglón.
      let acumulado = 0n;
      let asignado = 0n;
      partes.forEach((parte, indice) => {
        acumulado += valores[indice] ?? 0n;
        const objetivo =
          indice === partes.length - 1
            ? descuento
            : (descuento * acumulado) / bruto;
        // Se pasa al denominador del renglón (unidades × 10000).
        sumar(
          parte.estado,
          parte.cantidad * combos,
          (objetivo - asignado) * BigInt(parte.estado.renglon.quantity),
        );
        asignado = objetivo;
      });
      break;
    }
  }
  return resultado;
}

/** Descuento final de cada renglón: una sola vez, a centavos, con tope. */
function descuentosDe(evaluacion: Evaluacion) {
  const descuentos = new Map<EstadoRenglon, bigint>();
  for (const [estado, { numerador }] of evaluacion) {
    const exacto = redondear(
      numerador,
      BigInt(estado.renglon.quantity) * 10000n,
    );
    const neto = netoRenglon(estado);
    descuentos.set(estado, exacto > neto ? neto : exacto);
  }
  return descuentos;
}

function puedeSumarse(oferta: OfertaMotor, estado: EstadoRenglon): boolean {
  if (!estado.ofertas.length) return true;
  return oferta.combinable && estado.ofertas.every((otra) => otra.combinable);
}

function ordenOfertas(a: OfertaMotor, b: OfertaMotor): number {
  if (a.priority !== b.priority) return b.priority - a.priority;
  if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? -1 : 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/**
 * Descuento de una oferta por medio de pago, proporcional a la parte de la
 * venta que se paga con esos medios. `totalMinor` es el total de la venta sin
 * este descuento y `elegibleMinor`, lo que vale lo que entra en la oferta.
 *
 * La regla es «el porcentaje sobre la parte del ticket que cubren esos
 * medios», despejada con los importes que no tienen vuelto:
 * - Si el efectivo no da el descuento y hay efectivo (puede tener vuelto), se
 *   mide con lo pagado con los medios que califican: d = p·E·Q / (T − p·E).
 * - Si no, con lo pagado con los otros medios: d = p·E·(T − K) / T.
 */
export function descuentoPorMedioDePago(
  oferta: Pick<OfertaMotor, "percentBps" | "paymentMethods">,
  elegibleMinor: bigint,
  totalMinor: bigint,
  pagos: CobroOfertas["pagos"],
): bigint {
  const bps = BigInt(oferta.percentBps ?? 0);
  const medios = oferta.paymentMethods ?? [];
  if (bps <= 0n || elegibleMinor <= 0n || totalMinor <= 0n || !medios.length)
    return 0n;
  const maximo = redondear(elegibleMinor * bps, 10000n);
  const califica = (method: MedioPago) => medios.includes(method);
  const suma = (filtro: (method: MedioPago) => boolean) =>
    pagos
      .filter((pago) => filtro(pago.method) && pago.amountMinor > 0n)
      .reduce((total, pago) => total + pago.amountMinor, 0n);
  const pE = elegibleMinor * bps;
  let descuento: bigint;
  if (!califica("CASH") && suma((method) => method === "CASH") > 0n) {
    const divisor = totalMinor * 10000n - pE;
    descuento = divisor > 0n ? redondear(pE * suma(califica), divisor) : maximo;
  } else {
    const cubierto = totalMinor - suma((method) => !califica(method));
    descuento =
      cubierto > 0n ? redondear(pE * cubierto, totalMinor * 10000n) : 0n;
  }
  return descuento > maximo ? maximo : descuento;
}

/**
 * Ofertas por medio de pago: con los pagos, se aplica la de mayor ahorro (no
 * se suman entre sí); sin pagos, se sugieren con el ahorro pagando todo con
 * esos medios. Respetan «combinable» como las demás.
 */
function aplicarMedioDePago(
  ofertas: readonly OfertaMotor[],
  estados: EstadoRenglon[],
  elegibles: (oferta: OfertaMotor) => EstadoRenglon[],
  cobro: CobroOfertas | undefined,
  aplicaciones: AplicacionOferta[],
  sugerencias: SugerenciaOferta[],
) {
  if (!ofertas.length) return;
  const totalMinor =
    estados.reduce((suma, estado) => suma + netoRenglon(estado), 0n) +
    (cobro?.otrosMinor ?? 0n);
  let mejor:
    | { oferta: OfertaMotor; permitidos: EstadoRenglon[]; ahorro: bigint }
    | undefined;
  for (const oferta of ofertas) {
    const permitidos = elegibles(oferta).filter(
      (estado) => netoRenglon(estado) > 0n && puedeSumarse(oferta, estado),
    );
    const elegible = permitidos.reduce(
      (suma, estado) => suma + netoRenglon(estado),
      0n,
    );
    if (!cobro) {
      const ahorro = redondear(
        elegible * BigInt(oferta.percentBps ?? 0),
        10000n,
      );
      if (ahorro <= 0n) continue;
      const medios = [...(oferta.paymentMethods ?? [])];
      sugerencias.push({
        offerId: oferta.id,
        label: etiquetaOferta(oferta),
        productIds: permitidos.map((estado) => estado.renglon.productId),
        faltan: 0,
        mensaje: `Pagando con ${textoMedios(medios)}: ${pesos(ahorro)} menos`,
        medioDePago: { medios, ahorroMinor: ahorro },
      });
      continue;
    }
    const ahorro = descuentoPorMedioDePago(
      oferta,
      elegible,
      totalMinor,
      cobro.pagos,
    );
    if (ahorro > 0n && (!mejor || ahorro > mejor.ahorro))
      mejor = { oferta, permitidos, ahorro };
  }
  if (mejor)
    repartirAhorro(mejor.oferta, mejor.permitidos, mejor.ahorro, aplicaciones);
}

/**
 * Reparte un ahorro de toda la venta entre los renglones, proporcional a su
 * neto (el remanente va al último), y lo registra como aplicación.
 */
function repartirAhorro(
  oferta: OfertaMotor,
  permitidos: EstadoRenglon[],
  ahorro: bigint,
  aplicaciones: AplicacionOferta[],
) {
  const elegible = permitidos.reduce(
    (suma, estado) => suma + netoRenglon(estado),
    0n,
  );
  if (elegible <= 0n || ahorro <= 0n) return;
  const ordenados = [...permitidos].sort((a, b) => a.indice - b.indice);
  const items: ItemAplicacion[] = [];
  let acumulado = 0n;
  let asignado = 0n;
  let unidades = 0;
  ordenados.forEach((estado, indice) => {
    const neto = netoRenglon(estado);
    acumulado += neto;
    const objetivo =
      indice === ordenados.length - 1
        ? ahorro
        : (ahorro * acumulado) / elegible;
    const descuento = objetivo - asignado;
    asignado = objetivo;
    if (descuento <= 0n) return;
    items.push({
      productId: estado.renglon.productId,
      units: estado.renglon.quantity,
      grossMinor: neto,
      discountMinor: descuento,
    });
    unidades += estado.renglon.quantity;
    estado.descuentoMinor += descuento;
    estado.ofertas.push(oferta);
  });
  aplicaciones.push({
    offerId: oferta.id,
    version: oferta.version,
    name: oferta.name,
    label: etiquetaOferta(oferta),
    type: oferta.type,
    units: unidades,
    discountMinor: ahorro,
    items,
  });
}

/**
 * Ofertas por monto de compra: si lo que entra en la oferta (ya con las demás
 * ofertas) llega al mínimo, un % o $ menos una vez por venta. Va la de mayor
 * ahorro; respetan «combinable». Si falta poco (hasta un 30% del mínimo), se
 * sugiere cuánto sumar.
 */
function aplicarMontoDeCompra(
  ofertas: readonly OfertaMotor[],
  elegibles: (oferta: OfertaMotor) => EstadoRenglon[],
  paraMinimo: (oferta: OfertaMotor) => EstadoRenglon[],
  aplicaciones: AplicacionOferta[],
  sugerencias: SugerenciaOferta[],
) {
  let mejor:
    | { oferta: OfertaMotor; permitidos: EstadoRenglon[]; ahorro: bigint }
    | undefined;
  for (const oferta of ofertas) {
    const minimo = oferta.minPurchaseMinor ?? 0n;
    if (minimo <= 0n) continue;
    const permitidos = elegibles(oferta).filter(
      (estado) => netoRenglon(estado) > 0n && puedeSumarse(oferta, estado),
    );
    const base = permitidos.reduce(
      (suma, estado) => suma + netoRenglon(estado),
      0n,
    );
    const alcanzado = paraMinimo(oferta)
      .filter(
        (estado) => netoRenglon(estado) > 0n && puedeSumarse(oferta, estado),
      )
      .reduce((suma, estado) => suma + netoRenglon(estado), 0n);
    if (alcanzado < minimo) {
      const falta = minimo - alcanzado;
      if (alcanzado > 0n && falta * 10n <= minimo * 3n)
        sugerencias.push({
          offerId: oferta.id,
          label: etiquetaOferta(oferta),
          productIds: permitidos.map((estado) => estado.renglon.productId),
          faltan: 0,
          mensaje: `Sumá ${pesos(falta)} más y llevás ${etiquetaOferta(oferta)}`,
          porMonto: { faltaMinor: falta },
        });
      continue;
    }
    const pedido = oferta.percentBps
      ? redondear(base * BigInt(oferta.percentBps), 10000n)
      : (oferta.amountMinor ?? 0n);
    const ahorro = pedido < base ? pedido : base;
    if (ahorro > 0n && (!mejor || ahorro > mejor.ahorro))
      mejor = { oferta, permitidos, ahorro };
  }
  if (mejor)
    repartirAhorro(mejor.oferta, mejor.permitidos, mejor.ahorro, aplicaciones);
}

/**
 * Aplica las ofertas vigentes al carrito. Cada renglón recibe como máximo una
 * oferta, la de mayor ahorro, salvo que todas las que lo toquen sean
 * combinables (se suman sobre el precio ya ofertado). Se elige de a una: la
 * de mayor ahorro total; a igual ahorro, mayor prioridad y después la más
 * antigua. Un renglón con precio manual no recibe ofertas.
 *
 * Las ofertas de toda la venta (por monto de compra y por medio de pago) se
 * calculan después. Si una quedó bloqueada por otra no combinable, se prueba
 * también sin la que la bloquea y gana lo que más ahorra al cliente
 * (decisión del 12/11/2026: «según combinable, pero gana la mejor»).
 */
export function calcularOfertas(
  renglones: readonly RenglonMotor[],
  ofertas: readonly OfertaMotor[],
  contexto: ContextoOfertas,
): ResultadoOfertas {
  const base = calcularUnaVez(renglones, ofertas, contexto);
  const porId = new Map(ofertas.map((oferta) => [oferta.id, oferta]));
  const deLaVenta = ofertas.filter(
    (oferta) =>
      (oferta.type === "SPEND_THRESHOLD" ||
        (oferta.type === "PAYMENT_METHOD" && contexto.cobro)) &&
      aplicaEn(oferta, contexto),
  );
  // Para cada oferta de la venta, qué ofertas ya aplicadas no la dejan sumarse.
  const bloqueos = new Map<string, Set<string>>();
  for (const oferta of deLaVenta)
    for (const aplicacion of base.aplicaciones) {
      if (aplicacion.offerId === oferta.id) continue;
      const otra = porId.get(aplicacion.offerId);
      if (!otra || (oferta.combinable && otra.combinable)) continue;
      const tocaAlguno = aplicacion.items.some((item) => {
        const renglon = renglones.find(
          (actual) => actual.productId === item.productId,
        );
        return (
          renglon &&
          !renglon.manualPrice &&
          !renglon.sinOfertas &&
          productoEntra(oferta, renglon)
        );
      });
      if (!tocaAlguno) continue;
      const conjunto = bloqueos.get(oferta.id) ?? new Set<string>();
      conjunto.add(otra.id);
      bloqueos.set(oferta.id, conjunto);
    }
  let mejor = base;
  for (const sacar of bloqueos.values()) {
    const alternativa = calcularUnaVez(
      renglones,
      ofertas.filter((oferta) => !sacar.has(oferta.id)),
      contexto,
    );
    if (alternativa.totalMinor > mejor.totalMinor) mejor = alternativa;
  }
  return mejor;
}

function calcularUnaVez(
  renglones: readonly RenglonMotor[],
  ofertas: readonly OfertaMotor[],
  contexto: ContextoOfertas,
): ResultadoOfertas {
  const estados: EstadoRenglon[] = renglones.map((renglon, indice) => ({
    indice,
    renglon,
    brutoMinor: renglon.unitPriceMinor * BigInt(renglon.quantity),
    descuentoMinor: 0n,
    ofertas: [],
  }));
  const todasVigentes = ofertas
    .filter((oferta) => aplicaEn(oferta, contexto))
    .sort(ordenOfertas);
  // Las ofertas por medio de pago van después de las demás, sobre el precio
  // ya ofertado, porque dependen de cómo se cobra la venta.
  const vigentes = todasVigentes.filter(
    (oferta) =>
      oferta.type !== "PAYMENT_METHOD" && oferta.type !== "SPEND_THRESHOLD",
  );
  const porMontoDeCompra = todasVigentes.filter(
    (oferta) => oferta.type === "SPEND_THRESHOLD",
  );
  const porMedioDePago = todasVigentes.filter(
    (oferta) => oferta.type === "PAYMENT_METHOD",
  );
  const elegibles = (oferta: OfertaMotor) =>
    estados.filter(
      (estado) =>
        estado.renglon.quantity > 0 &&
        !estado.renglon.manualPrice &&
        !estado.renglon.sinOfertas &&
        estado.brutoMinor > 0n &&
        productoEntra(oferta, estado.renglon),
    );
  const aplicaciones: AplicacionOferta[] = [];
  const pendientes = [...vigentes];
  for (;;) {
    let mejor:
      | {
          oferta: OfertaMotor;
          evaluacion: Evaluacion;
          descuentos: Map<EstadoRenglon, bigint>;
          ahorro: bigint;
        }
      | undefined;
    for (const oferta of pendientes) {
      const permitidos = elegibles(oferta).filter((estado) =>
        puedeSumarse(oferta, estado),
      );
      const evaluacion = evaluar(oferta, permitidos);
      const descuentos = descuentosDe(evaluacion);
      const ahorro = [...descuentos.values()].reduce(
        (suma, valor) => suma + valor,
        0n,
      );
      if (ahorro > 0n && (!mejor || ahorro > mejor.ahorro))
        mejor = { oferta, evaluacion, descuentos, ahorro };
    }
    if (!mejor) break;
    const elegida = mejor;
    pendientes.splice(pendientes.indexOf(elegida.oferta), 1);
    const items: ItemAplicacion[] = [];
    let unidades = 0;
    for (const estado of [...elegida.evaluacion.keys()].sort(
      (a, b) => a.indice - b.indice,
    )) {
      const { units } = elegida.evaluacion.get(estado)!;
      const descuento = elegida.descuentos.get(estado) ?? 0n;
      if (units <= 0) continue;
      const bruto =
        (netoRenglon(estado) * BigInt(units)) / BigInt(estado.renglon.quantity);
      items.push({
        productId: estado.renglon.productId,
        units,
        grossMinor: bruto > descuento ? bruto : descuento,
        discountMinor: descuento,
      });
      unidades += units;
      estado.descuentoMinor += descuento;
      estado.ofertas.push(elegida.oferta);
    }
    aplicaciones.push({
      offerId: elegida.oferta.id,
      version: elegida.oferta.version,
      name: elegida.oferta.name,
      label: etiquetaOferta(elegida.oferta),
      type: elegida.oferta.type,
      units: unidades,
      discountMinor: elegida.ahorro,
      items,
    });
  }
  const sugerencias: SugerenciaOferta[] = [];
  aplicarMontoDeCompra(
    porMontoDeCompra,
    elegibles,
    // Lo que la cajera marcó «No aplicar» igual suma para llegar al mínimo:
    // sólo no recibe el descuento.
    (oferta) =>
      estados.filter(
        (estado) =>
          estado.renglon.quantity > 0 &&
          !estado.renglon.manualPrice &&
          estado.brutoMinor > 0n &&
          productoEntra(oferta, estado.renglon),
      ),
    aplicaciones,
    sugerencias,
  );
  aplicarMedioDePago(
    porMedioDePago,
    estados,
    elegibles,
    contexto.cobro,
    aplicaciones,
    sugerencias,
  );
  for (const oferta of vigentes) {
    const candidatos = elegibles(oferta).filter(
      (estado) =>
        !estado.ofertas.length ||
        estado.ofertas.includes(oferta) ||
        puedeSumarse(oferta, estado),
    );
    if (!candidatos.length) continue;
    const total = candidatos.reduce(
      (suma, estado) => suma + estado.renglon.quantity,
      0,
    );
    const tope = Math.min(
      oferta.maxUnitsPerSale ?? Number.MAX_SAFE_INTEGER,
      oferta.remainingUnits ?? Number.MAX_SAFE_INTEGER,
    );
    let faltan = 0;
    if (oferta.type === "BUY_X_PAY_Y" || oferta.type === "NTH_UNIT_PERCENT") {
      const grupo =
        (oferta.type === "BUY_X_PAY_Y" ? oferta.buyQuantity : oferta.nthUnit) ??
        0;
      if (grupo >= 2 && total % grupo === grupo - 1 && total + 1 <= tope)
        faltan = 1;
    } else if (oferta.type === "TIERED") {
      const siguiente = [...oferta.tiers]
        .filter((tier) => tier.minQuantity > total)
        .sort((a, b) => a.minQuantity - b.minQuantity)[0];
      if (siguiente && siguiente.minQuantity - total <= 2)
        faltan = siguiente.minQuantity - total;
    } else if (oferta.type === "BUNDLE") {
      const componentes = oferta.targets.filter(
        (destino) =>
          destino.kind === "PRODUCT" && !destino.exclude && destino.quantity,
      );
      const armados = Math.min(
        ...componentes.map((destino) =>
          Math.floor(
            (candidatos.find(
              (estado) => estado.renglon.productId === destino.id,
            )?.renglon.quantity ?? 0) / (destino.quantity ?? 1),
          ),
        ),
      );
      const necesarias = componentes.reduce((suma, destino) => {
        const tiene =
          candidatos.find((estado) => estado.renglon.productId === destino.id)
            ?.renglon.quantity ?? 0;
        return (
          suma + Math.max((destino.quantity ?? 0) * (armados + 1) - tiene, 0)
        );
      }, 0);
      if (componentes.length && necesarias === 1) faltan = 1;
    }
    if (faltan <= 0) continue;
    const label = etiquetaOferta(oferta);
    sugerencias.push({
      offerId: oferta.id,
      label,
      productIds: candidatos.map((estado) => estado.renglon.productId),
      faltan,
      mensaje:
        oferta.type === "BUNDLE"
          ? `Agregá 1 más y armás el combo «${oferta.name}»`
          : `Agregá ${faltan} más y llevás ${label}`,
    });
  }
  return {
    renglones: estados.map((estado) => ({
      productId: estado.renglon.productId,
      offerDiscountMinor: estado.descuentoMinor,
      labels: estado.ofertas.map((oferta) => etiquetaOferta(oferta)),
    })),
    aplicaciones,
    sugerencias,
    totalMinor: estados.reduce(
      (suma, estado) => suma + estado.descuentoMinor,
      0n,
    ),
  };
}
