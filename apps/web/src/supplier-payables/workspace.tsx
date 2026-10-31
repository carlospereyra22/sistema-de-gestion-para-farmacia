import { useEffect, useState } from "react";
import {
  CalendarClock,
  Eye,
  FileText,
  Plus,
  RefreshCw,
  Search,
  WalletCards,
} from "lucide-react";
import { Pagination } from "../pagination";
import {
  ars,
  dateLabel,
  documentLabels,
  dueLabels,
  paymentLabels,
  paymentMethods,
  payableRequest,
  type Invoice,
  type InvoicePage,
  type PayableOptions,
  type PayableScope,
} from "./api";
import { InvoiceEditor } from "./invoice-editor";
import { PaymentEditor } from "./payment-editor";
import { VoidPayment } from "./void-payment";
import { field, primary, secondary, PayableDialog } from "./dialog";
const dueFilters = [
  ["ALL", "Todos los vencimientos"],
  ["OVERDUE", "Vencidas"],
  ["TODAY", "Vencen hoy"],
  ["NEXT7", "Próximos 7 días"],
  ["NEXT30", "Próximos 30 días"],
  ["UNDATED", "Sin vencimiento"],
] as const;
function DueBadge({ status }: { status: string }) {
  return (
    <span
      className={`inline-flex whitespace-nowrap rounded-full px-2 py-1 text-[11px] font-medium ${status === "OVERDUE" ? "bg-rose-50 text-rose-700" : status === "TODAY" ? "bg-amber-50 text-amber-700" : status === "SOON" ? "bg-teal-50 text-teal-700" : "bg-slate-100 text-slate-500"}`}
    >
      {dueLabels[status] ?? status}
    </span>
  );
}
export function SupplierPayablesWorkspace({
  token,
  organizationId,
  branchId,
  branchName,
  userKey,
  initialPurchaseId,
  onInitialConsumed,
  onPurchase,
}: {
  token: string;
  organizationId: string;
  branchId: string;
  branchName: string;
  userKey: string;
  initialPurchaseId?: string;
  onInitialConsumed: () => void;
  onPurchase: (id: string) => void;
}) {
  const scope: PayableScope = { token, organizationId, branchId };
  const storageKey = `payable-invoice-draft:${userKey}:${organizationId}:${branchId}`;
  const [options, setOptions] = useState<PayableOptions>(),
    [data, setData] = useState<InvoicePage>(),
    [detail, setDetail] = useState<Invoice>();
  const [paying, setPaying] = useState<Invoice>(),
    [voiding, setVoiding] = useState<string>();
  const [paymentFilter, setPaymentFilter] = useState("ALL");
  const paymentKey = (id: string) =>
    `supplier-payment:${userKey}:${organizationId}:${branchId}:${id}`;
  const [search, setSearch] = useState(""),
    [supplier, setSupplier] = useState(""),
    [due, setDue] = useState("ALL"),
    [page, setPage] = useState(1);
  const [revision, setRevision] = useState(0),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const [editing, setEditing] = useState(false),
    [related, setRelated] = useState<string>();
  const [hasDraft, setHasDraft] = useState(() =>
    Boolean(sessionStorage.getItem(storageKey)),
  );
  useEffect(() => {
    const controller = new AbortController();
    void payableRequest<PayableOptions>(
      { token, organizationId, branchId },
      "/options",
      undefined,
      controller.signal,
    )
      .then(setOptions)
      .catch((e: unknown) => {
        if (!controller.signal.aborted)
          setError(
            e instanceof Error
              ? e.message
              : "No se pudieron cargar los proveedores.",
          );
      });
    return () => controller.abort();
  }, [token, organizationId, branchId, revision]);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    const timer = window.setTimeout(() => {
      const query = new URLSearchParams({
        search,
        supplierId: supplier,
        due,
        payment: paymentFilter,
        page: String(page),
      });
      void payableRequest<InvoicePage>(
        { token, organizationId, branchId },
        `?${query}`,
        undefined,
        controller.signal,
      )
        .then((result) => {
          setData(result);
          setError("");
        })
        .catch((e: unknown) => {
          if (!controller.signal.aborted)
            setError(
              e instanceof Error
                ? e.message
                : "No se pudieron consultar las facturas.",
            );
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
        });
    }, 150);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [
    token,
    organizationId,
    branchId,
    search,
    supplier,
    due,
    paymentFilter,
    page,
    revision,
  ]);
  useEffect(() => {
    if (initialPurchaseId && options) {
      if (options.canCreate) {
        setRelated(initialPurchaseId);
        setEditing(true);
      } else setError("No tenés permiso para registrar facturas.");
      onInitialConsumed();
    }
  }, [initialPurchaseId, options, onInitialConsumed]);
  const openDetail = async (id: string) => {
    setError("");
    try {
      setDetail(await payableRequest<Invoice>(scope, `/${id}`));
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo abrir la factura.");
    }
  };
  const closeEditor = () => {
    setEditing(false);
    setRelated(undefined);
    setHasDraft(Boolean(sessionStorage.getItem(storageKey)));
  };
  const openPayment = async (id: string) => {
    try {
      const invoice = await payableRequest<Invoice>(scope, `/${id}`);
      setDetail(undefined);
      setPaying(invoice);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "No se pudo consultar el saldo.",
      );
    }
  };
  return (
    <>
      <section className="purchases-table-panel flex min-h-[420px] flex-col overflow-hidden rounded-xl border border-slate-200 bg-white">
        <header className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
          <div>
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              <FileText size={17} className="text-teal-700" />
              Cuentas por pagar
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              Facturas y vencimientos · {branchName}
            </p>
          </div>
          {data && (
            <p className="text-xs text-slate-500">
              Saldo del listado{" "}
              <strong className="ml-1 text-sm text-teal-800">
                {ars(data.totalMinor)}
              </strong>
              {BigInt(data.overdueMinor) > 0n && (
                <span className="ml-3 text-rose-600">
                  Vencido {ars(data.overdueMinor)}
                </span>
              )}
            </p>
          )}
        </header>
        <div className="grid shrink-0 items-end gap-2 border-b border-slate-100 p-3 md:grid-cols-[minmax(160px,2fr)_1fr_1fr_1fr_auto_auto]">
          <label className="text-xs text-slate-500">
            Buscar
            <div className="relative mt-1">
              <Search
                size={15}
                className="pointer-events-none absolute left-3 top-3 text-slate-400"
              />
              <input
                className={`${field} pl-9`}
                placeholder="Proveedor, número o referencia"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
              />
            </div>
          </label>
          <label className="text-xs text-slate-500">
            Proveedor
            <select
              className={`${field} mt-1`}
              value={supplier}
              onChange={(e) => {
                setSupplier(e.target.value);
                setPage(1);
              }}
            >
              <option value="">Todos</option>
              {options?.suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs text-slate-500">
            Vencimiento
            <select
              className={`${field} mt-1`}
              value={due}
              onChange={(e) => {
                setDue(e.target.value);
                setPage(1);
              }}
            >
              {dueFilters.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs text-slate-500">
            Estado
            <select
              className={`${field} mt-1`}
              value={paymentFilter}
              onChange={(e) => {
                setPaymentFilter(e.target.value);
                setPage(1);
              }}
            >
              <option value="ALL">Todos</option>
              <option value="OPEN">Con saldo pendiente</option>
              {Object.entries(paymentLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            aria-label="Actualizar facturas"
            title="Actualizar"
            className={secondary}
            onClick={() => setRevision((r) => r + 1)}
          >
            <RefreshCw size={16} />
          </button>
          {options?.canCreate && (
            <button
              type="button"
              className={primary}
              onClick={() => {
                setRelated(undefined);
                setEditing(true);
              }}
            >
              <Plus size={16} />
              {hasDraft ? "Continuar borrador" : "Registrar deuda"}
            </button>
          )}
        </div>
        {error && (
          <p
            role="alert"
            className="m-3 rounded-lg bg-rose-50 p-3 text-sm text-rose-700"
          >
            {error}
          </p>
        )}
        {notice && (
          <p role="status" className="mx-3 mt-2 text-xs text-teal-700">
            {notice}
          </p>
        )}
        <div className="min-h-0 flex-1 overflow-auto" aria-busy={loading}>
          <table className="w-full text-left text-sm">
            <thead className="sticky top-0 z-10 bg-slate-50 text-[11px] text-slate-500">
              <tr>
                {[
                  "Proveedor / Comprobante",
                  "Emisión",
                  "Vencimiento",
                  "Importe / Saldo",
                  "Estado",
                  "",
                ].map((title, index) => (
                  <th key={index} className="p-3 font-medium">
                    {title}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data?.items.map((invoice) => (
                <tr key={invoice.id} className="border-t border-slate-100">
                  <td className="p-3">
                    <p className="font-medium text-slate-800">
                      {invoice.supplierName}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      {invoice.documentNumber
                        ? documentLabels[invoice.documentType]
                        : invoice.reference || "Deuda sin comprobante"}{" "}
                      {invoice.pointOfSale ? `${invoice.pointOfSale}-` : ""}
                      {invoice.documentNumber}
                    </p>
                  </td>
                  <td className="whitespace-nowrap p-3 text-xs text-slate-500">
                    {dateLabel(invoice.issuedOn)}
                  </td>
                  <td className="p-3">
                    <p className="whitespace-nowrap text-xs">
                      {invoice.paymentStatus === "PAID"
                        ? "—"
                        : dateLabel(invoice.nextDueOn)}
                    </p>
                    {invoice.dues.length > 1 && (
                      <p className="mt-1 text-[11px] text-slate-400">
                        {invoice.dues.length} vencimientos
                      </p>
                    )}
                  </td>
                  <td className="whitespace-nowrap p-3 font-medium text-teal-800">
                    {ars(invoice.balanceMinor)}
                    {invoice.paidMinor !== "0" && (
                      <p className="mt-1 text-[11px] font-normal text-slate-400">
                        Pagado {ars(invoice.paidMinor)} de{" "}
                        {ars(invoice.amountMinor)}
                      </p>
                    )}
                    {invoice.overdueMinor !== "0" &&
                      invoice.overdueMinor !== invoice.balanceMinor && (
                        <p className="mt-1 text-[11px] font-normal text-rose-600">
                          Vencido: {ars(invoice.overdueMinor)}
                        </p>
                      )}
                  </td>
                  <td className="p-3">
                    <p className="mb-1 text-[11px] text-slate-500">
                      {paymentLabels[invoice.paymentStatus]}
                    </p>
                    <DueBadge status={invoice.dueStatus} />
                  </td>
                  <td className="p-3 text-right">
                    <div className="flex items-center justify-end gap-1 whitespace-nowrap">
                      {options?.canCreate &&
                        (invoice.balanceMinor !== "0" ||
                          sessionStorage.getItem(paymentKey(invoice.id))) && (
                          <button
                            type="button"
                            className="inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-slate-100 px-3 text-xs font-medium text-slate-700 transition-colors hover:bg-teal-50 hover:text-teal-800 focus-visible:outline-2 focus-visible:outline-teal-500"
                            onClick={() => void openPayment(invoice.id)}
                          >
                            <WalletCards size={15} aria-hidden="true" />
                            {sessionStorage.getItem(paymentKey(invoice.id))
                              ? "Verificar pago"
                              : "Registrar pago"}
                          </button>
                        )}
                      <button
                        type="button"
                        className="inline-flex h-9 items-center justify-center gap-2 rounded-lg px-3 text-xs font-medium text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800 focus-visible:outline-2 focus-visible:outline-teal-500"
                        onClick={() => void openDetail(invoice.id)}
                      >
                        <Eye size={15} aria-hidden="true" />
                        Ver detalle
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {loading && !data && (
            <p className="p-10 text-center text-sm text-slate-400">
              Consultando facturas…
            </p>
          )}
          {!loading && !data?.items.length && !error && (
            <div className="flex flex-col items-center px-4 py-12 text-center">
              <FileText size={28} className="mb-3 text-teal-300" />
              <p className="text-sm font-medium text-slate-700">
                No hay deudas para mostrar
              </p>
              <p className="mt-1 max-w-sm text-xs leading-relaxed text-slate-400">
                {search || supplier || due !== "ALL"
                  ? "Probá cambiar los filtros."
                  : "Dejá pendiente de pago al recibir mercadería o registrá una deuda independiente desde aquí."}
              </p>
            </div>
          )}
        </div>
        <div className="shrink-0 border-t border-slate-100 px-3 py-2 text-center text-[11px] text-slate-400">
          Registro administrativo · Los pagos no envían dinero ni mueven Caja.
        </div>
        <Pagination
          integrated
          total={data?.total ?? 0}
          currentPage={data?.page ?? 1}
          totalPages={data?.pages ?? 1}
          noun="facturas"
          label="Páginas de facturas de proveedores"
          onChange={setPage}
        />
      </section>
      {editing && options && (
        <InvoiceEditor
          scope={scope}
          options={options}
          storageKey={storageKey}
          initialPurchaseId={related}
          onClose={closeEditor}
          onSaved={(id) => {
            closeEditor();
            setNotice("Factura registrada. No se modificó stock ni Caja.");
            setRevision((r) => r + 1);
            void openDetail(id);
          }}
        />
      )}
      {paying && options && (
        <PaymentEditor
          key={paying.id}
          invoice={paying}
          scope={scope}
          today={options.today}
          storageKey={paymentKey(paying.id)}
          onClose={() => setPaying(undefined)}
          onSaved={() => {
            setPaying(undefined);
            setRevision((r) => r + 1);
            setNotice("Pago registrado. No se modificó Caja ni stock.");
          }}
        />
      )}
      {detail && voiding && (
        <VoidPayment
          invoice={detail}
          paymentId={voiding}
          scope={scope}
          onClose={() => setVoiding(undefined)}
          onSaved={() => {
            setVoiding(undefined);
            setRevision((r) => r + 1);
            void openDetail(detail.id);
          }}
        />
      )}
      {detail && !voiding && (
        <PayableDialog
          title={
            detail.documentNumber
              ? `${documentLabels[detail.documentType]} ${detail.pointOfSale ? detail.pointOfSale + "-" : ""}${detail.documentNumber}`
              : "Detalle de deuda"
          }
          onClose={() => setDetail(undefined)}
        >
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="font-semibold">{detail.supplierName}</h3>
              <p className="mt-1 text-xs text-slate-500">
                Emisión {dateLabel(detail.issuedOn)} · {branchName}
              </p>
            </div>
            <DueBadge status={detail.dueStatus} />
          </div>
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-teal-100 bg-teal-50/50 p-4">
            <div>
              <p className="text-xs text-teal-700">Saldo pendiente</p>
              <p className="mt-1 text-xl font-semibold text-teal-800">
                {ars(detail.balanceMinor)}
              </p>
            </div>
            <p className="text-xs text-slate-500">
              Importe original {ars(detail.amountMinor)}
            </p>
            {options?.canCreate &&
              (detail.balanceMinor !== "0" ||
                sessionStorage.getItem(paymentKey(detail.id))) && (
                <button
                  className={primary}
                  onClick={() => void openPayment(detail.id)}
                >
                  {sessionStorage.getItem(paymentKey(detail.id))
                    ? "Verificar pago"
                    : "Registrar pago"}
                </button>
              )}
          </div>
          <h3 className="mb-2 flex items-center gap-2 text-sm font-medium">
            <CalendarClock size={16} className="text-teal-600" />
            Vencimientos
          </h3>
          <div className="overflow-auto rounded-xl border border-slate-200">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs text-slate-500">
                <tr>
                  <th className="p-3">Fecha</th>
                  <th className="p-3 text-right">Importe pendiente</th>
                </tr>
              </thead>
              <tbody>
                {detail.dues.map((d) => (
                  <tr key={d.id} className="border-t border-slate-100">
                    <td className="p-3">{dateLabel(d.dueOn)}</td>
                    <td className="p-3 text-right font-medium">
                      {ars(d.balanceMinor)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <section className="mt-5">
            <h3 className="mb-2 text-sm font-semibold">Historial de pagos</h3>
            {!detail.payments.length ? (
              <p className="text-xs text-slate-400">
                Todavía no se registraron pagos.
              </p>
            ) : (
              <div className="divide-y divide-slate-100 rounded-xl border border-slate-200">
                {detail.payments.map((p) => (
                  <div key={p.id} className="p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span
                        className={`text-sm font-medium ${p.voidedAt ? "text-slate-400 line-through" : "text-teal-800"}`}
                      >
                        {ars(p.amountMinor)}
                      </span>
                      <span className="text-xs text-slate-500">
                        {dateLabel(p.paidOn)} · {paymentMethods[p.method]}
                      </span>
                      {options?.canCreate && !p.voidedAt && (
                        <button
                          className="text-xs text-slate-400 hover:text-rose-600"
                          onClick={() => setVoiding(p.id)}
                        >
                          Anular pago
                        </button>
                      )}
                    </div>
                    <p className="mt-1 text-xs text-slate-400">
                      {p.createdByName}
                      {p.reference ? ` · ${p.reference}` : ""}
                    </p>
                    {p.voidedAt && (
                      <p className="mt-1 text-xs text-rose-600">
                        Anulado por {p.voidedByName}: {p.voidReason}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>
          {detail.purchaseId && (
            <div className="mt-4 rounded-xl border border-slate-200 p-3 text-xs text-slate-500">
              <button
                type="button"
                className="font-medium text-teal-700 underline underline-offset-2"
                onClick={() => {
                  const id = detail.purchaseId!;
                  setDetail(undefined);
                  onPurchase(id);
                }}
              >
                Ver compra{" "}
                {detail.purchaseReference ||
                  detail.purchaseId.slice(0, 8).toUpperCase()}
              </button>
              <p className="mt-1">
                {detail.receiptId
                  ? "Importe de esta entrega"
                  : "Estimado del pedido"}
                : {ars(detail.purchaseEstimatedMinor ?? "0")}
              </p>
              {detail.differenceMinor !== "0" && detail.differenceMinor && (
                <p className="mt-1 text-amber-700">
                  Diferencia con el comprobante: {ars(detail.differenceMinor)}.
                  El pedido conserva sus importes.
                </p>
              )}
            </div>
          )}
          {(detail.reference || detail.notes) && (
            <div className="mt-4 space-y-1 text-sm text-slate-600">
              {detail.reference && <p>Referencia: {detail.reference}</p>}
              {detail.notes && <p>{detail.notes}</p>}
            </div>
          )}
          <p className="mt-5 text-xs text-slate-400">
            Registrada por {detail.createdByName} ·{" "}
            {new Date(detail.createdAt).toLocaleString("es-AR", {
              timeZone: "America/Argentina/Buenos_Aires",
            })}
          </p>
          <footer className="mt-4 flex items-center justify-between gap-3 border-t border-slate-100 pt-4">
            <p className="text-xs text-slate-400">No modifica stock ni Caja.</p>
            <button
              type="button"
              className={secondary}
              onClick={() => setDetail(undefined)}
            >
              Cerrar
            </button>
          </footer>
        </PayableDialog>
      )}
    </>
  );
}
