import type { CatalogProduct, StockLot } from "./api";
import {
  filterInventoryOptions,
  inventoryProductOption,
  type InventoryOption,
} from "./inventory-search";
import {
  catalogStockTone,
  catalogStockTotals,
} from "./product-catalog-metrics";
import {
  byLotOrder,
  leadingLot,
  productStockStatus,
  visibleProductLots,
  type ProductStockStatus,
} from "./product-lots";

const PAGE_SIZE = 10;

export type InventoryFilters = {
  query: string;
  lot: string;
  stock: string;
  expiry: string;
};

export const emptyInventoryFilters: InventoryFilters = {
  query: "",
  lot: "",
  stock: "",
  expiry: "",
};

export type InventoryRow = {
  productId: string;
  name: string;
  product?: CatalogProduct;
  // Lotes que dejan ver los filtros, en el orden acordado (byLotOrder).
  lots: StockLot[];
  // Lotes con unidades que los filtros dejan afuera.
  hiddenLots: number;
  physical: number;
  sellable: number;
  leading?: StockLot;
  status: ProductStockStatus;
};

type InventoryEntry = { id: string; name: string; product?: CatalogProduct };

function lotsByProduct(stock: StockLot[]) {
  const groups = new Map<string, StockLot[]>();
  for (const lot of stock) {
    if (lot.quantity <= 0) continue;
    groups.set(lot.productId, [...(groups.get(lot.productId) ?? []), lot]);
  }
  return groups;
}

// Inventario muestra los productos activos y cualquier producto que todavía
// tenga unidades, aunque esté archivado o ya no figure en el catálogo cargado:
// esas unidades existen en la sucursal y no se pueden perder de vista.
function inventoryEntries(
  products: CatalogProduct[],
  stock: StockLot[],
): InventoryEntry[] {
  const lots = lotsByProduct(stock);
  const known = new Set(products.map((product) => product.id));
  const catalog = products
    .filter((product) => product.active || lots.has(product.id))
    .map((product) => ({ id: product.id, name: product.name, product }));
  const missing = [...lots.entries()]
    .filter(([id]) => !known.has(id))
    .map(([id, productLots]) => ({
      id,
      name: productLots[0]!.productName,
    }));
  return [...catalog, ...missing];
}

function entryOption({ id, name, product }: InventoryEntry): InventoryOption {
  return product
    ? inventoryProductOption(product)
    : { value: id, label: name, detail: "", searchText: name };
}

// Productos para Ajustar y Devolver: sólo los que tienen lotes para elegir.
export function inventoryStockProductOptions(
  products: CatalogProduct[],
  stock: StockLot[],
) {
  const lots = lotsByProduct(stock);
  return inventoryEntries(products, stock)
    .filter(({ id }) => lots.has(id))
    .map(entryOption);
}

function matchesStock(filter: string, physical: number, sellable: number) {
  if (!filter) return true;
  if (filter === "available") return physical > 0;
  return catalogStockTone(physical, sellable) === filter;
}

function byInventoryOrder(left: InventoryRow, right: InventoryRow) {
  const byName = left.name.localeCompare(right.name, "es");
  // Sin lotes no hay nada que atender: los productos sin stock van al final.
  if (!left.leading || !right.leading)
    return left.leading ? -1 : right.leading ? 1 : byName;
  return byLotOrder(left.leading, right.leading) || byName;
}

// Una fila por producto. Sigue los mismos criterios de Productos: Stock mira el
// total del producto; Vencimiento y la búsqueda por lote eligen qué lotes se ven
// y dejan afuera los productos sin ningún lote que los cumpla.
export function inventoryRows(
  products: CatalogProduct[],
  stock: StockLot[],
  filters: InventoryFilters,
  now = new Date(),
): InventoryRow[] {
  const entries = inventoryEntries(products, stock);
  const matches = new Set(
    filterInventoryOptions(entries.map(entryOption), filters.query).map(
      (option) => option.value,
    ),
  );
  const groups = lotsByProduct(stock);
  const totals = catalogStockTotals(stock);
  const filteringLots = Boolean(filters.expiry || filters.lot.trim());
  return entries
    .flatMap(({ id, name, product }) => {
      const physical = totals.physical.get(id) ?? 0;
      const sellable = totals.sellable.get(id) ?? 0;
      if (!matches.has(id) || !matchesStock(filters.stock, physical, sellable))
        return [];
      const allLots = groups.get(id) ?? [];
      const lots = visibleProductLots(
        allLots,
        id,
        filters.expiry,
        filters.lot,
        now,
      );
      if (filteringLots && !lots.length) return [];
      return [
        {
          productId: id,
          name,
          product,
          lots,
          hiddenLots: allLots.length - lots.length,
          physical,
          sellable,
          leading: leadingLot(lots),
          status: productStockStatus(
            product?.active ?? true,
            lots,
            sellable,
            filters.stock,
          ),
        },
      ];
    })
    .sort(byInventoryOrder);
}

// Filtra primero y pagina después; si una actualización deja menos resultados,
// se queda en la última página disponible.
export function inventoryPage(rows: InventoryRow[], page: number) {
  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const currentPage = Math.max(1, Math.min(page, totalPages));
  return {
    total: rows.length,
    lots: rows.reduce((total, row) => total + row.lots.length, 0),
    totalPages,
    currentPage,
    rows: rows.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE),
  };
}
