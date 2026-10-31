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
  discountMinor?: string;
  totalMinor: string;
  payments: { method: string; amountMinor: string }[];
  receivedMinor?: string;
  changeMinor?: string;
  balanceAfterMinor?: string | null;
  note?: string | null;
}
