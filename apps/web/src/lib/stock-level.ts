// Umbral visual compartido por catalogo, Ventas y notificaciones.
export const LOW_STOCK_UNITS = 5;

export type StockLevel = "out" | "low" | "ok";

export function stockLevel(available: number): StockLevel {
  if (available <= 0) return "out";
  return available <= LOW_STOCK_UNITS ? "low" : "ok";
}
