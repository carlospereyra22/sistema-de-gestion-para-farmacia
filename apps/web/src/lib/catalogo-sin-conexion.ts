import type { CatalogOptions, CatalogProduct } from "./api";
import type { VentaPendiente } from "./bandeja-ventas";
import { guardarEnLaPc } from "./guardar-en-la-pc";

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
    : op.tipo === "OPCION"
      ? undefined
      : op.productId;

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
  const pendientes = pendientesDeCatalogo(bandeja, org).filter(
    ({ op }) => op.tipo === "OPCION",
  );
  if (!pendientes.length) return opciones;
  const r: CatalogOptions = {
    categories: [...opciones.categories],
    laboratories: [...opciones.laboratories],
  };
  for (const { op } of pendientes) {
    if (op.tipo !== "OPCION") continue;
    const lista = r[op.cuerpo.type];
    if (lista.some((o) => o.id === op.clientOperationId)) continue;
    const padre = r.categories.find((c) => c.id === op.cuerpo.parentId);
    lista.push({
      id: op.clientOperationId,
      name: op.cuerpo.name.trim(),
      ...(op.cuerpo.type === "categories"
        ? {
            parentId: op.cuerpo.parentId ?? null,
            path: padre
              ? `${padre.path ?? padre.name} › ${op.cuerpo.name.trim()}`
              : op.cuerpo.name.trim(),
          }
        : {}),
    });
  }
  return r;
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
  if (!pendientes.some(({ op }) => op.tipo !== "OPCION"))
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
      case "OPCION":
        break;
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
  }
}
