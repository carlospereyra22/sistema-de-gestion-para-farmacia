import { apiBaseUrl } from "./api";

export type DueSaleDetail = {
  id: string;
  customer: {
    id: string;
    name: string;
    document: string | null;
    billingTaxId: string | null;
    billingPhone: string | null;
    creditEnabled: boolean;
  };
  branchName: string;
  saleDate: string | null;
  dueDate: string | null;
  status: string;
  daysOverdue: number;
  totalMinor: string;
  financedMinor: string;
  paidMinor: string;
  pendingMinor: string | null;
  reviewReason: string | null;
  seller: string | null;
  items: {
    id: string;
    name: string;
    quantity: number;
    unitPriceMinor: string;
    discountMinor: string;
    totalMinor: string;
    pendingMinor: string | null;
  }[];
  payments: {
    id: string;
    at: string;
    method: string | null;
    amountMinor: string;
    note: string | null;
    actor: string | null;
    shared: boolean;
  }[];
  events: {
    id: string;
    at: string;
    title: string;
    detail: string | null;
    actor: string | null;
    amountMinor: string;
    kind: string;
    calculated: boolean;
    settled: boolean;
  }[];
};
export async function getDueSaleDetail(
  token: string,
  org: string,
  branch: string,
  sale: string,
): Promise<DueSaleDetail> {
  const response = await fetch(
    `${apiBaseUrl}/organizations/${org}/branches/${branch}/customer-accounts/due-sales/${sale}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!response.ok)
    throw new Error("No se pudo consultar la venta. Volvé a intentar.");
  return response.json() as Promise<DueSaleDetail>;
}
