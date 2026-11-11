import type {
  Invoice,
  InvoiceInput,
  InvoicePage,
  SupplierPaymentInput,
} from "../supplier-payables/api";
import type { VentaPendiente } from "./bandeja-ventas";
import { guardarEnLaPc } from "./guardar-en-la-pc";

// Cuentas por pagar sin conexión (SISTEMA-73). Sin internet se registran
// deudas, pagos y anulaciones: quedan en la PC, firmadas, y se mandan solas al
// volver, en orden. Lo que se ve parte de la copia del servidor (todas las
// deudas con saldo y las últimas saldadas) más lo hecho en la PC, con el mismo
// cálculo de saldos, vencimientos, filtros y páginas que el servidor.

type Base = { clientOperationId: string; occurredAt: string; deviceId: string };

export type OperacionPagar = Base &
  (
    | { tipo: "DEUDA"; cuerpo: InvoiceInput }
    | { tipo: "PAGO"; invoiceId: string; cuerpo: SupplierPaymentInput }
    | {
        tipo: "ANULAR";
        invoiceId: string;
        paymentId: string;
        cuerpo: { reason: string };
      }
  );

/** Deuda como se ve en la PC, con lo que todavía no llegó. */
export type DeudaVisible = Invoice;

/** Copia de las deudas de la sucursal que guarda la PC (`base-local`). */
export type CopiaDeudas = {
  today: string;
  canCreate: boolean;
  canPay: boolean;
  items: Invoice[];
};

export type FiltrosDeudas = {
  search?: string;
  supplierId?: string;
  due?: string;
  payment?: string;
  page?: number;
};

/** Fecha civil de hoy en Argentina (AAAA-MM-DD), como el servidor. */
export function hoyEnArgentina(ahora = new Date()) {
  const partes = new Intl.DateTimeFormat("en", {
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(ahora);
  return ["year", "month", "day"]
    .map((tipo) => partes.find((p) => p.type === tipo)!.value)
    .join("-");
}

const masDias = (fecha: string, dias: number) =>
  new Date(Date.parse(`${fecha}T00:00:00.000Z`) + dias * 86400000)
    .toISOString()
    .slice(0, 10);

/** Saldos, estado y vencimientos de la deuda, igual que `present` del servidor. */
export function presentarDeuda(deuda: DeudaVisible, hoy: string): DeudaVisible {
  const pagado = new Map<string, bigint>();
  for (const pago of deuda.payments)
    if (!pago.voidedAt)
      for (const a of pago.allocations)
        pagado.set(
          a.dueId,
          (pagado.get(a.dueId) ?? 0n) + BigInt(a.amountMinor),
        );
  const dues = deuda.dues.map((d) => ({
    ...d,
    balanceMinor: (BigInt(d.amountMinor) - (pagado.get(d.id) ?? 0n)).toString(),
  }));
  const saldo = dues.reduce((s, d) => s + BigInt(d.balanceMinor), 0n);
  const total = BigInt(deuda.amountMinor);
  const conSaldo = dues.filter((d) => BigInt(d.balanceMinor) > 0n);
  const suma = (cumple: (fecha: string) => boolean) =>
    conSaldo.reduce(
      (s, d) => s + (d.dueOn && cumple(d.dueOn) ? BigInt(d.balanceMinor) : 0n),
      0n,
    );
  const vencido = suma((d) => d < hoy),
    deHoy = suma((d) => d === hoy),
    proximos7 = suma((d) => d > hoy && d <= masDias(hoy, 7)),
    proximos30 = suma((d) => d > hoy && d <= masDias(hoy, 30));
  const proximo =
    conSaldo.flatMap((d) => (d.dueOn ? [d.dueOn] : [])).sort()[0] ?? null;
  return {
    ...deuda,
    dues,
    balanceMinor: saldo.toString(),
    paidMinor: (total - saldo).toString(),
    paymentStatus:
      saldo === 0n ? "PAID" : saldo < total ? "PARTIAL" : "PENDING",
    overdueMinor: vencido.toString(),
    todayMinor: deHoy.toString(),
    next7Minor: proximos7.toString(),
    next30Minor: proximos30.toString(),
    nextDueOn: proximo,
    dueStatus:
      saldo === 0n
        ? "PAID"
        : vencido > 0n
          ? "OVERDUE"
          : deHoy > 0n
            ? "TODAY"
            : proximos7 > 0n
              ? "SOON"
              : proximo
                ? "UPCOMING"
                : "UNDATED",
  };
}

/** Reparte un pago entre los vencimientos, del más viejo al más nuevo. */
export function repartirPago(
  dues: readonly Invoice["dues"][number][],
  importe: bigint,
) {
  let resta = importe;
  const asignaciones: { dueId: string; amountMinor: string }[] = [];
  for (const d of [...dues].sort(
    (a, b) =>
      (a.dueOn ?? "9999-12-31").localeCompare(b.dueOn ?? "9999-12-31") ||
      a.sequence - b.sequence,
  )) {
    const saldo = BigInt(d.balanceMinor);
    const aplicado = resta < saldo ? resta : saldo;
    if (aplicado <= 0n) continue;
    asignaciones.push({ dueId: d.id, amountMinor: aplicado.toString() });
    resta -= aplicado;
  }
  return asignaciones;
}

const operacionDe = (item: VentaPendiente) =>
  item.operacion === "PAGAR"
    ? (item.cuerpo as unknown as OperacionPagar)
    : undefined;

/** Operaciones de cuentas por pagar de la sucursal sin enviar, en orden. */
function pendientesDe(
  bandeja: readonly VentaPendiente[],
  org: string,
  branch: string,
) {
  return bandeja.flatMap((item) => {
    const op = operacionDe(item);
    return op &&
      item.estado === "PENDIENTE" &&
      item.organizationId === org &&
      item.branchId === branch
      ? [{ op, actorName: item.actorName }]
      : [];
  });
}

/** ¿La deuda tiene algo sin enviar en la PC? Lo nuevo va detrás. */

/** Pedido hecho sin conexión que sigue en la bandeja (por su clave de la PC). */
function pedidoDeLaPc(
  bandeja: readonly VentaPendiente[],
  clave: string | undefined,
): { supplierId?: string; reference?: string | null } | undefined {
  if (!clave) return undefined;
  for (const item of bandeja) {
    if (item.operacion !== "COMPRA") continue;
    const op = item.cuerpo as {
      tipo?: string;
      cuerpo?: {
        clientOperationId?: string;
        supplierId?: string;
        reference?: string | null;
      };
    };
    if (op.tipo === "PEDIDO" && op.cuerpo?.clientOperationId === clave)
      return op.cuerpo;
  }
  return undefined;
}

export function deudaConPendientes(
  bandeja: readonly VentaPendiente[],
  org: string,
  branch: string,
  invoiceId: string,
) {
  return (
    pendientesDe(bandeja, org, branch).some(({ op }) =>
      op.tipo === "DEUDA"
        ? op.clientOperationId === invoiceId
        : op.invoiceId === invoiceId,
    ) ||
    deudasDeCompras(bandeja, org, branch, [], []).some(
      (d) => d.id === invoiceId,
    )
  );
}

type Proveedor = { id: string; name: string };
type Compra = { id: string; supplierId: string; reference: string | null };

/**
 * Deudas que deja una compra directa o una recepción hecha sin conexión con
 * "Dejar pendiente de pago" (SISTEMA-69). Se conocen por la clave de la
 * recepción, que es la que tendrá la deuda en el servidor.
 */
function deudasDeCompras(
  bandeja: readonly VentaPendiente[],
  org: string,
  branch: string,
  proveedores: readonly Proveedor[],
  compras: readonly Compra[],
): DeudaVisible[] {
  return bandeja.flatMap((item) => {
    if (
      item.operacion !== "COMPRA" ||
      item.estado !== "PENDIENTE" ||
      item.organizationId !== org ||
      item.branchId !== branch
    )
      return [];
    const op = item.cuerpo as {
      tipo: string;
      occurredAt: string;
      purchaseId?: string;
      cuerpo: {
        operationId?: string;
        clientOperationId?: string;
        supplierId?: string;
        debt?: { amountMinor: string; dueOn: string | null };
      };
    };
    const debt = op.cuerpo.debt;
    const clave =
      op.tipo === "DIRECTA"
        ? op.cuerpo.clientOperationId
        : op.tipo === "RECEPCION"
          ? op.cuerpo.operationId
          : undefined;
    if (!debt || !clave) return [];
    const compra = compras.find((c) => c.id === op.purchaseId);
    // Recepción de un pedido hecho sin conexión: el pedido todavía no está en
    // el servidor, se busca en la bandeja (antes se veía "Proveedor" sin nombre).
    const pedido = compra ? undefined : pedidoDeLaPc(bandeja, op.purchaseId);
    const supplierId =
      op.cuerpo.supplierId ?? compra?.supplierId ?? pedido?.supplierId ?? "";
    return [
      {
        ...deudaNueva({
          id: clave,
          supplierId,
          supplierName:
            proveedores.find((p) => p.id === supplierId)?.name ?? "Proveedor",
          purchaseId: op.purchaseId ?? clave,
          purchaseReference: compra?.reference ?? pedido?.reference ?? null,
          documentType: "OTRO",
          pointOfSale: "",
          documentNumber: "",
          issuedOn: hoyEnArgentina(new Date(op.occurredAt)),
          amountMinor: debt.amountMinor,
          reference: "Recepción sin enviar",
          notes: null,
          createdAt: op.occurredAt,
          createdByName: item.actorName ?? "",
          dues: [{ dueOn: debt.dueOn, amountMinor: debt.amountMinor }],
        }),
        receiptId: clave,
      },
    ];
  });
}

function deudaNueva(datos: {
  id: string;
  supplierId: string;
  supplierName: string;
  purchaseId: string | null;
  purchaseReference: string | null;
  documentType: string;
  pointOfSale: string;
  documentNumber: string;
  issuedOn: string;
  amountMinor: string;
  reference: string | null;
  notes: string | null;
  createdAt: string;
  createdByName: string;
  dues: { dueOn: string | null; amountMinor: string }[];
}): DeudaVisible {
  return {
    ...datos,
    branchId: "",
    receiptId: null,
    purchaseEstimatedMinor: null,
    differenceMinor: null,
    balanceMinor: datos.amountMinor,
    paidMinor: "0",
    paymentStatus: "PENDING",
    payments: [],
    dues: datos.dues.map((d, i) => ({
      id: `${datos.id}|${i + 1}`,
      sequence: i + 1,
      dueOn: d.dueOn,
      amountMinor: d.amountMinor,
      balanceMinor: d.amountMinor,
    })),
    overdueMinor: "0",
    todayMinor: "0",
    next7Minor: "0",
    next30Minor: "0",
    nextDueOn: null,
    dueStatus: "UNDATED",
    porEnviar: true,
  };
}

/**
 * Las deudas del servidor más lo hecho en la PC: deudas nuevas (cargadas o de
 * recepciones), pagos y anulaciones, en el orden en que se hicieron.
 */
export function deudasConPendientes(
  delServidor: readonly Invoice[],
  bandeja: readonly VentaPendiente[],
  org: string,
  branch: string,
  hoy: string,
  contexto: { proveedores: readonly Proveedor[]; compras: readonly Compra[] },
): DeudaVisible[] {
  const lista: DeudaVisible[] = structuredClone([...delServidor]);
  const buscar = (id: string) => lista.find((d) => d.id === id);
  for (const deuda of deudasDeCompras(
    bandeja,
    org,
    branch,
    contexto.proveedores,
    contexto.compras,
  ))
    if (!buscar(deuda.id)) lista.unshift(deuda);
  for (const { op, actorName } of pendientesDe(bandeja, org, branch)) {
    if (op.tipo === "DEUDA") {
      if (buscar(op.clientOperationId)) continue;
      const c = op.cuerpo;
      const compra = contexto.compras.find((p) => p.id === c.purchaseId);
      lista.unshift(
        deudaNueva({
          id: op.clientOperationId,
          supplierId: c.supplierId,
          supplierName:
            contexto.proveedores.find((p) => p.id === c.supplierId)?.name ??
            "Proveedor",
          purchaseId: c.purchaseId ?? null,
          purchaseReference: compra?.reference ?? null,
          documentType: c.documentType,
          pointOfSale: c.pointOfSale,
          documentNumber: c.documentNumber,
          issuedOn: c.issuedOn,
          amountMinor: c.amountMinor,
          reference: c.reference?.trim() || null,
          notes: c.notes?.trim() || null,
          createdAt: op.occurredAt,
          createdByName: actorName ?? "",
          dues: c.dues,
        }),
      );
      continue;
    }
    const deuda = buscar(op.invoiceId);
    if (!deuda) continue;
    if (op.tipo === "PAGO") {
      if (deuda.payments.some((p) => p.id === op.cuerpo.operationId)) continue;
      const actual = presentarDeuda(deuda, hoy);
      const saldo = BigInt(actual.balanceMinor);
      const pedido = BigInt(op.cuerpo.amountMinor);
      const importe = pedido < saldo ? pedido : saldo;
      deuda.porEnviar = true;
      if (importe <= 0n) continue;
      deuda.payments.push({
        id: op.cuerpo.operationId,
        amountMinor: importe.toString(),
        paidOn: op.cuerpo.paidOn,
        method: op.cuerpo.method,
        reference: op.cuerpo.reference?.trim() || null,
        createdAt: op.occurredAt,
        createdByName: actorName ?? "",
        voidedAt: null,
        voidedByName: null,
        voidReason: null,
        allocations: repartirPago(actual.dues, importe),
        porEnviar: true,
      });
    } else {
      const pago = deuda.payments.find((p) => p.id === op.paymentId);
      deuda.porEnviar = true;
      if (!pago || pago.voidedAt) continue;
      pago.voidedAt = op.occurredAt;
      pago.voidedByName = actorName ?? "";
      pago.voidReason = op.cuerpo.reason.trim();
      pago.porEnviar = true;
    }
  }
  return lista.map((d) => presentarDeuda(d, hoy));
}

const DE_A = 10;

/** Filtra, ordena, pagina y totaliza como el listado del servidor. */
export function paginaDeDeudas(
  deudas: readonly DeudaVisible[],
  filtros: FiltrosDeudas,
  copia: Pick<CopiaDeudas, "today" | "canCreate" | "canPay">,
): InvoicePage & { items: DeudaVisible[] } {
  const buscar = (filtros.search ?? "").trim().toLocaleLowerCase("es-AR");
  const due = filtros.due ?? "ALL",
    payment = filtros.payment ?? "ALL";
  const filtradas = deudas
    .filter(
      (i) =>
        (!filtros.supplierId || i.supplierId === filtros.supplierId) &&
        (payment === "ALL" ||
          (payment === "OPEN"
            ? i.paymentStatus !== "PAID"
            : i.paymentStatus === payment)) &&
        `${i.supplierName} ${i.pointOfSale}-${i.documentNumber} ${i.reference ?? ""}`
          .toLocaleLowerCase("es-AR")
          .includes(buscar) &&
        (due === "ALL" ||
          (due === "OVERDUE" && BigInt(i.overdueMinor) > 0n) ||
          (due === "TODAY" && BigInt(i.todayMinor) > 0n) ||
          (due === "NEXT7" && BigInt(i.next7Minor) > 0n) ||
          (due === "NEXT30" && BigInt(i.next30Minor) > 0n) ||
          (due === "UNDATED" &&
            i.nextDueOn === null &&
            i.balanceMinor !== "0")),
    )
    .sort(
      (a, b) =>
        (a.nextDueOn ?? "9999-12-31").localeCompare(
          b.nextDueOn ?? "9999-12-31",
        ) ||
        b.createdAt.localeCompare(a.createdAt) ||
        a.id.localeCompare(b.id),
    );
  const pages = Math.max(1, Math.ceil(filtradas.length / DE_A));
  const page = Math.min(Math.max(1, filtros.page ?? 1), pages);
  return {
    today: copia.today,
    items: filtradas.slice((page - 1) * DE_A, page * DE_A),
    total: filtradas.length,
    page,
    pages,
    canCreate: copia.canCreate,
    canPay: copia.canPay,
    totalMinor: filtradas
      .reduce((s, i) => s + BigInt(i.balanceMinor), 0n)
      .toString(),
    overdueMinor: filtradas
      .reduce((s, i) => s + BigInt(i.overdueMinor), 0n)
      .toString(),
  };
}

type DatosPagar =
  | { tipo: "DEUDA"; cuerpo: InvoiceInput }
  | { tipo: "PAGO"; invoiceId: string; cuerpo: SupplierPaymentInput }
  | {
      tipo: "ANULAR";
      invoiceId: string;
      paymentId: string;
      cuerpo: { reason: string };
    };

/**
 * Guarda la operación en la PC, firmada por quien la hace. La deuda y el
 * pago usan su propia clave como clave de la operación: es el id que tendrán
 * en el servidor.
 */
export function guardarOperacionPagar(
  organizationId: string,
  branchId: string,
  datos: DatosPagar,
) {
  const clientOperationId =
    datos.tipo === "ANULAR" ? crypto.randomUUID() : datos.cuerpo.operationId;
  return guardarEnLaPc<OperacionPagar>(
    organizationId,
    branchId,
    "PAGAR",
    { ...datos, clientOperationId } as Omit<
      OperacionPagar,
      "occurredAt" | "deviceId"
    >,
    datos.tipo === "ANULAR" ? "0" : datos.cuerpo.amountMinor,
  );
}

/** Nombre de la operación para el panel de sincronización. */
export function operacionPagarTexto(item: VentaPendiente) {
  const tipo = operacionDe(item)?.tipo;
  return tipo === "DEUDA"
    ? "Deuda de proveedor"
    : tipo === "PAGO"
      ? "Pago a proveedor"
      : "Anulación de pago a proveedor";
}
