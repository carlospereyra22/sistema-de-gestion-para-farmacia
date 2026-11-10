import { apiFetch as fetch, SinConexionError } from "../lib/api-fetch";
import { formatAmountTyping } from "../lib/amount-typing";
import {
  apiBaseUrl,
  bandejaDeLaPc,
  puedeOperarSinConexion,
  type DondeQuedo,
} from "../lib/api";
import type { VentaPendiente } from "../lib/bandeja-ventas";
import { TOKEN_SIN_CONEXION } from "../lib/cache-local";
import { conectividad } from "../lib/conectividad";
import {
  deudaConPendientes,
  deudasConPendientes,
  guardarOperacionPagar,
  hoyEnArgentina,
  paginaDeDeudas,
  type CopiaDeudas,
  type DeudaVisible,
  type FiltrosDeudas,
} from "../lib/pagar-sin-conexion";
import {
  proveedoresConPendientes,
  proveedorSinEnviar,
} from "../lib/proveedores-sin-conexion";
import { ahoraSegunServidor } from "../lib/venta-sin-conexion";

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
    /** Hecho sin conexión y todavía no enviado (SISTEMA-73). */
    porEnviar?: boolean;
  }[];
  /** Cargada o modificada sin conexión y todavía no enviada (SISTEMA-73). */
  porEnviar?: boolean;
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
  canPay: boolean;
  totalMinor: string;
  overdueMinor: string;
};
export type PayableOptions = {
  today: string;
  canCreate: boolean;
  canPay: boolean;
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
/**
 * Lee lo cargado en MoneyInput, donde el punto marca miles. Un borrador anterior
 * con punto decimal ("1000.50") no tiene forma de miles y se lee como antes.
 */
export function moneyInputMinor(value: string) {
  const text = value.trim().replace(/,$/, "");
  return inputMinor(
    /^\d{1,3}(\.\d{3})+(,\d{1,2})?$/.test(text)
      ? text.replace(/\./g, "")
      : text,
  );
}
/** Importe en centavos con el formato que muestra MoneyInput. */
export function moneyAmount(amountMinor?: string): string {
  return formatAmountTyping(purchaseAmountInput(amountMinor));
}
export function purchaseAmountInput(amountMinor?: string): string {
  if (amountMinor === undefined) return "";
  const amount = BigInt(amountMinor);
  return `${amount / 100n},${String(amount % 100n).padStart(2, "0")}`;
}

// --- Cuentas por pagar sin conexión (SISTEMA-73) ---
// Las consultas parten de la copia de la PC (`base-local`) más lo hecho sin
// enviar cuando no hay conexión o hay algo pendiente; si no, van al servidor
// como siempre. Las escrituras que no llegan quedan en la PC y se mandan solas.

/** ¿Hay que armar la vista en la PC? Sin conexión o con algo sin enviar. */
function vistaEnLaPc(scope: PayableScope, bandeja: VentaPendiente[]) {
  return (
    scope.token === TOKEN_SIN_CONEXION ||
    !conectividad().enLinea ||
    bandeja.some(
      (item) =>
        item.estado === "PENDIENTE" &&
        item.organizationId === scope.organizationId &&
        item.branchId === scope.branchId &&
        (item.operacion === "PAGAR" ||
          (item.operacion === "COMPRA" &&
            Boolean(
              (item.cuerpo.cuerpo as { debt?: unknown } | undefined)?.debt,
            ))),
    )
  );
}

/** Copia de las deudas que guarda la PC; con conexión se actualiza. */
export function getPayableCopy(scope: PayableScope) {
  return payableRequest<CopiaDeudas>(scope, "/base-local");
}

async function deudasEnLaPc(scope: PayableScope, bandeja: VentaPendiente[]) {
  const [copia, opciones] = await Promise.all([
    getPayableCopy(scope),
    getPayableOptions(scope).catch(() => undefined),
  ]);
  const hoy = hoyEnArgentina(ahoraSegunServidor());
  return {
    copia: { ...copia, today: hoy },
    deudas: deudasConPendientes(
      copia.items,
      bandeja,
      scope.organizationId,
      scope.branchId,
      hoy,
      {
        proveedores: opciones?.suppliers ?? [],
        compras: opciones?.purchases ?? [],
      },
    ),
  };
}

/** Opciones (proveedores, compras y permisos) con los proveedores sin enviar. */
export async function getPayableOptions(
  scope: PayableScope,
  signal?: AbortSignal,
): Promise<PayableOptions> {
  const opciones = await payableRequest<PayableOptions>(
    scope,
    "/options",
    undefined,
    signal,
  );
  const proveedores = proveedoresConPendientes(
    opciones.suppliers.map((s) => ({ ...s, active: true })),
    await bandejaDeLaPc(),
    scope.organizationId,
  ).filter((s) => s.active);
  return {
    ...opciones,
    // Sin conexión, la fecha de hoy es la del servidor según la PC.
    today: conectividad().enLinea
      ? opciones.today
      : hoyEnArgentina(ahoraSegunServidor()),
    suppliers: proveedores.map((s) => ({
      id: s.id,
      name: s.name,
      accountEnabled: s.accountEnabled,
      accountTermDays: s.accountTermDays,
    })),
  };
}

/** Página del listado: del servidor, o armada en la PC con lo pendiente. */
export async function getPayablePage(
  scope: PayableScope,
  filtros: FiltrosDeudas,
  signal?: AbortSignal,
): Promise<InvoicePage> {
  const bandeja = await bandejaDeLaPc();
  if (!vistaEnLaPc(scope, bandeja))
    try {
      const query = new URLSearchParams({
        search: filtros.search ?? "",
        supplierId: filtros.supplierId ?? "",
        due: filtros.due ?? "ALL",
        payment: filtros.payment ?? "ALL",
        page: String(filtros.page ?? 1),
      });
      const pagina = await payableRequest<InvoicePage>(
        scope,
        `?${query}`,
        undefined,
        signal,
      );
      // Si se cortó en el medio, la respuesta puede ser una copia vieja.
      if (conectividad().enLinea) return pagina;
    } catch (cause) {
      if (!(cause instanceof SinConexionError)) throw cause;
    }
  const { copia, deudas } = await deudasEnLaPc(scope, bandeja);
  return paginaDeDeudas(deudas, filtros, copia);
}

/** Detalle de una deuda, con lo hecho en la PC que todavía no llegó. */
export async function getPayableDetail(
  scope: PayableScope,
  id: string,
): Promise<DeudaVisible> {
  const bandeja = await bandejaDeLaPc();
  if (!vistaEnLaPc(scope, bandeja))
    try {
      const detalle = await payableRequest<Invoice>(scope, `/${id}`);
      if (conectividad().enLinea) return detalle;
    } catch (cause) {
      if (!(cause instanceof SinConexionError)) throw cause;
    }
  const { deudas } = await deudasEnLaPc(scope, bandeja);
  const deuda = deudas.find((d) => d.id === id);
  if (!deuda)
    throw new SinConexionError(
      "Sin conexión y sin datos guardados de esta deuda. Se ve cuando vuelva internet.",
    );
  return deuda;
}

/**
 * Manda la operación al servidor; si no hay conexión (o debe esperar detrás
 * de algo sin enviar), la guarda en la PC.
 */
async function pagarConRespaldo<T>(
  scope: PayableScope,
  enEspera: boolean,
  enLinea: () => Promise<T>,
  enLaPc: () => Promise<void>,
): Promise<{ donde: DondeQuedo; resultado?: T }> {
  if (enEspera && scope.token !== TOKEN_SIN_CONEXION) {
    await enLaPc();
    return { donde: "PC" };
  }
  if (scope.token !== TOKEN_SIN_CONEXION)
    try {
      return { donde: "SERVIDOR", resultado: await enLinea() };
    } catch (cause) {
      if (!(cause instanceof SinConexionError)) throw cause;
    }
  await puedeOperarSinConexion(scope.token, scope.organizationId);
  await enLaPc();
  return { donde: "PC" };
}

/** Registrar una deuda. Devuelve el id: sin conexión, la clave de la PC. */
export async function createPayable(scope: PayableScope, body: InvoiceInput) {
  const bandeja = await bandejaDeLaPc();
  const { organizationId: org, branchId } = scope;
  // Un proveedor o una compra hechos sin conexión todavía no están en el
  // servidor: la deuda espera detrás de ellos.
  const enEspera =
    proveedorSinEnviar(bandeja, org, body.supplierId) ||
    Boolean(
      body.purchaseId &&
      bandeja.some(
        (item) =>
          item.operacion === "COMPRA" &&
          item.estado === "PENDIENTE" &&
          item.id === body.purchaseId,
      ),
    );
  const { donde, resultado } = await pagarConRespaldo(
    scope,
    enEspera,
    () => payableRequest<{ id: string }>(scope, "", body),
    async () => {
      await guardarOperacionPagar(org, branchId, {
        tipo: "DEUDA",
        cuerpo: body,
      });
    },
  );
  return { donde, id: resultado?.id ?? body.operationId };
}

/** Registrar un pago. Sin conexión no se paga más de lo que la PC ve que se debe. */
export async function paySupplier(
  scope: PayableScope,
  invoice: Pick<Invoice, "id" | "balanceMinor">,
  body: SupplierPaymentInput,
) {
  const bandeja = await bandejaDeLaPc();
  const { organizationId: org, branchId } = scope;
  const { donde } = await pagarConRespaldo(
    scope,
    deudaConPendientes(bandeja, org, branchId, invoice.id),
    () => payableRequest(scope, `/${invoice.id}/payments`, body),
    async () => {
      if (BigInt(body.amountMinor) > BigInt(invoice.balanceMinor))
        throw new Error(
          "Sin conexión: el pago no puede superar el saldo que ve esta PC.",
        );
      await guardarOperacionPagar(org, branchId, {
        tipo: "PAGO",
        invoiceId: invoice.id,
        cuerpo: body,
      });
    },
  );
  return donde;
}

/** Anular un pago: sin conexión queda en la PC. */
export async function voidSupplierPayment(
  scope: PayableScope,
  invoiceId: string,
  paymentId: string,
  reason: string,
) {
  const bandeja = await bandejaDeLaPc();
  const { organizationId: org, branchId } = scope;
  const { donde } = await pagarConRespaldo(
    scope,
    deudaConPendientes(bandeja, org, branchId, invoiceId),
    () =>
      payableRequest(scope, `/${invoiceId}/payments/${paymentId}/void`, {
        reason,
      }),
    async () => {
      await guardarOperacionPagar(org, branchId, {
        tipo: "ANULAR",
        invoiceId,
        paymentId,
        cuerpo: { reason: reason.trim() },
      });
    },
  );
  return donde;
}

/**
 * Precarga (cada 10 minutos con conexión): la copia de las deudas y las
 * opciones, así Cuentas por pagar se usa sin conexión aunque nadie haya
 * entrado antes.
 */
export async function precargarCuentasPorPagar(scope: PayableScope) {
  await Promise.all([
    payableRequest(scope, "/base-local"),
    payableRequest(scope, "/options"),
  ]);
}
