import type { StockLot } from "./api";
import {
  filterInventoryOptions,
  type InventoryOption,
} from "./inventory-search";

export function inventoryStockPage(
  stock: StockLot[],
  options: InventoryOption[],
  query: string,
  page: number,
) {
  const ids = new Set(
    filterInventoryOptions(options, query).map((option) => option.value),
  );
  const matches = stock.filter((lot) => ids.has(lot.id));
  const totalPages = Math.max(1, Math.ceil(matches.length / 10));
  const currentPage = Math.max(1, Math.min(page, totalPages));
  return {
    total: matches.length,
    totalPages,
    currentPage,
    lots: matches.slice((currentPage - 1) * 10, currentPage * 10),
  };
}
