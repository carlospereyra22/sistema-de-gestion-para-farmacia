import type { Oferta, OfertaEntrada } from "./ofertas-api";
import {
  calcularOfertas,
  etiquetaOferta,
  pesos,
  textoMedios,
  type MedioPago,
  type OfertaMotor,
  type TipoOferta,
  type TipoProductoOferta,
} from "./ofertas-motor";

/** Alta y edición de ofertas (SISTEMA-103): estado del formulario y armado. */

export const TIPOS_OFERTA: {
  type: TipoOferta;
  titulo: string;
  descripcion: string;
  ejemplo: string;
}[] = [
  {
    type: "PERCENT",
    titulo: "Porcentaje",
    descripcion: "Un porcentaje menos sobre el precio de lista.",
    ejemplo: "20% off: $10.000 queda en $8.000.",
  },
  {
    type: "AMOUNT_OFF",
    titulo: "Pesos de descuento",
    descripcion: "Le restás un monto en pesos al precio de cada unidad.",
    ejemplo: "$1.500 menos: un producto de $10.000 se vende a $8.500.",
  },
  {
    type: "FIXED_PRICE",
    titulo: "Precio de oferta",
    descripcion:
      "Elegís cuánto cuesta cada unidad mientras dure la oferta, sin importar su precio de lista.",
    ejemplo: "Ibuprofeno x20 de $6.800 se vende a $5.000.",
  },
  {
    type: "BUY_X_PAY_Y",
    titulo: "Lleva y paga (NxM)",
    descripcion:
      "Lleva N y paga M. La unidad de regalo es la más barata del grupo.",
    ejemplo: "2x1, 3x2, 4x3.",
  },
  {
    type: "NTH_UNIT_PERCENT",
    titulo: "Segunda unidad",
    descripcion: "Una de cada N unidades con un porcentaje menos.",
    ejemplo: "2da al 50%, 2da al 70%.",
  },
  {
    type: "TIERED",
    titulo: "Por cantidad",
    descripcion: "Desde cierta cantidad, un porcentaje o monto menos.",
    ejemplo: "3 o más: 15% menos; 6 o más: 20%.",
  },
  {
    type: "BUNDLE",
    titulo: "Combo",
    descripcion:
      "Un conjunto de productos con sus cantidades a un precio total o con un %.",
    ejemplo: "Shampoo + acondicionador a $9.000.",
  },
  {
    type: "PAYMENT_METHOD",
    titulo: "Medio de pago",
    descripcion:
      "Un porcentaje menos al pagar con ciertos medios. Si pagan una parte con otro medio, se descuenta sólo esa parte.",
    ejemplo: "10% pagando en efectivo los martes.",
  },
  {
    type: "SPEND_THRESHOLD",
    titulo: "Por monto de compra",
    descripcion:
      "Si la compra llega a un monto, un porcentaje o pesos menos sobre el total (una vez por venta).",
    ejemplo: "Comprando $100.000 o más: 10% menos.",
  },
];

/** Medios de pago que se pueden elegir en una oferta por medio de pago. */
export const MEDIOS_OFERTA: { value: MedioPago; label: string }[] = [
  { value: "CASH", label: "Efectivo" },
  { value: "TRANSFER", label: "Transferencia" },
  { value: "CARD", label: "Tarjeta" },
  { value: "ACCOUNT", label: "Cuenta corriente" },
];

export const DIAS_SEMANA = [
  { dia: 1, corto: "Lun", nombre: "Lunes" },
  { dia: 2, corto: "Mar", nombre: "Martes" },
  { dia: 3, corto: "Mié", nombre: "Miércoles" },
  { dia: 4, corto: "Jue", nombre: "Jueves" },
  { dia: 5, corto: "Vie", nombre: "Viernes" },
  { dia: 6, corto: "Sáb", nombre: "Sábado" },
  { dia: 0, corto: "Dom", nombre: "Domingo" },
] as const;

export type DestinoFormulario = {
  kind: "PRODUCT" | "CATEGORY" | "LABORATORY";
  id: string;
  name: string;
  exclude: boolean;
  /** Sólo combos: unidades del producto. */
  quantity: string;
};

export type EscalonFormulario = {
  desde: string;
  modo: "PORCENTAJE" | "MONTO";
  valor: string;
};

export type FormularioOferta = {
  name: string;
  type: TipoOferta;
  porcentaje: string;
  monto: string;
  precio: string;
  lleva: string;
  paga: string;
  unidad: string;
  escalones: EscalonFormulario[];
  comboModo: "PRECIO" | "PORCENTAJE";
  /** Sólo ofertas por medio de pago. */
  medios: MedioPago[];
  /** Todos los productos: lo elegido queda como exclusión. */
  todos: boolean;
  /** Sólo por monto de compra: desde cuánto y si descuenta % o pesos. */
  minimo: string;
  montoModo: "PORCENTAJE" | "MONTO";
  destinos: DestinoFormulario[];
  /** `datetime-local` en hora de Argentina. */
  inicio: string;
  fin: string;
  dias: number[];
  horaDesde: string;
  horaHasta: string;
  sucursales: string[];
  listas: string[];
  productKind: TipoProductoOferta;
  topeVenta: string;
  topeTotal: string;
  prioridad: string;
  combinable: boolean;
};

const ARGENTINA_MS = 3 * 60 * 60 * 1000;

/** ISO → `datetime-local` de Argentina. */
export function fechaLocal(iso: string | Date): string {
  const momento = typeof iso === "string" ? new Date(iso) : iso;
  return new Date(momento.getTime() - ARGENTINA_MS).toISOString().slice(0, 16);
}

/** `datetime-local` de Argentina → ISO. */
export function fechaIso(local: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(local)) return null;
  const momento = new Date(`${local}:00-03:00`);
  return Number.isFinite(momento.getTime()) ? momento.toISOString() : null;
}

/** Importe en pesos ("1.500,50", "1500.5", "$ 1500") → centavos. */
export function pesosAMinor(texto: string): number | null {
  let limpio = texto.replace(/[\s$]/g, "");
  if (!limpio) return null;
  if (limpio.includes(","))
    limpio = limpio.replace(/\./g, "").replace(",", ".");
  else if (/^\d{1,3}(\.\d{3})+$/.test(limpio))
    limpio = limpio.replace(/\./g, "");
  const partes = /^(\d{1,13})(?:\.(\d{1,2}))?$/.exec(limpio);
  if (!partes) return null;
  return Number(partes[1]) * 100 + Number((partes[2] ?? "").padEnd(2, "0"));
}

/** Porcentaje ("12,5") → puntos básicos (1250). */
export function porcentajeABps(texto: string): number | null {
  const limpio = texto.replace(/[\s%]/g, "").replace(",", ".");
  const partes = /^(\d{1,3})(?:\.(\d{1,2}))?$/.exec(limpio);
  if (!partes) return null;
  const bps =
    Number(partes[1]) * 100 + Number((partes[2] ?? "").padEnd(2, "0"));
  return bps >= 1 && bps <= 10000 ? bps : null;
}

const minorATexto = (minor: string | number | null) =>
  minor === null || minor === undefined
    ? ""
    : (Number(minor) / 100).toLocaleString("es-AR", {
        maximumFractionDigits: 2,
        useGrouping: false,
      });
const bpsATexto = (bps: number | null) =>
  bps === null ? "" : String(bps / 100).replace(".", ",");
const minutoAHora = (minuto: number | null) =>
  minuto === null
    ? ""
    : `${String(Math.floor(minuto / 60) % 24).padStart(2, "0")}:${String(minuto % 60).padStart(2, "0")}`;
const horaAMinuto = (hora: string) => {
  const partes = /^(\d{2}):(\d{2})$/.exec(hora);
  if (!partes) return null;
  return Number(partes[1]) * 60 + Number(partes[2]);
};

export function formularioVacio(
  ahora = new Date(),
  destinos: DestinoFormulario[] = [],
): FormularioOferta {
  return {
    name: "",
    type: "PERCENT",
    porcentaje: "",
    monto: "",
    precio: "",
    lleva: "2",
    paga: "1",
    unidad: "2",
    escalones: [{ desde: "3", modo: "PORCENTAJE", valor: "" }],
    comboModo: "PRECIO",
    medios: ["CASH"],
    todos: false,
    minimo: "",
    montoModo: "PORCENTAJE",
    destinos,
    inicio: fechaLocal(ahora),
    fin: "",
    dias: [],
    horaDesde: "",
    horaHasta: "",
    sucursales: [],
    listas: [],
    productKind: "ALL",
    topeVenta: "",
    topeTotal: "",
    prioridad: "0",
    combinable: false,
  };
}

export function formularioDesdeOferta(oferta: Oferta): FormularioOferta {
  return {
    name: oferta.name,
    type: oferta.type,
    porcentaje: bpsATexto(oferta.percentBps),
    monto: minorATexto(oferta.amountMinor),
    precio: minorATexto(oferta.fixedPriceMinor ?? oferta.bundlePriceMinor),
    lleva: String(oferta.buyQuantity ?? 2),
    paga: String(oferta.payQuantity ?? 1),
    unidad: String(oferta.nthUnit ?? 2),
    escalones: oferta.tiers.length
      ? oferta.tiers.map((tier) => ({
          desde: String(tier.minQuantity),
          modo: tier.percentBps ? "PORCENTAJE" : "MONTO",
          valor: tier.percentBps
            ? bpsATexto(tier.percentBps)
            : minorATexto(tier.amountMinor),
        }))
      : [{ desde: "3", modo: "PORCENTAJE", valor: "" }],
    comboModo: oferta.bundlePriceMinor !== null ? "PRECIO" : "PORCENTAJE",
    medios: oferta.paymentMethods?.length ? oferta.paymentMethods : ["CASH"],
    todos: Boolean(oferta.allProducts),
    minimo: minorATexto(oferta.minPurchaseMinor ?? null),
    montoModo:
      oferta.type === "SPEND_THRESHOLD" && oferta.amountMinor !== null
        ? "MONTO"
        : "PORCENTAJE",
    destinos: oferta.targets.map((target) => ({
      ...target,
      quantity: target.quantity === null ? "" : String(target.quantity),
    })),
    inicio: fechaLocal(oferta.startsAt),
    fin: oferta.endsAt ? fechaLocal(oferta.endsAt) : "",
    dias:
      oferta.weekdays === null
        ? []
        : [0, 1, 2, 3, 4, 5, 6].filter(
            (dia) => (oferta.weekdays ?? 0) & (1 << dia),
          ),
    horaDesde: minutoAHora(oferta.dayStartMinute),
    horaHasta: minutoAHora(oferta.dayEndMinute),
    sucursales: oferta.allBranches ? [] : oferta.branchIds,
    listas: oferta.allPriceLists ? [] : oferta.priceListIds,
    productKind: oferta.productKind,
    topeVenta: oferta.maxUnitsPerSale ? String(oferta.maxUnitsPerSale) : "",
    topeTotal: oferta.maxUnitsTotal ? String(oferta.maxUnitsTotal) : "",
    prioridad: String(oferta.priority),
    combinable: oferta.combinable,
  };
}

const entero = (texto: string) =>
  /^\d{1,7}$/.test(texto.trim()) ? Number(texto.trim()) : null;

/** Errores de cada paso, para guiar. Las reglas las impone la API. */
export function erroresPaso(
  formulario: FormularioOferta,
  paso: "tipo" | "productos" | "parametros" | "vigencia",
): string | null {
  if (paso === "tipo")
    return formulario.name.trim().length >= 3
      ? null
      : "Poné un nombre de al menos 3 letras.";
  if (paso === "productos") {
    if (formulario.todos && formulario.type !== "BUNDLE") return null;
    if (!formulario.destinos.some((destino) => !destino.exclude))
      return "Elegí al menos un producto, categoría o laboratorio.";
    if (formulario.type === "BUNDLE") {
      if (formulario.destinos.some((destino) => destino.kind !== "PRODUCT"))
        return "El combo se arma con productos puntuales.";
      const cantidades = formulario.destinos.map((destino) =>
        entero(destino.quantity),
      );
      if (cantidades.some((cantidad) => !cantidad))
        return "Indicá cuántas unidades de cada producto lleva el combo.";
      if (
        cantidades.reduce<number>((suma, valor) => suma + (valor ?? 0), 0) < 2
      )
        return "El combo necesita al menos 2 unidades en total.";
    }
    return null;
  }
  if (paso === "parametros") {
    const resultado = armarEntrada(formulario);
    return typeof resultado === "string" &&
      !resultado.startsWith("Revisá la vigencia")
      ? resultado
      : null;
  }
  const resultado = armarEntrada(formulario);
  return typeof resultado === "string" ? resultado : null;
}

/** Formulario → lo que se manda a la API, o el error para mostrar. */
export function armarEntrada(
  formulario: FormularioOferta,
): OfertaEntrada | string {
  const todos = formulario.todos && formulario.type !== "BUNDLE";
  const entrada: OfertaEntrada = {
    name: formulario.name.trim(),
    type: formulario.type,
    priority: Number(formulario.prioridad) || 0,
    combinable: formulario.combinable,
    startsAt: "",
    productKind: formulario.productKind,
    branchIds: formulario.sucursales,
    priceListIds: formulario.listas,
    allProducts: todos,
    targets: formulario.destinos.map((destino) => ({
      kind: destino.kind,
      id: destino.id,
      // Con todos los productos, lo elegido es lo que no entra.
      exclude: todos || destino.exclude,
      quantity: formulario.type === "BUNDLE" ? entero(destino.quantity) : null,
    })),
  };
  switch (formulario.type) {
    case "PERCENT": {
      const bps = porcentajeABps(formulario.porcentaje);
      if (!bps) return "Indicá un porcentaje entre 0,01 y 100.";
      entrada.percentBps = bps;
      break;
    }
    case "AMOUNT_OFF": {
      const monto = pesosAMinor(formulario.monto);
      if (!monto) return "Indicá cuántos pesos se descuentan por unidad.";
      entrada.amountMinor = String(monto);
      break;
    }
    case "FIXED_PRICE": {
      const precio = pesosAMinor(formulario.precio);
      if (precio === null) return "Indicá el precio de la oferta.";
      entrada.fixedPriceMinor = String(precio);
      break;
    }
    case "BUY_X_PAY_Y": {
      const lleva = entero(formulario.lleva);
      const paga = entero(formulario.paga);
      if (!lleva || lleva < 2 || lleva > 100)
        return "Indicá cuántas lleva (de 2 a 100).";
      if (!paga || paga >= lleva)
        return "Paga tiene que ser menos de lo que lleva (por ejemplo, 2x1).";
      entrada.buyQuantity = lleva;
      entrada.payQuantity = paga;
      break;
    }
    case "NTH_UNIT_PERCENT": {
      const unidad = entero(formulario.unidad);
      const bps = porcentajeABps(formulario.porcentaje);
      if (!unidad || unidad < 2 || unidad > 100)
        return "Indicá qué unidad lleva el descuento (2da, 3ra...).";
      if (!bps) return "Indicá el porcentaje de descuento de esa unidad.";
      entrada.nthUnit = unidad;
      entrada.percentBps = bps;
      break;
    }
    case "TIERED": {
      const escalones = [];
      for (const escalon of formulario.escalones) {
        const desde = entero(escalon.desde);
        if (!desde || desde < 2)
          return "Cada escalón empieza en 2 unidades o más.";
        if (escalon.modo === "PORCENTAJE") {
          const bps = porcentajeABps(escalon.valor);
          if (!bps) return "Indicá el porcentaje de cada escalón.";
          escalones.push({ minQuantity: desde, percentBps: bps });
        } else {
          const monto = pesosAMinor(escalon.valor);
          if (!monto) return "Indicá el monto de cada escalón.";
          escalones.push({ minQuantity: desde, amountMinor: String(monto) });
        }
      }
      if (!escalones.length) return "Agregá al menos un escalón.";
      if (
        new Set(escalones.map((escalon) => escalon.minQuantity)).size !==
        escalones.length
      )
        return "Dos escalones no pueden empezar en la misma cantidad.";
      entrada.tiers = escalones;
      break;
    }
    case "BUNDLE": {
      if (formulario.comboModo === "PRECIO") {
        const precio = pesosAMinor(formulario.precio);
        if (precio === null) return "Indicá el precio total del combo.";
        entrada.bundlePriceMinor = String(precio);
      } else {
        const bps = porcentajeABps(formulario.porcentaje);
        if (!bps) return "Indicá el porcentaje del combo.";
        entrada.percentBps = bps;
      }
      break;
    }
    case "SPEND_THRESHOLD": {
      const minimo = pesosAMinor(formulario.minimo);
      if (!minimo) return "Indicá desde qué monto de compra.";
      entrada.minPurchaseMinor = String(minimo);
      if (formulario.montoModo === "PORCENTAJE") {
        const bps = porcentajeABps(formulario.porcentaje);
        if (!bps) return "Indicá un porcentaje entre 0,01 y 100.";
        entrada.percentBps = bps;
      } else {
        const monto = pesosAMinor(formulario.monto);
        if (!monto) return "Indicá cuántos pesos se descuentan.";
        entrada.amountMinor = String(monto);
      }
      break;
    }
    case "PAYMENT_METHOD": {
      const bps = porcentajeABps(formulario.porcentaje);
      if (!bps) return "Indicá un porcentaje entre 0,01 y 100.";
      if (!formulario.medios.length) return "Elegí al menos un medio de pago.";
      entrada.percentBps = bps;
      entrada.paymentMethods = formulario.medios;
      break;
    }
  }
  const inicio = fechaIso(formulario.inicio);
  if (!inicio) return "Revisá la vigencia: indicá desde cuándo.";
  entrada.startsAt = inicio;
  if (formulario.fin) {
    const fin = fechaIso(formulario.fin);
    if (!fin) return "Revisá la vigencia: la fecha de fin no es válida.";
    if (new Date(fin) <= new Date(inicio))
      return "Revisá la vigencia: el fin tiene que ser posterior al inicio.";
    entrada.endsAt = fin;
  } else entrada.endsAt = null;
  entrada.weekdays = formulario.dias.length
    ? formulario.dias.reduce((mascara, dia) => mascara | (1 << dia), 0)
    : null;
  const desde = formulario.horaDesde ? horaAMinuto(formulario.horaDesde) : null;
  const hasta = formulario.horaHasta ? horaAMinuto(formulario.horaHasta) : null;
  if ((desde === null) !== (hasta === null))
    return "Revisá la vigencia: completá las dos horas o ninguna.";
  if (desde !== null && hasta !== null) {
    const fin = hasta === 0 ? 1440 : hasta;
    if (desde >= fin)
      return "Revisá la vigencia: la hora de fin tiene que ser posterior a la de inicio.";
    entrada.dayStartMinute = desde;
    entrada.dayEndMinute = fin;
  } else {
    entrada.dayStartMinute = null;
    entrada.dayEndMinute = null;
  }
  for (const [campo, texto] of [
    ["topeVenta", formulario.topeVenta],
    ["topeTotal", formulario.topeTotal],
  ] as const) {
    if (!texto.trim()) {
      entrada[campo === "topeVenta" ? "maxUnitsPerSale" : "maxUnitsTotal"] =
        null;
      continue;
    }
    // Medio de pago y monto de compra son sobre la venta: no llevan topes.
    if (
      formulario.type === "PAYMENT_METHOD" ||
      formulario.type === "SPEND_THRESHOLD"
    ) {
      entrada[campo === "topeVenta" ? "maxUnitsPerSale" : "maxUnitsTotal"] =
        null;
      continue;
    }
    const valor = entero(texto);
    if (!valor) return "Revisá la vigencia: los topes son cantidades enteras.";
    entrada[campo === "topeVenta" ? "maxUnitsPerSale" : "maxUnitsTotal"] =
      valor;
  }
  return entrada;
}

/** La entrada como oferta del motor, activa ahora, para la vista previa. */
export function ofertaDePrueba(entrada: OfertaEntrada): OfertaMotor {
  const monto = (valor: string | null | undefined) =>
    valor ? BigInt(valor) : null;
  return {
    id: "vista-previa",
    version: 1,
    name: entrada.name || "Oferta",
    type: entrada.type,
    status: "PUBLISHED",
    priority: 0,
    combinable: false,
    createdAt: "2000-01-01T00:00:00.000Z",
    startsAt: "2000-01-01T00:00:00.000Z",
    endsAt: null,
    weekdays: entrada.weekdays ?? null,
    dayStartMinute: null,
    dayEndMinute: null,
    branchIds: null,
    priceListIds: null,
    productKind: "ALL",
    maxUnitsPerSale: entrada.maxUnitsPerSale ?? null,
    remainingUnits: null,
    percentBps: entrada.percentBps ?? null,
    amountMinor: monto(entrada.amountMinor),
    fixedPriceMinor: monto(entrada.fixedPriceMinor),
    buyQuantity: entrada.buyQuantity ?? null,
    payQuantity: entrada.payQuantity ?? null,
    nthUnit: entrada.nthUnit ?? null,
    bundlePriceMinor: monto(entrada.bundlePriceMinor),
    paymentMethods: entrada.paymentMethods ?? [],
    minPurchaseMinor: monto(entrada.minPurchaseMinor),
    tiers: (entrada.tiers ?? []).map((tier) => ({
      minQuantity: tier.minQuantity,
      percentBps: tier.percentBps ?? null,
      amountMinor: monto(tier.amountMinor),
    })),
    targets: entrada.targets.map((target) => ({
      kind: "PRODUCT",
      id: target.id,
      exclude: false,
      quantity: target.quantity ?? null,
    })),
  };
}

export type VistaPrevia = {
  texto: string;
  etiqueta: string;
  /** Unidades del ejemplo (las del grupo en NxM, 2da unidad o escalón). */
  cantidad: number;
  /** Importe de lista de esas unidades y lo que se paga con la oferta. */
  brutoMinor: number;
  finalMinor: number;
  /** Precio por unidad con la oferta (para el aviso de costo). */
  unidadMinor: number;
};

/**
 * "Un producto de $10.000 queda en $8.000". Para un combo se usan los precios
 * de sus productos; para el resto, el precio de ejemplo.
 */
export function vistaPrevia(
  entrada: OfertaEntrada,
  precioEjemploMinor: number,
  precios: Map<string, number> = new Map(),
): VistaPrevia | null {
  const oferta = ofertaDePrueba(entrada);
  const ahora = new Date("2000-01-02T15:00:00.000Z");
  const contexto = { ahora, branchId: "", priceListId: null };
  if (entrada.type === "SPEND_THRESHOLD") {
    // Ejemplo: una compra justo del monto mínimo.
    const minimo = BigInt(entrada.minPurchaseMinor ?? "0");
    if (minimo <= 0n) return null;
    const ahorro = calcularOfertas(
      [
        {
          productId: "ejemplo",
          quantity: 1,
          unitPriceMinor: minimo,
          categoryId: null,
          laboratoryId: null,
          isMedication: false,
          manualPrice: false,
        },
      ],
      [{ ...oferta, allProducts: true, targets: [] }],
      contexto,
    ).totalMinor;
    return {
      etiqueta: etiquetaOferta(oferta),
      cantidad: 1,
      brutoMinor: Number(minimo),
      finalMinor: Number(minimo - ahorro),
      texto: `Una compra de ${pesos(minimo)} queda en ${pesos(minimo - ahorro)}.`,
      unidadMinor: Number(minimo - ahorro),
    };
  }
  if (entrada.type === "BUNDLE") {
    const renglones = entrada.targets.map((target) => ({
      productId: target.id,
      quantity: target.quantity ?? 1,
      unitPriceMinor: BigInt(precios.get(target.id) ?? 0),
      categoryId: null,
      laboratoryId: null,
      isMedication: false,
      manualPrice: false,
    }));
    const bruto = renglones.reduce(
      (suma, renglon) =>
        suma + renglon.unitPriceMinor * BigInt(renglon.quantity),
      0n,
    );
    if (!bruto) return null;
    const ahorro = calcularOfertas(renglones, [oferta], contexto).totalMinor;
    const unidades = renglones.reduce((suma, item) => suma + item.quantity, 0);
    return {
      etiqueta: etiquetaOferta(oferta),
      cantidad: unidades,
      brutoMinor: Number(bruto),
      finalMinor: Number(bruto - ahorro),
      texto: `El combo de ${pesos(bruto)} queda en ${pesos(bruto - ahorro)}.`,
      unidadMinor: Number((bruto - ahorro) / BigInt(unidades)),
    };
  }
  if (precioEjemploMinor <= 0) return null;
  const cantidad =
    entrada.type === "BUY_X_PAY_Y"
      ? (entrada.buyQuantity ?? 2)
      : entrada.type === "NTH_UNIT_PERCENT"
        ? (entrada.nthUnit ?? 2)
        : entrada.type === "TIERED"
          ? Math.min(
              ...(entrada.tiers ?? [{ minQuantity: 2 }]).map(
                (t) => t.minQuantity,
              ),
            )
          : 1;
  const id = "ejemplo";
  // Medio de pago: el ejemplo paga todo con el primer medio de la oferta.
  const medio = entrada.paymentMethods?.[0];
  const resultado = calcularOfertas(
    [
      {
        productId: id,
        quantity: cantidad,
        unitPriceMinor: BigInt(precioEjemploMinor),
        categoryId: null,
        laboratoryId: null,
        isMedication: false,
        manualPrice: false,
      },
    ],
    [
      {
        ...oferta,
        targets: [{ kind: "PRODUCT", id, exclude: false, quantity: null }],
      },
    ],
    entrada.type === "PAYMENT_METHOD" && medio
      ? {
          ...contexto,
          cobro: {
            pagos: [{ method: medio, amountMinor: BigInt(precioEjemploMinor) }],
            otrosMinor: 0n,
          },
        }
      : contexto,
  );
  const bruto = BigInt(precioEjemploMinor) * BigInt(cantidad);
  const final = bruto - resultado.totalMinor;
  return {
    etiqueta: etiquetaOferta(oferta),
    cantidad,
    brutoMinor: Number(bruto),
    finalMinor: Number(final),
    texto:
      entrada.type === "PAYMENT_METHOD"
        ? `Pagando con ${textoMedios(entrada.paymentMethods ?? [])}, un producto de ${pesos(bruto)} queda en ${pesos(final)}.`
        : cantidad === 1
          ? `Un producto de ${pesos(bruto)} queda en ${pesos(final)}.`
          : `Llevando ${cantidad} de ${pesos(BigInt(precioEjemploMinor))} pagás ${pesos(final)} en lugar de ${pesos(bruto)}.`,
    unidadMinor: Number(final / BigInt(cantidad)),
  };
}

/** Resumen de vigencia para el listado y el resumen del alta. */
export function textoVigencia(
  oferta: Pick<
    Oferta,
    "startsAt" | "endsAt" | "weekdays" | "dayStartMinute" | "dayEndMinute"
  >,
): string {
  const fecha = (iso: string) =>
    new Date(iso).toLocaleString("es-AR", {
      hourCycle: "h23",
      timeZone: "America/Argentina/Buenos_Aires",
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  const partes = [
    oferta.endsAt
      ? `${fecha(oferta.startsAt)} al ${fecha(oferta.endsAt)}`
      : `Desde ${fecha(oferta.startsAt)}`,
  ];
  if (oferta.weekdays !== null)
    partes.push(
      DIAS_SEMANA.filter(({ dia }) => (oferta.weekdays ?? 0) & (1 << dia))
        .map(({ corto }) => corto)
        .join(", "),
    );
  if (oferta.dayStartMinute !== null && oferta.dayEndMinute !== null)
    partes.push(
      `${minutoAHora(oferta.dayStartMinute)} a ${oferta.dayEndMinute === 1440 ? "24:00" : minutoAHora(oferta.dayEndMinute)}`,
    );
  return partes.join(" · ");
}
