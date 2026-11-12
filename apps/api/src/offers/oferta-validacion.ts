import { BadRequestException } from "@nestjs/common";

import type {
  MedioPago,
  TipoOferta,
  TipoProductoOferta,
} from "./ofertas-motor";

export type OfertaEntrada = {
  name: string;
  type: TipoOferta;
  priority?: number | null;
  combinable?: boolean | null;
  startsAt: string;
  endsAt?: string | null;
  weekdays?: number | null;
  dayStartMinute?: number | null;
  dayEndMinute?: number | null;
  branchIds?: string[] | null;
  priceListIds?: string[] | null;
  productKind?: TipoProductoOferta | null;
  maxUnitsPerSale?: number | null;
  maxUnitsTotal?: number | null;
  percentBps?: number | null;
  amountMinor?: string | null;
  fixedPriceMinor?: string | null;
  buyQuantity?: number | null;
  payQuantity?: number | null;
  nthUnit?: number | null;
  bundlePriceMinor?: string | null;
  paymentMethods?: MedioPago[] | null;
  allProducts?: boolean | null;
  minPurchaseMinor?: string | null;
  tiers?:
    | {
        minQuantity: number;
        percentBps?: number | null;
        amountMinor?: string | null;
      }[]
    | null;
  targets: {
    kind: "PRODUCT" | "CATEGORY" | "LABORATORY";
    id: string;
    exclude?: boolean | null;
    quantity?: number | null;
  }[];
};

export type OfertaNormalizada = {
  datos: {
    name: string;
    type: TipoOferta;
    priority: number;
    combinable: boolean;
    startsAt: Date;
    endsAt: Date | null;
    weekdays: number | null;
    dayStartMinute: number | null;
    dayEndMinute: number | null;
    allBranches: boolean;
    allPriceLists: boolean;
    productKind: TipoProductoOferta;
    maxUnitsPerSale: number | null;
    maxUnitsTotal: number | null;
    percentBps: number | null;
    amountMinor: bigint | null;
    fixedPriceMinor: bigint | null;
    buyQuantity: number | null;
    payQuantity: number | null;
    nthUnit: number | null;
    bundlePriceMinor: bigint | null;
    paymentMethods: MedioPago[];
    allProducts: boolean;
    minPurchaseMinor: bigint | null;
  };
  tiers: {
    minQuantity: number;
    percentBps: number | null;
    amountMinor: bigint | null;
  }[];
  targets: {
    kind: "PRODUCT" | "CATEGORY" | "LABORATORY";
    id: string;
    exclude: boolean;
    quantity: number | null;
  }[];
  branchIds: string[];
  priceListIds: string[];
};

const MAXIMO_MINOR = 100_000_000_000n; // $1.000 millones

function error(mensaje: string): never {
  throw new BadRequestException(mensaje);
}

function importe(valor: string | null | undefined, campo: string) {
  if (valor === null || valor === undefined || valor === "") return null;
  if (!/^\d{1,15}$/.test(valor))
    error(`Revisá ${campo}: tiene que ser un importe en centavos.`);
  const monto = BigInt(valor);
  if (monto > MAXIMO_MINOR) error(`Revisá ${campo}: es demasiado alto.`);
  return monto;
}

function fecha(valor: string, campo: string) {
  const resultado = new Date(valor);
  if (!Number.isFinite(resultado.getTime()))
    error(`Revisá ${campo}: no es una fecha válida.`);
  return resultado;
}

function porcentajeBps(valor: number | null | undefined, campo: string) {
  if (!Number.isInteger(valor) || valor! < 1 || valor! > 10000)
    error(`Indicá ${campo} entre 0,01% y 100%.`);
  return valor!;
}

/**
 * Valida lo que llega del alta o la edición y deja cada tipo con sus
 * parámetros (los demás en nulo), igual que el CHECK de la base.
 */
export function validarOferta(entrada: OfertaEntrada): OfertaNormalizada {
  const name = entrada.name.trim().replace(/\s+/g, " ");
  if (name.length < 3 || name.length > 120)
    error("El nombre de la oferta tiene que tener entre 3 y 120 caracteres.");
  const startsAt = fecha(entrada.startsAt, "el inicio");
  const endsAt = entrada.endsAt ? fecha(entrada.endsAt, "el fin") : null;
  if (endsAt && endsAt.getTime() <= startsAt.getTime())
    error("El fin de la oferta tiene que ser posterior al inicio.");
  const weekdays = entrada.weekdays ?? null;
  if (
    weekdays !== null &&
    (!Number.isInteger(weekdays) || weekdays < 1 || weekdays > 127)
  )
    error("Elegí al menos un día de la semana.");
  const inicio = entrada.dayStartMinute ?? null;
  const fin = entrada.dayEndMinute ?? null;
  if ((inicio === null) !== (fin === null))
    error("Completá el horario de inicio y de fin, o dejá los dos vacíos.");
  if (
    inicio !== null &&
    fin !== null &&
    (!Number.isInteger(inicio) ||
      !Number.isInteger(fin) ||
      inicio < 0 ||
      fin > 1440 ||
      inicio >= fin)
  )
    error("El horario de fin tiene que ser posterior al de inicio.");
  const entero = (valor: number | null | undefined, campo: string) => {
    if (valor === null || valor === undefined) return null;
    if (!Number.isInteger(valor) || valor < 1 || valor > 1_000_000)
      error(`Revisá ${campo}.`);
    return valor;
  };
  const datos: OfertaNormalizada["datos"] = {
    name,
    type: entrada.type,
    priority: Math.trunc(entrada.priority ?? 0),
    combinable: Boolean(entrada.combinable),
    startsAt,
    endsAt,
    weekdays,
    dayStartMinute: inicio,
    dayEndMinute: fin,
    allBranches: !entrada.branchIds?.length,
    allPriceLists: !entrada.priceListIds?.length,
    productKind: entrada.productKind ?? "ALL",
    maxUnitsPerSale: entero(entrada.maxUnitsPerSale, "el tope por venta"),
    maxUnitsTotal: entero(entrada.maxUnitsTotal, "el tope total"),
    percentBps: null,
    amountMinor: null,
    fixedPriceMinor: null,
    buyQuantity: null,
    payQuantity: null,
    nthUnit: null,
    bundlePriceMinor: null,
    paymentMethods: [],
    allProducts: Boolean(entrada.allProducts),
    minPurchaseMinor: null,
  };
  if (Math.abs(datos.priority) > 1000)
    error("La prioridad va de -1000 a 1000.");
  let tiers: OfertaNormalizada["tiers"] = [];
  switch (entrada.type) {
    case "PERCENT":
      datos.percentBps = porcentajeBps(entrada.percentBps, "el porcentaje");
      break;
    case "AMOUNT_OFF":
      datos.amountMinor = importe(entrada.amountMinor, "el monto");
      if (!datos.amountMinor) error("Indicá cuántos pesos se descuentan.");
      break;
    case "FIXED_PRICE":
      datos.fixedPriceMinor = importe(entrada.fixedPriceMinor, "el precio");
      if (datos.fixedPriceMinor === null)
        error("Indicá el precio de la oferta.");
      break;
    case "BUY_X_PAY_Y": {
      const lleva = entrada.buyQuantity ?? 0;
      const paga = entrada.payQuantity ?? 0;
      if (!Number.isInteger(lleva) || lleva < 2 || lleva > 100)
        error("Indicá cuántas unidades lleva (de 2 a 100).");
      if (!Number.isInteger(paga) || paga < 1 || paga >= lleva)
        error("Paga tiene que ser menos de lo que lleva (por ejemplo, 2x1).");
      datos.buyQuantity = lleva;
      datos.payQuantity = paga;
      break;
    }
    case "NTH_UNIT_PERCENT": {
      const unidad = entrada.nthUnit ?? 0;
      if (!Number.isInteger(unidad) || unidad < 2 || unidad > 100)
        error("Indicá qué unidad tiene el descuento (de la 2da a la 100).");
      datos.nthUnit = unidad;
      datos.percentBps = porcentajeBps(entrada.percentBps, "el porcentaje");
      break;
    }
    case "TIERED": {
      tiers = (entrada.tiers ?? []).map((tier) => {
        if (
          !Number.isInteger(tier.minQuantity) ||
          tier.minQuantity < 2 ||
          tier.minQuantity > 1000
        )
          error("Cada escalón empieza en 2 unidades o más.");
        const monto = importe(tier.amountMinor, "el monto del escalón");
        const bps = tier.percentBps ?? null;
        if ((bps === null) === (monto === null))
          error("Cada escalón lleva un porcentaje o un monto, no los dos.");
        return {
          minQuantity: tier.minQuantity,
          percentBps:
            bps === null
              ? null
              : porcentajeBps(bps, "el porcentaje del escalón"),
          amountMinor: monto,
        };
      });
      if (!tiers.length) error("Agregá al menos un escalón.");
      if (new Set(tiers.map((tier) => tier.minQuantity)).size !== tiers.length)
        error("Dos escalones no pueden empezar en la misma cantidad.");
      tiers.sort((a, b) => a.minQuantity - b.minQuantity);
      break;
    }
    case "BUNDLE": {
      const precio = importe(entrada.bundlePriceMinor, "el precio del combo");
      const bps = entrada.percentBps ?? null;
      if ((precio === null) === (bps === null))
        error("El combo lleva un precio total o un porcentaje, no los dos.");
      datos.bundlePriceMinor = precio;
      datos.percentBps =
        bps === null ? null : porcentajeBps(bps, "el porcentaje del combo");
      break;
    }
    case "PAYMENT_METHOD": {
      datos.percentBps = porcentajeBps(entrada.percentBps, "el porcentaje");
      const medios = [...new Set(entrada.paymentMethods ?? [])];
      if (!medios.length) error("Elegí al menos un medio de pago.");
      datos.paymentMethods = medios;
      // El descuento es sobre lo cobrado, no por unidad: no lleva topes.
      if (datos.maxUnitsPerSale !== null || datos.maxUnitsTotal !== null)
        error("Las ofertas por medio de pago no llevan tope de unidades.");
      break;
    }
    case "SPEND_THRESHOLD": {
      datos.minPurchaseMinor = importe(
        entrada.minPurchaseMinor,
        "el monto mínimo",
      );
      if (!datos.minPurchaseMinor) error("Indicá desde qué monto de compra.");
      const monto = importe(entrada.amountMinor, "el monto");
      const bps = entrada.percentBps ?? null;
      if ((monto === null) === (bps === null))
        error("El descuento es un porcentaje o un monto, no los dos.");
      datos.amountMinor = monto;
      datos.percentBps =
        bps === null ? null : porcentajeBps(bps, "el porcentaje");
      // Es una vez por venta: no lleva topes de unidades.
      if (datos.maxUnitsPerSale !== null || datos.maxUnitsTotal !== null)
        error("Las ofertas por monto de compra no llevan tope de unidades.");
      break;
    }
    default:
      error("Elegí un tipo de oferta.");
  }
  const vistos = new Set<string>();
  const targets = entrada.targets.map((target) => {
    const clave = `${target.kind}:${target.id}`;
    if (vistos.has(clave))
      error("Un producto, categoría o laboratorio aparece dos veces.");
    vistos.add(clave);
    return {
      kind: target.kind,
      id: target.id,
      exclude: Boolean(target.exclude),
      quantity: target.quantity ?? null,
    };
  });
  if (datos.allProducts) {
    if (entrada.type === "BUNDLE")
      error("El combo se arma con productos puntuales, no con todos.");
    // Con todos los productos, lo elegido sólo puede ser una exclusión.
    if (targets.some((target) => !target.exclude))
      error(
        "Con «Todos los productos», lo que elijas queda excluido de la oferta.",
      );
  } else if (!targets.some((target) => !target.exclude))
    error("Elegí al menos un producto, categoría o laboratorio.");
  if (entrada.type === "BUNDLE") {
    if (
      targets.some(
        (target) =>
          target.kind !== "PRODUCT" ||
          target.exclude ||
          !Number.isInteger(target.quantity) ||
          target.quantity! < 1 ||
          target.quantity! > 1000,
      )
    )
      error(
        "El combo se arma con productos puntuales y la cantidad de cada uno.",
      );
    if (targets.reduce((suma, target) => suma + (target.quantity ?? 0), 0) < 2)
      error("El combo necesita al menos 2 unidades en total.");
  } else if (targets.some((target) => target.quantity !== null))
    error("Sólo los combos llevan cantidad por producto.");
  return {
    datos,
    tiers,
    targets,
    branchIds: [...new Set(entrada.branchIds ?? [])],
    priceListIds: [...new Set(entrada.priceListIds ?? [])],
  };
}
