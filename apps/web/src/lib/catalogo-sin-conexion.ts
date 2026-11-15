import type { CatalogOptions, CatalogProduct } from "./api";
import type { VentaPendiente } from "./bandeja-ventas";
import { guardarEnLaPc } from "./guardar-en-la-pc";
import { categoryPath } from "./category-tree";

// Productos sin conexión (SISTEMA-79). Sin internet se puede dar de alta y
// editar un producto (precio general y foto incluidos), cambiar su estado en
// la sucursal, agregar o quitar códigos equivalentes, eliminar uno sin uso y
// crear una categoría o un laboratorio desde el formulario. Se guarda en la
// PC, firmado por quien lo hizo, y se manda solo al volver, en orden con lo
// demás. El producto nuevo se usa enseguida: su id es el de la PC.

type Base = { clientOperationId: string; occurredAt: string; deviceId: string };

/** Alta: el mismo cuerpo que con conexión. */
export type AltaDeProducto = {
  generateInternalBarcode?: boolean;
  brand?: string;
  isMedication?: boolean;
  priceDivisor?: number | null;
  splitTargetProductId?: string | null;
  splitFactor?: number | null;
  priceManual?: boolean;
  priceMarkupBps?: number;
  priceBaseMinor?: number | null;
  imageDataUrl?: string;
  name: string;
  barcode?: string;
  priceMinor: number;
  categoryId?: string;
  laboratoryId?: string;
  laboratoryName?: string;
  activeIngredient?: string;
  pharmaceuticalForm?: string;
  concentration?: string;
  presentation?: string;
  externalReferenceSource?: "official" | "preciosderemedios" | "alfabeta";
  externalReferenceName?: string;
  externalReferencePresentation?: string;
  externalReferenceBarcode?: string;
  externalReferencePriceMinor?: number;
  saleUnit?: "BOX" | "BLISTER" | "UNIT";
  description?: string;
  prescriptionRequired?: boolean;
  equivalentBarcodes?: string[];
};

/** Edición: los campos de la edición con conexión, todos opcionales. */
export type EdicionDeProducto = {
  generateInternalBarcode?: boolean;
  brand?: string | null;
  isMedication?: boolean;
  priceDivisor?: number | null;
  splitTargetProductId?: string | null;
  splitFactor?: number | null;
  priceManual?: boolean;
  priceMarkupBps?: number;
  priceBaseMinor?: number | null;
  imageDataUrl?: string | null;
  name?: string;
  barcode?: string;
  priceMinor?: number;
  categoryId?: string | null;
  laboratoryId?: string | null;
  activeIngredient?: string;
  pharmaceuticalForm?: string;
  concentration?: string;
  presentation?: string;
  externalReferenceSource?:
    "official" | "preciosderemedios" | "alfabeta" | null;
  externalReferenceName?: string | null;
  externalReferencePresentation?: string | null;
  externalReferenceBarcode?: string | null;
  externalReferencePriceMinor?: number | null;
  saleUnit?: "BOX" | "BLISTER" | "UNIT";
  description?: string;
  prescriptionRequired?: boolean;
};

export type EstadoEnSucursal = {
  status: "ACTIVE" | "ARCHIVED" | "DELETED";
  expectedStatus: "ACTIVE" | "ARCHIVED" | "DELETED";
  expectedUpdatedAt?: string | null;
  reason: string;
  expectedStock?: number;
  confirmStockWriteOff?: boolean;
};

export type OperacionCatalogo = Base &
  (
    | { tipo: "ALTA"; cuerpo: AltaDeProducto }
    | { tipo: "EDICION"; productId: string; cuerpo: EdicionDeProducto }
    | { tipo: "ESTADO_SUCURSAL"; productId: string; cuerpo: EstadoEnSucursal }
    | { tipo: "CODIGO_AGREGAR"; productId: string; cuerpo: { code: string } }
    | { tipo: "CODIGO_QUITAR"; productId: string; cuerpo: { code: string } }
    | { tipo: "ELIMINAR"; productId: string; cuerpo: Record<string, never> }
    | {
        tipo: "OPCION";
        cuerpo: {
          type: "categories" | "laboratories";
          name: string;
          parentId?: string | null;
          icon?: string;
          color?: string;
        };
      }
    // Categorías, laboratorios y listas de precios (SISTEMA-80).
    | {
        tipo: "OPCION_EDICION";
        cuerpo: {
          type: "categories" | "laboratories";
          id: string;
          name: string;
          parentId?: string | null;
        };
      }
    | {
        tipo: "OPCION_BAJA";
        cuerpo: { type: "categories" | "laboratories"; id: string };
      }
    | {
        tipo: "OPCION_ICONO";
        cuerpo: { id: string; icon: string; color?: string };
      }
    | { tipo: "LOGO"; cuerpo: { id: string; dataUrl: string | null } }
    | { tipo: "LISTA_ALTA"; cuerpo: { name: string; includeAll?: boolean } }
    | {
        tipo: "LISTA_EDICION";
        cuerpo: {
          priceListId: string;
          name: string;
          fallbackPriceListId?: string | null;
        };
      }
    | {
        tipo: "LISTA_PRECIOS";
        cuerpo: {
          priceListId: string;
          changes: {
            productId: string;
            expectedMinor: string | null;
            amountMinor: string | null;
          }[];
        };
      }
  );

type DatosCatalogo = OperacionCatalogo extends infer T
  ? T extends OperacionCatalogo
    ? Omit<T, keyof Base>
    : never
  : never;

const operacionDe = (item: VentaPendiente) =>
  item.operacion === "CATALOGO"
    ? (item.cuerpo as unknown as OperacionCatalogo)
    : undefined;

/** Operaciones de productos de la farmacia que esperan llegar al servidor. */
export function pendientesDeCatalogo(
  bandeja: readonly VentaPendiente[],
  org: string,
) {
  return bandeja.flatMap((item) => {
    const op = operacionDe(item);
    return op && item.estado === "PENDIENTE" && item.organizationId === org
      ? [{ op, branchId: item.branchId }]
      : [];
  });
}

const productoDe = (op: OperacionCatalogo) =>
  op.tipo === "ALTA"
    ? op.clientOperationId
    : "productId" in op
      ? op.productId
      : undefined;

/**
 * ¿El producto tiene algo sin enviar (o se dio de alta sin conexión)? Lo
 * nuevo va detrás, en la PC, para llegar en orden.
 */
export function productoConPendientes(
  bandeja: readonly VentaPendiente[],
  org: string,
  productId: string,
) {
  return pendientesDeCatalogo(bandeja, org).some(
    ({ op }) => productoDe(op) === productId,
  );
}

/** Guarda la operación en la PC, firmada por quien la hace. */
export function guardarOperacionCatalogo(
  organizationId: string,
  branchId: string,
  datos: DatosCatalogo,
  clientOperationId: string = crypto.randomUUID(),
) {
  return guardarEnLaPc<OperacionCatalogo>(
    organizationId,
    branchId,
    "CATALOGO",
    { ...datos, clientOperationId } as Omit<
      OperacionCatalogo,
      "occurredAt" | "deviceId"
    >,
  );
}

const texto = (valor: string | null | undefined) => valor?.trim() || null;
const codigoPrincipal = (p: CatalogProduct) =>
  p.barcodes.find((b) => b.primary)?.code ?? "";

/**
 * Lo que cambió una edición respecto de lo que se ve: sin conexión sólo se
 * mandan esos campos, así no se pisa lo que otra PC cambió en otros.
 */
export function camposCambiadosDelProducto(
  antes: CatalogProduct,
  despues: EdicionDeProducto,
): EdicionDeProducto {
  const cambios: Record<string, unknown> = {};
  const actual: Record<string, unknown> = {
    name: antes.name,
    brand: antes.brand ?? null,
    isMedication: antes.isMedication ?? false,
    activeIngredient: antes.activeIngredient,
    pharmaceuticalForm: antes.pharmaceuticalForm,
    concentration: antes.concentration,
    presentation: antes.presentation,
    saleUnit: antes.saleUnit,
    description: antes.description,
    prescriptionRequired: antes.prescriptionRequired,
    externalReferenceSource: antes.externalReferenceSource,
    externalReferenceName: antes.externalReferenceName,
    externalReferencePresentation: antes.externalReferencePresentation,
    externalReferenceBarcode: antes.externalReferenceBarcode,
    externalReferencePriceMinor:
      antes.externalReferencePriceMinor === null
        ? null
        : Number(antes.externalReferencePriceMinor),
    priceDivisor: antes.priceDivisor ?? null,
    splitTargetProductId: antes.splitTargetProductId ?? null,
    splitFactor: antes.splitFactor ?? null,
    priceManual: antes.priceManual ?? false,
    priceMarkupBps: antes.priceMarkupBps ?? 0,
    priceBaseMinor:
      antes.priceBaseMinor == null ? null : Number(antes.priceBaseMinor),
    categoryId: antes.category?.id ?? null,
    laboratoryId: antes.laboratory?.id ?? null,
    barcode: codigoPrincipal(antes),
    priceMinor:
      antes.prices[0] === undefined
        ? null
        : Number(antes.prices[0].amountMinor),
  };
  const igual = (a: unknown, b: unknown) =>
    typeof a === "string" || typeof b === "string"
      ? texto(a as string) === texto(b as string)
      : (a ?? null) === (b ?? null);
  for (const [campo, valor] of Object.entries(despues)) {
    if (valor === undefined) continue;
    if (campo === "imageDataUrl" || campo === "generateInternalBarcode") {
      if (valor !== false) cambios[campo] = valor;
      continue;
    }
    if (!(campo in actual) || !igual(actual[campo], valor))
      cambios[campo] = valor;
  }
  return cambios as EdicionDeProducto;
}

/** Categorías y laboratorios con los creados en la PC que todavía no llegaron. */
export function opcionesConPendientes(
  opciones: CatalogOptions,
  bandeja: readonly VentaPendiente[],
  org: string,
): CatalogOptions {
  const pendientes = pendientesDeCatalogo(bandeja, org).filter(({ op }) =>
    TIPOS_DE_OPCION.has(op.tipo),
  );
  if (!pendientes.length) return opciones;
  const r: CatalogOptions = {
    categories: opciones.categories.map((o) => ({ ...o })),
    laboratories: opciones.laboratories.map((o) => ({ ...o })),
  };
  for (const { op } of pendientes) {
    switch (op.tipo) {
      case "OPCION": {
        const lista = r[op.cuerpo.type];
        if (lista.some((o) => o.id === op.clientOperationId)) break;
        lista.push({
          id: op.clientOperationId,
          name: op.cuerpo.name.trim(),
          ...(op.cuerpo.type === "categories"
            ? {
                parentId: op.cuerpo.parentId ?? null,
                ...(op.cuerpo.icon ? { icon: op.cuerpo.icon as never } : {}),
                ...(op.cuerpo.color ? { color: op.cuerpo.color as never } : {}),
              }
            : {}),
        });
        break;
      }
      case "OPCION_EDICION": {
        const item = r[op.cuerpo.type].find((o) => o.id === op.cuerpo.id);
        if (!item) break;
        item.name = op.cuerpo.name.trim();
        if (op.cuerpo.type === "categories" && op.cuerpo.parentId !== undefined)
          item.parentId = op.cuerpo.parentId;
        break;
      }
      case "OPCION_BAJA":
        r[op.cuerpo.type] = r[op.cuerpo.type].filter(
          (o) => o.id !== op.cuerpo.id,
        );
        break;
      case "OPCION_ICONO": {
        const item = r.categories.find((o) => o.id === op.cuerpo.id);
        if (!item) break;
        item.icon = op.cuerpo.icon as never;
        if (op.cuerpo.color) item.color = op.cuerpo.color as never;
        break;
      }
      case "LOGO": {
        const item = r.laboratories.find((o) => o.id === op.cuerpo.id);
        if (item)
          item.logoUpdatedAt =
            op.cuerpo.dataUrl === null ? null : op.occurredAt;
        break;
      }
    }
  }
  // Las rutas ("Medicamentos › Analgésicos") con los nombres y padres nuevos.
  r.categories = r.categories.map((c) => ({
    ...c,
    path: categoryPath(c, r.categories),
  }));
  return r;
}

/** Operaciones que cambian categorías o laboratorios. */
const TIPOS_DE_OPCION = new Set<OperacionCatalogo["tipo"]>([
  "OPCION",
  "OPCION_EDICION",
  "OPCION_BAJA",
  "OPCION_ICONO",
  "LOGO",
]);
/** Operaciones que cambian lo que se ve de un producto. */
const TIPOS_DE_PRODUCTO = new Set<OperacionCatalogo["tipo"]>([
  "ALTA",
  "EDICION",
  "ESTADO_SUCURSAL",
  "CODIGO_AGREGAR",
  "CODIGO_QUITAR",
  "ELIMINAR",
  "OPCION_EDICION",
  "OPCION_BAJA",
]);

/** Logo de un laboratorio cambiado en la PC: el nuevo, o null si se quitó. */
export function logoPendiente(
  bandeja: readonly VentaPendiente[],
  org: string,
  laboratoryId: string,
): string | null | undefined {
  let logo: string | null | undefined;
  for (const { op } of pendientesDeCatalogo(bandeja, org))
    if (op.tipo === "LOGO" && op.cuerpo.id === laboratoryId)
      logo = op.cuerpo.dataUrl;
  return logo;
}

type ListaDePrecios = {
  id: string;
  name: string;
  fallbackPriceListId?: string | null;
  updatedAt?: string;
  prices: { productId: string; amountMinor: string }[];
};

/**
 * Las listas de precios con lo hecho en la PC que todavía no llegó: listas
 * nuevas (con todos los productos si se pidió), nombres y precios.
 */
export function listasConPendientes<T extends ListaDePrecios>(
  listas: readonly T[],
  bandeja: readonly VentaPendiente[],
  org: string,
): T[] {
  const pendientes = pendientesDeCatalogo(bandeja, org).filter(({ op }) =>
    op.tipo.startsWith("LISTA_"),
  );
  if (!pendientes.length) return listas as T[];
  const r = listas.map((l) => ({ ...l, prices: [...l.prices] }));
  for (const { op } of pendientes) {
    if (op.tipo === "LISTA_ALTA") {
      if (r.some((l) => l.id === op.clientOperationId)) continue;
      const general = r.find((l) => l.name === "Precio general");
      r.push({
        id: op.clientOperationId,
        name: op.cuerpo.name.trim(),
        fallbackPriceListId: null,
        prices: op.cuerpo.includeAll ? [...(general?.prices ?? [])] : [],
        porEnviar: true,
      } as unknown as T & { prices: T["prices"] });
      continue;
    }
    if (op.tipo !== "LISTA_EDICION" && op.tipo !== "LISTA_PRECIOS") continue;
    const lista = r.find((l) => l.id === op.cuerpo.priceListId);
    if (!lista) continue;
    (lista as { porEnviar?: boolean }).porEnviar = true;
    if (op.tipo === "LISTA_EDICION") {
      lista.name = op.cuerpo.name.trim();
      if (op.cuerpo.fallbackPriceListId !== undefined)
        lista.fallbackPriceListId = op.cuerpo.fallbackPriceListId;
      continue;
    }
    for (const cambio of op.cuerpo.changes) {
      lista.prices = lista.prices.filter(
        (p) => p.productId !== cambio.productId,
      );
      if (cambio.amountMinor !== null)
        lista.prices.push({
          productId: cambio.productId,
          amountMinor: cambio.amountMinor,
        });
    }
  }
  return r.sort((a, b) => a.name.localeCompare(b.name, "es"));
}

/** Precios de una lista cambiados en la PC que todavía no llegaron. */
export function preciosPendientesDeLista(
  bandeja: readonly VentaPendiente[],
  org: string,
  priceListId: string,
) {
  const precios = new Map<string, string | null>();
  for (const { op } of pendientesDeCatalogo(bandeja, org))
    if (op.tipo === "LISTA_PRECIOS" && op.cuerpo.priceListId === priceListId)
      for (const c of op.cuerpo.changes)
        precios.set(c.productId, c.amountMinor);
  return precios;
}

/**
 * Ajuste de precios (porcentaje en centésimos o monto fijo en centavos),
 * igual que en el servidor, para la vista previa sin conexión.
 */
export function precioAjustado(
  amount: bigint,
  mode: "PERCENT" | "FIXED",
  value: number,
) {
  if (!Number.isSafeInteger(value) || Math.abs(value) > 999999999999)
    throw new Error("Ajuste inválido.");
  if (mode === "PERCENT" && value < -10000)
    throw new Error("La reducción no puede superar el 100%.");
  const result =
    mode === "PERCENT"
      ? (amount * (10000n + BigInt(value)) + 5000n) / 10000n
      : amount + BigInt(value);
  if (result > 999999999999n)
    throw new Error("El precio supera el máximo permitido.");
  if (result < 0n)
    throw new Error(
      "El ajuste dejaría un precio negativo. Reducí el monto de la baja.",
    );
  return result;
}

type Opcion = { id: string; name: string; path?: string };

/**
 * El catálogo con lo hecho en la PC que todavía no llegó: los productos
 * nuevos (con la etiqueta "Por enviar"), las ediciones, los códigos, el
 * estado en esta sucursal y los eliminados.
 */
export function productosConPendientes(
  catalogo: readonly CatalogProduct[],
  bandeja: readonly VentaPendiente[],
  org: string,
  branchId: string | undefined,
  opciones?: CatalogOptions,
): CatalogProduct[] {
  const pendientes = pendientesDeCatalogo(bandeja, org);
  if (!pendientes.some(({ op }) => TIPOS_DE_PRODUCTO.has(op.tipo)))
    return catalogo as CatalogProduct[];
  const conPendientes = opciones
    ? opcionesConPendientes(opciones, bandeja, org)
    : undefined;
  const categorias = new Map<string, Opcion>();
  const laboratorios = new Map<string, Opcion>();
  for (const p of catalogo) {
    if (p.category) categorias.set(p.category.id, p.category);
    if (p.laboratory) laboratorios.set(p.laboratory.id, p.laboratory);
  }
  for (const c of conPendientes?.categories ?? []) categorias.set(c.id, c);
  for (const l of conPendientes?.laboratories ?? []) laboratorios.set(l.id, l);
  for (const { op } of pendientes)
    if (op.tipo === "OPCION")
      (op.cuerpo.type === "categories" ? categorias : laboratorios).set(
        op.clientOperationId,
        { id: op.clientOperationId, name: op.cuerpo.name.trim() },
      );
  const opcion = (mapa: Map<string, Opcion>, id: string | null | undefined) =>
    id ? (mapa.get(id) ?? { id, name: "—" }) : null;
  const lista = new Map(catalogo.map((p) => [p.id, p]));
  const copia = (id: string) => {
    const p = lista.get(id);
    if (!p) return undefined;
    const c = { ...p, barcodes: [...p.barcodes], porEnviar: true };
    lista.set(id, c);
    return c;
  };
  for (const { op, branchId: deSucursal } of pendientes) {
    switch (op.tipo) {
      case "ALTA": {
        if (lista.has(op.clientOperationId)) break;
        const c = op.cuerpo;
        const laboratorio =
          opcion(laboratorios, c.laboratoryId) ??
          (c.laboratoryName?.trim()
            ? { id: "", name: c.laboratoryName.trim() }
            : null);
        lista.set(op.clientOperationId, {
          id: op.clientOperationId,
          name: c.name.trim(),
          brand: texto(c.brand),
          isMedication: c.isMedication ?? false,
          active: true,
          branchStatus: "ACTIVE",
          priceDivisor: c.priceDivisor ?? null,
          splitTargetProductId: c.splitTargetProductId ?? null,
          splitFactor: c.splitFactor ?? null,
          priceManual: c.priceManual ?? false,
          priceMarkupBps: c.priceMarkupBps ?? 0,
          priceBaseMinor:
            c.priceBaseMinor == null ? null : String(c.priceBaseMinor),
          activeIngredient: texto(c.activeIngredient),
          pharmaceuticalForm: texto(c.pharmaceuticalForm),
          concentration: texto(c.concentration),
          presentation: texto(c.presentation),
          externalReferenceSource: c.externalReferenceSource ?? null,
          externalReferenceName: texto(c.externalReferenceName),
          externalReferencePresentation: texto(c.externalReferencePresentation),
          externalReferenceBarcode: texto(c.externalReferenceBarcode),
          externalReferencePriceMinor:
            c.externalReferencePriceMinor == null
              ? null
              : String(c.externalReferencePriceMinor),
          externalReferenceUpdatedAt: null,
          externalReferenceCheckedAt: null,
          saleUnit: c.saleUnit ?? "BOX",
          description: texto(c.description),
          prescriptionRequired: c.prescriptionRequired ?? false,
          category: opcion(categorias, c.categoryId),
          laboratory: laboratorio,
          barcodes: [
            ...(c.barcode?.trim()
              ? [
                  {
                    code: c.barcode.trim(),
                    primary: true,
                    kind: "PACKAGE" as const,
                  },
                ]
              : []),
            ...(c.equivalentBarcodes ?? []).map((code) => ({
              code,
              primary: false,
              kind: "EQUIVALENT" as const,
            })),
          ],
          prices: [{ amountMinor: String(c.priceMinor) }],
          porEnviar: true,
        });
        break;
      }
      case "EDICION": {
        const p = copia(op.productId);
        if (!p) break;
        const c = op.cuerpo;
        const textos = [
          "activeIngredient",
          "pharmaceuticalForm",
          "concentration",
          "presentation",
          "description",
          "externalReferenceName",
          "externalReferencePresentation",
          "externalReferenceBarcode",
          "brand",
        ] as const;
        for (const campo of textos)
          if (c[campo] !== undefined) p[campo] = texto(c[campo]);
        if (c.name !== undefined) p.name = c.name.trim();
        if (c.isMedication !== undefined) p.isMedication = c.isMedication;
        if (c.saleUnit !== undefined) p.saleUnit = c.saleUnit;
        if (c.prescriptionRequired !== undefined)
          p.prescriptionRequired = c.prescriptionRequired;
        if (c.externalReferenceSource !== undefined)
          p.externalReferenceSource = c.externalReferenceSource;
        if (c.externalReferencePriceMinor !== undefined)
          p.externalReferencePriceMinor =
            c.externalReferencePriceMinor === null
              ? null
              : String(c.externalReferencePriceMinor);
        if (c.priceDivisor !== undefined) p.priceDivisor = c.priceDivisor;
        if (c.splitTargetProductId !== undefined)
          p.splitTargetProductId = c.splitTargetProductId;
        if (c.splitFactor !== undefined) p.splitFactor = c.splitFactor;
        if (c.priceManual !== undefined) p.priceManual = c.priceManual;
        if (c.priceMarkupBps !== undefined) p.priceMarkupBps = c.priceMarkupBps;
        if (c.priceBaseMinor !== undefined)
          p.priceBaseMinor =
            c.priceBaseMinor === null ? null : String(c.priceBaseMinor);
        if (c.categoryId !== undefined)
          p.category = opcion(categorias, c.categoryId);
        if (c.laboratoryId !== undefined)
          p.laboratory = opcion(laboratorios, c.laboratoryId);
        if (c.priceMinor !== undefined)
          p.prices = [{ amountMinor: String(c.priceMinor) }];
        if (c.barcode !== undefined) {
          p.barcodes = p.barcodes.filter((b) => !b.primary);
          if (c.barcode.trim())
            p.barcodes.unshift({
              code: c.barcode.trim(),
              primary: true,
              kind: "PACKAGE",
            });
        }
        break;
      }
      case "ESTADO_SUCURSAL": {
        if (deSucursal !== branchId) break;
        const p = copia(op.productId);
        if (p) p.branchStatus = op.cuerpo.status;
        break;
      }
      case "CODIGO_AGREGAR": {
        const p = copia(op.productId);
        if (p && !p.barcodes.some((b) => b.code === op.cuerpo.code.trim()))
          p.barcodes.push({
            code: op.cuerpo.code.trim(),
            primary: false,
            kind: "EQUIVALENT",
          });
        break;
      }
      case "CODIGO_QUITAR": {
        const p = copia(op.productId);
        if (p)
          p.barcodes = p.barcodes.filter(
            (b) =>
              !(b.kind === "EQUIVALENT" && b.code === op.cuerpo.code.trim()),
          );
        break;
      }
      case "ELIMINAR":
        lista.delete(op.productId);
        break;
      default:
        break;
    }
  }
  // Categorías y laboratorios renombrados o eliminados en la PC (SISTEMA-80).
  if (
    pendientes.some(
      ({ op }) => op.tipo === "OPCION_EDICION" || op.tipo === "OPCION_BAJA",
    )
  ) {
    const bajas = new Set(
      pendientes.flatMap(({ op }) =>
        op.tipo === "OPCION_BAJA" ? [op.cuerpo.id] : [],
      ),
    );
    const al = (mapa: Map<string, Opcion>, o: Opcion | null) =>
      o && !bajas.has(o.id) ? (mapa.get(o.id) ?? o) : null;
    for (const [id, p] of lista) {
      const category = al(categorias, p.category);
      const laboratory = al(laboratorios, p.laboratory);
      if (
        category?.name !== p.category?.name ||
        category?.path !== p.category?.path ||
        laboratory?.name !== p.laboratory?.name
      )
        lista.set(id, { ...p, category, laboratory });
    }
  }
  return [...lista.values()].sort(
    (a, b) => a.name.localeCompare(b.name, "es") || a.id.localeCompare(b.id),
  );
}

/** Nombre de la operación para el panel de sincronización. */
export function operacionCatalogoTexto(item: VentaPendiente) {
  const op = operacionDe(item);
  if (!op) return "Producto";
  switch (op.tipo) {
    case "ALTA":
      return `Alta de producto · ${op.cuerpo.name.trim()}`;
    case "EDICION":
      return "Edición de producto";
    case "ESTADO_SUCURSAL":
      return op.cuerpo.status === "ACTIVE"
        ? "Reactivación en la sucursal"
        : op.cuerpo.status === "ARCHIVED"
          ? "Archivado en la sucursal"
          : "Eliminado de la sucursal";
    case "CODIGO_AGREGAR":
      return `Código equivalente · ${op.cuerpo.code}`;
    case "CODIGO_QUITAR":
      return `Quitar código equivalente · ${op.cuerpo.code}`;
    case "ELIMINAR":
      return "Eliminación de producto";
    case "OPCION":
      return `${op.cuerpo.type === "categories" ? "Categoría" : "Laboratorio"} nuevo · ${op.cuerpo.name.trim()}`;
    case "OPCION_EDICION":
      return `${op.cuerpo.type === "categories" ? "Categoría" : "Laboratorio"} editado · ${op.cuerpo.name.trim()}`;
    case "OPCION_BAJA":
      return `${op.cuerpo.type === "categories" ? "Categoría" : "Laboratorio"} eliminado`;
    case "OPCION_ICONO":
      return "Ícono de categoría";
    case "LOGO":
      return op.cuerpo.dataUrl
        ? "Logo de laboratorio"
        : "Quitar logo de laboratorio";
    case "LISTA_ALTA":
      return `Lista de precios nueva · ${op.cuerpo.name.trim()}`;
    case "LISTA_EDICION":
      return `Lista de precios · ${op.cuerpo.name.trim()}`;
    case "LISTA_PRECIOS":
      return `Precios de lista · ${op.cuerpo.changes.length} producto(s)`;
  }
}
