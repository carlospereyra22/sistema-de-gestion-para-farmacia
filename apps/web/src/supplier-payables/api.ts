import { apiBaseUrl } from "../lib/api";

export type PayableScope = {
  token: string;
  organizationId: string;
  branchId: string;
};
export type InvoiceInput = {
  operationId: string;
  supplierId: string;
  purchaseId?: string;
  documentType: string;
  pointOfSale: string;
  documentNumber: string;
  issuedOn: string;
  amountMinor: string;
  reference?: string;
  notes?: string;
  dues: { dueOn: string | null; amountMinor: string }[];
};
export type Invoice = {
  paidMinor: string;
  payments: {
    id: string;
    amountMinor: string;
    paidOn: string;
    method: string;
    reference: string | null;
    createdAt: string;
    createdByName: string;
    voidedAt: string | null;
    voidedByName: string | null;
    voidReason: string | null;
    allocations: { dueId: string; amountMinor: string }[];
  }[];
  receiptId?: string | null;
  id: string;
  branchId: string;
  supplierId: string;
  supplierName: string;
  purchaseId: string | null;
  purchaseReference: string | null;
  purchaseEstimatedMinor: string | null;
  differenceMinor: string | null;
  documentType: string;
  pointOfSale: string;
  documentNumber: string;
  issuedOn: string;
  amountMinor: string;
  balanceMinor: string;
  paymentStatus: string;
  reference: string | null;
  notes: string | null;
  createdAt: string;
  createdByName: string;
  dues: {
    id: string;
    sequence: number;
    balanceMinor: string;
    dueOn: string | null;
    amountMinor: string;
  }[];
  overdueMinor: string;
  todayMinor: string;
  next7Minor: string;
  next30Minor: string;
  nextDueOn: string | null;
  dueStatus: string;
};
export type InvoicePage = {
  today: string;
  items: Invoice[];
  total: number;
  page: number;
  pages: number;
  canCreate: boolean;
  totalMinor: string;
  overdueMinor: string;
};
export type PayableOptions = {
  today: string;
  canCreate: boolean;
  suppliers: {
    id: string;
    name: string;
    accountEnabled?: boolean;
    accountTermDays?: number | null;
  }[];
  purchases: {
    id: string;
    supplierId: string;
    reference: string | null;
    status: string;
    createdAt: string;
    amountMinor: string;
  }[];
};
export class PayableError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string,
  ) {
    super(message);
  }
}
export async function payableRequest<T>(
  scope: PayableScope,
  path = "",
  body?: InvoiceInput | SupplierPaymentInput | { reason: string },
  signal?: AbortSignal,
): Promise<T> {
  const response = await fetch(
    `${apiBaseUrl}/organizations/${scope.organizationId}/branches/${scope.branchId}/supplier-payables${path}`,
    {
      method: body ? "POST" : "GET",
      headers: {
        Authorization: `Bearer ${scope.token}`,
        "Content-Type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
      signal,
    },
  );
  if (!response.ok) {
    const error = (await response
      .json()
      .catch(() => ({ message: "No se pudo completar la consulta." }))) as {
      message?: string | string[];
      code?: string;
    };
    throw new PayableError(
      Array.isArray(error.message)
        ? error.message.join(" ")
        : (error.message ?? "No se pudo completar la operación."),
      response.status,
      error.code,
    );
  }
  return response.json() as Promise<T>;
}
export const documentLabels: Record<string, string> = {
  FACTURA_A: "Factura A",
  FACTURA_B: "Factura B",
  FACTURA_C: "Factura C",
  OTRO: "Otro documento de deuda",
};
export const dueLabels: Record<string, string> = {
  PAID: "Saldada",
  OVERDUE: "Vencida",
  TODAY: "Vence hoy",
  SOON: "Próxima",
  UPCOMING: "A vencer",
  UNDATED: "Sin vencimiento",
};
export const paymentLabels: Record<string, string> = {
  PENDING: "Pendiente de pago",
  PARTIAL: "Parcialmente pagada",
  PAID: "Pagada",
};
export const paymentMethods: Record<string, string> = {
  TRANSFER: "Transferencia",
  CASH: "Efectivo",
  CHECK: "Cheque",
  OTHER: "Otro",
};
export type SupplierPaymentInput = {
  operationId: string;
  amountMinor: string;
  expectedBalanceMinor: string;
  paidOn: string;
  method: string;
  reference?: string;
};
export function ars(value: string) {
  const amount = BigInt(value),
    absolute = amount < 0n ? -amount : amount;
  return `${amount < 0n ? "−" : ""}$ ${(absolute / 100n).toLocaleString("es-AR")},${(absolute % 100n).toString().padStart(2, "0")}`;
}
export const dateLabel = (date: string | null) =>
  date ? date.split("-").reverse().join("/") : "Sin vencimiento";
export function inputMinor(value: string) {
  const normalized = value.trim().replace(",", ".");
  if (!/^\d{1,12}(\.\d{1,2})?$/.test(normalized))
    throw new Error(
      "Ingresá un importe válido, sin separador de miles y con hasta dos decimales.",
    );
  const [whole, fraction = ""] = normalized.split(".");
  const minor = BigInt(whole!) * 100n + BigInt(fraction.padEnd(2, "0"));
  if (minor <= 0n || minor > 99999999999999n)
    throw new Error(
      "El importe debe ser mayor que cero y estar dentro del límite permitido.",
    );
  return minor.toString();
}
export function purchaseAmountInput(amountMinor?: string): string {
  if (amountMinor === undefined) return "";
  const amount = BigInt(amountMinor);
  return `${amount / 100n},${String(amount % 100n).padStart(2, "0")}`;
}
