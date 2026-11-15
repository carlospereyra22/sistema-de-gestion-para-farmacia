/** Presentation only. Monetary values are persisted minor units, never recomputed by the printer. */
export interface ThermalTicket {
  kind: "sale" | "account";
  id: string;
  number: string;
  date: string;
  store: {
    printDensity?: number;
    name: string;
    address?: string;
    contact?: string;
    logoRaster?: string;
  };
  branch: string;
  cashier?: string;
  customer: string;
  cancelled?: boolean;
  items: {
    name: string;
    quantity?: number;
    unitPriceMinor?: string;
    amountMinor: string;
  }[];
  subtotalMinor?: string;
  /** Descuento total (ofertas + general): subtotal − descuento = total. */
  discountMinor?: string;
  /**
   * Parte del descuento que viene de ofertas (SISTEMA-103). Los renderizadores
   * nuevos muestran cada oferta y el resto como "Descuento"; los anteriores
   * siguen imprimiendo el descuento total, con las mismas cuentas.
   */
  offerDiscountMinor?: string;
  offers?: { label: string; name: string; amountMinor: string }[];
  /** "Usted ahorró": ofertas + descuentos. */
  savingsMinor?: string;
  totalMinor: string;
  payments: { method: string; amountMinor: string }[];
  receivedMinor?: string;
  changeMinor?: string;
  balanceAfterMinor?: string | null;
  note?: string | null;
}
