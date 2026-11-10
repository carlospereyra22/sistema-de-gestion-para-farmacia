import type { BranchProductChange } from "./branch-product-lifecycle";

// Productos sin conexión (SISTEMA-79; categorías, laboratorios y listas de
// precios en SISTEMA-80). Sin internet se puede dar de alta y
// editar un producto (incluido su precio general y su foto), cambiar su estado
// en la sucursal, agregar o quitar códigos equivalentes, eliminar uno sin uso
// y crear una categoría o un laboratorio desde el formulario. Al volver se
// registra en orden, una sola vez y con su hora real.
//
// Reglas (decisión del usuario, 10/11/2026):
// - Un código de barras que otra PC ya usó: la operación se registra sin ese
//   código y queda un aviso (así no se pierde lo que se le cargó al producto).
// - Dos PCs cambian el mismo dato: queda el cambio más reciente según su hora
//   real, campo por campo, con aviso.
// - Archivar o eliminar en la sucursal dando de baja stock: si el stock o el
//   estado ya no son los que se vieron, se rechaza y nada cambia.

/** Alta: el mismo cuerpo que con conexión. */
export type CuerpoAltaProducto = {
  generateInternalBarcode?: boolean;
  brand?: string;
  isMedication?: boolean;
  priceDivisor?: number | null;
  priceMarkupBps?: number;
  priceBaseMinor?: number | null;
  imageDataUrl?: string;
  name: string;
  categoryId?: string;
  laboratoryId?: string;
  laboratoryName?: string;
  barcode?: string;
  priceMinor: number;
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

/** Edición: sólo los campos que se cambiaron en la PC. */
export type CuerpoEdicionProducto = {
  generateInternalBarcode?: boolean;
  brand?: string | null;
  isMedication?: boolean;
  priceDivisor?: number | null;
  priceMarkupBps?: number;
  priceBaseMinor?: number | null;
  name?: string;
  imageDataUrl?: string | null;
  categoryId?: string | null;
  laboratoryId?: string | null;
  barcode?: string;
  priceMinor?: number;
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

type Base = { clientOperationId: string; occurredAt: string; deviceId: string };

export type OperacionCatalogoSinConexion = Base &
  (
    | { tipo: "ALTA"; cuerpo: CuerpoAltaProducto }
    | { tipo: "EDICION"; productId: string; cuerpo: CuerpoEdicionProducto }
    | {
        tipo: "ESTADO_SUCURSAL";
        productId: string;
        cuerpo: BranchProductChange;
      }
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
    // Categorías y laboratorios (SISTEMA-80).
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
    // Listas de precios (SISTEMA-80).
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

export const KIND_CATALOGO = {
  ALTA: "CATALOG_PRODUCT_CREATE",
  EDICION: "CATALOG_PRODUCT_UPDATE",
  ESTADO_SUCURSAL: "CATALOG_BRANCH_STATE",
  CODIGO_AGREGAR: "CATALOG_BARCODE_ADD",
  CODIGO_QUITAR: "CATALOG_BARCODE_REMOVE",
  ELIMINAR: "CATALOG_PRODUCT_DELETE",
  OPCION: "CATALOG_OPTION_CREATE",
  OPCION_EDICION: "CATALOG_OPTION_UPDATE",
  OPCION_BAJA: "CATALOG_OPTION_DELETE",
  OPCION_ICONO: "CATALOG_OPTION_ICON",
  LOGO: "CATALOG_LAB_LOGO",
  LISTA_ALTA: "CATALOG_PRICE_LIST_CREATE",
  LISTA_EDICION: "CATALOG_PRICE_LIST_UPDATE",
  LISTA_PRECIOS: "CATALOG_PRICE_LIST_PRICES",
} as const;

/**
 * Precios de la lista que otra PC cambió después del cambio hecho sin
 * conexión (según la hora real de cada cambio): esos quedan como están, porque
 * el más reciente gana (decisión del usuario, SISTEMA-80).
 */
export function preciosPisados(
  registros: readonly { createdAt: Date; after: unknown }[],
  cuando: Date,
  productos: readonly string[],
) {
  const pisados = new Set<string>();
  for (const registro of registros) {
    const after =
      registro.after && typeof registro.after === "object"
        ? (registro.after as { occurredAt?: unknown; changes?: unknown })
        : {};
    const hora =
      typeof after.occurredAt === "string"
        ? new Date(after.occurredAt)
        : registro.createdAt;
    if (hora <= cuando || !Array.isArray(after.changes)) continue;
    for (const cambio of after.changes as { productId?: unknown }[])
      if (
        typeof cambio?.productId === "string" &&
        productos.includes(cambio.productId)
      )
        pisados.add(cambio.productId);
  }
  return [...pisados];
}

/** Columnas del producto que se comparan para saber qué cambió una edición. */
export const COLUMNAS_DEL_PRODUCTO = [
  "name",
  "brand",
  "isMedication",
  "categoryId",
  "laboratoryId",
  "activeIngredient",
  "pharmaceuticalForm",
  "concentration",
  "presentation",
  "saleUnit",
  "description",
  "prescriptionRequired",
  "priceDivisor",
  "priceMarkupBps",
  "priceBaseMinor",
  "externalReferenceSource",
  "externalReferenceName",
  "externalReferencePresentation",
  "externalReferenceBarcode",
  "externalReferencePriceMinor",
] as const;

const comparable = (valor: unknown) =>
  typeof valor === "bigint" ? valor.toString() : (valor ?? null);

/**
 * Lo que cambió una edición, para la auditoría: el antes y el después de cada
 * columna que cambió, más el código principal, el precio general y la foto.
 * Con esto una edición sin conexión sabe si otra PC cambió el mismo dato
 * después (`camposPisados`).
 */
export function cambiosDelProducto(
  antes: Record<string, unknown>,
  despues: Record<string, unknown>,
  extra: {
    codigo?: { antes: string | null; despues: string | null };
    precio?: { antes: string | null; despues: string | null };
    foto?: boolean;
  } = {},
) {
  const before: Record<string, unknown> = {};
  const after: Record<string, unknown> = {};
  for (const columna of COLUMNAS_DEL_PRODUCTO) {
    const a = comparable(antes[columna]);
    const d = comparable(despues[columna]);
    if (a !== d) {
      before[columna] = a;
      after[columna] = d;
    }
  }
  if (extra.codigo && extra.codigo.antes !== extra.codigo.despues) {
    before.barcode = extra.codigo.antes;
    after.barcode = extra.codigo.despues;
  }
  if (extra.precio && extra.precio.antes !== extra.precio.despues) {
    before.priceMinor = extra.precio.antes;
    after.priceMinor = extra.precio.despues;
  }
  if (extra.foto) {
    before.imageDataUrl = "anterior";
    after.imageDataUrl = "nueva";
  }
  return { before, after, cambio: Object.keys(after).length > 0 };
}

/**
 * Campos de la edición que hay que comparar con lo que cambió otra PC. El
 * precio general también lo mueven el divisor y el recargo del fraccionado.
 */
export function camposDeLaEdicion(cuerpo: CuerpoEdicionProducto) {
  return Object.entries(cuerpo)
    .filter(
      ([campo, valor]) =>
        valor !== undefined && campo !== "generateInternalBarcode",
    )
    .map(([campo]) => campo);
}

/** La edición sin los campos que otra PC cambió después. */
export function sinCamposPisados(
  cuerpo: CuerpoEdicionProducto,
  pisados: readonly string[],
): CuerpoEdicionProducto {
  return Object.fromEntries(
    Object.entries(cuerpo).filter(([campo]) => !pisados.includes(campo)),
  ) as CuerpoEdicionProducto;
}
