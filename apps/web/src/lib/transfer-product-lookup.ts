import type { CatalogProduct, StockLot } from "./api";

export function findTransferProductsByBarcode(
  products: CatalogProduct[],
  stock: StockLot[],
  barcode: string,
): CatalogProduct[] {
  const code = barcode.trim().toUpperCase();
  if (!code) return [];

  const inStock = new Set(
    stock.filter((lot) => lot.quantity > 0).map((lot) => lot.productId),
  );
  return products.filter(
    (product) =>
      inStock.has(product.id) &&
      product.barcodes.some(
        (candidate) => candidate.code.trim().toUpperCase() === code,
      ),
  );
}

export function singleAvailableTransferLotId(
  stock: StockLot[],
  productId: string,
): string {
  if (!productId) return "";
  const matches = stock.filter(
    (lot) => lot.productId === productId && lot.quantity > 0,
  );
  return matches.length === 1 ? matches[0].id : "";
}
