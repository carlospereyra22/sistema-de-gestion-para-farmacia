import { useEffect, useState } from "react";
import {
  CalendarClock,
  CalendarDays,
  Eye,
  FileText,
  Plus,
  RefreshCw,
  Search,
  Tag,
  Truck,
  WalletCards,
} from "lucide-react";
import { Pagination } from "../pagination";
import { ProductFilterSelect } from "../product-filter-select";
import { StatusToast } from "../status-toast";
import {
  ars,
  dateLabel,
  documentLabels,
  dueLabels,
  paymentLabels,
  paymentMethods,
  getPayableDetail,
  getPayableOptions,
  getPayablePage,
  type Invoice,
  type InvoicePage,
  type PayableOptions,
  type PayableScope,
} from "./api";
import { InvoiceEditor } from "./invoice-editor";
import { PaymentEditor } from "./payment-editor";
import { VoidPayment } from "./void-payment";
import { primary, secondary, PayableDialog } from "./dialog";
import { suscribirBandeja } from "../lib/bandeja-ventas";
import type { DondeQuedo } from "../lib/api";

/** Aviso de lo que quedó en la PC sin conexión (SISTEMA-73). */
const EN_LA_PC =
  "Guardado sin conexión: se envía solo cuando vuelva internet, con la hora en que lo hiciste.";

function PorEnviar() {
  return (
    <span className="ml-2 inline-flex whitespace-nowrap rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
      Por enviar
    </span>
  );
}
const dueFilters = [
  ["ALL", "Todos"],
  ["OVERDUE", "Vencidas"],
  ["TODAY", "Vencen hoy"],
  ["NEXT7", "Próximos 7 días"],
  ["NEXT30", "Próximos 30 días"],
  ["UNDATED", "Sin vencimiento"],
] as const;
function DueBadge({ status }: { status: string }) {
  return (
    <span
      className={`inline-flex whitespace-nowrap rounded-full px-2.5 py-1 text-sm font-medium ${status === "OVERDUE" ? "bg-rose-50 text-rose-700" : status === "TODAY" ? "bg-amber-50 text-amber-700" : status === "SOON" ? "bg-teal-50 text-teal-700" : "bg-slate-100 text-slate-500"}`}
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
  // Lo hecho sin conexión cambia la vista: al guardarse o al enviarse.
  useEffect(() => suscribirBandeja(() => setRevision((r) => r + 1)), []);
  useEffect(() => {
    const controller = new AbortController();
    void getPayableOptions(
      { token, organizationId, branchId },
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
      void getPayablePage(
        { token, organizationId, branchId },
        { search, supplierId: supplier, due, payment: paymentFilter, page },
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
      setDetail(await getPayableDetail(scope, id));
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
      const invoice = await getPayableDetail(scope, id);
      setDetail(undefined);
      setPaying(invoice);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "No se pudo consultar el saldo.",
      );
    }
  };
  const toast = notice ? (
    <StatusToast message={notice} onClose={() => setNotice("")} />
  ) : null;
  return (
    <>
      {!detail && toast}
      <section className="purchases-table-panel flex min-h-[420px] flex-col overflow-hidden rounded-xl border border-slate-200 bg-white">
        <header className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-semibold">
              <FileText size={20} className="text-teal-700" />
              Cuentas por pagar
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Facturas y vencimientos · {branchName}
            </p>
          </div>
          {data && (
            <p className="text-sm text-slate-500">
              Saldo del listado{" "}
              <strong className="ml-1 text-lg text-teal-800">
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
        <div className="grid shrink-0 items-center gap-2 border-b border-slate-100 p-3 sm:grid-cols-2 xl:grid-cols-[minmax(220px,2fr)_1fr_1fr_1fr_auto_auto]">
          <label className="relative block min-w-0">
            <Search
              size={16}
              className="pointer-events-none absolute left-3 top-4 text-slate-400"
            />
            <input
              aria-label="Buscar facturas"
              className="h-12 w-full min-w-0 rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-base shadow-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-50"
              placeholder="Proveedor, número o referencia"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
            />
          </label>
          <ProductFilterSelect
            label="Proveedor"
            icon={<Truck size={18} />}
            value={supplier}
            options={[
              { value: "", label: "Todos" },
              ...(options?.suppliers.map((s) => ({
                value: s.id,
                label: s.name,
              })) ?? []),
            ]}
            onChange={(value) => {
              setSupplier(value);
              setPage(1);
            }}
          />
          <ProductFilterSelect
            label="Vencimiento"
            icon={<CalendarDays size={18} />}
            value={due}
            options={dueFilters.map(([value, label]) => ({ value, label }))}
            onChange={(value) => {
              setDue(value);
              setPage(1);
            }}
          />
          <ProductFilterSelect
            label="Estado"
            icon={<Tag size={18} />}
            value={paymentFilter}
            options={[
              { value: "ALL", label: "Todos" },
              { value: "OPEN", label: "Con saldo pendiente" },
              ...Object.entries(paymentLabels).map(([value, label]) => ({
                value,
                label,
              })),
            ]}
            onChange={(value) => {
              setPaymentFilter(value);
              setPage(1);
            }}
          />
          <button
            type="button"
            aria-label="Actualizar facturas"
            title="Actualizar"
            className={`${secondary} h-12! w-12`}
            onClick={() => setRevision((r) => r + 1)}
          >
            <RefreshCw size={16} />
          </button>
          {options?.canCreate && (
            <button
              type="button"
              className={`${primary} h-12!`}
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
        <div className="min-h-0 flex-1 overflow-auto" aria-busy={loading}>
          <table className="w-full min-w-[1000px] text-left text-base">
            <thead className="sticky top-0 z-10 bg-slate-50 text-sm text-slate-500">
              <tr>
                {[
                  "Proveedor / Comprobante",
                  "Emisión",
                  "Vencimiento",
                  "Importe / Saldo",
                  "Estado",
                  "Acciones",
                ].map((title) => (
                  <th
                    key={title}
                    className={`whitespace-nowrap px-5 py-3 font-medium ${title === "Acciones" ? "w-px text-center" : ""}`}
                  >
                    {title}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data?.items.map((invoice) => (
                <tr key={invoice.id} className="border-t border-slate-100">
                  <td className="px-5 py-2.5">
                    <p className="font-semibold text-slate-800">
                      {invoice.supplierName}
                      {invoice.porEnviar && <PorEnviar />}
                    </p>
                    <p className="mt-1 text-sm text-slate-500">
                      {invoice.documentNumber
                        ? documentLabels[invoice.documentType]
                        : invoice.reference || "Deuda sin comprobante"}{" "}
                      {invoice.pointOfSale ? `${invoice.pointOfSale}-` : ""}
                      {invoice.documentNumber}
                    </p>
                  </td>
                  <td className="whitespace-nowrap px-5 py-2.5 text-sm text-slate-500">
                    {dateLabel(invoice.issuedOn)}
                  </td>
                  <td className="px-5 py-2.5">
                    <p className="whitespace-nowrap text-sm">
                      {invoice.paymentStatus === "PAID"
                        ? "—"
                        : dateLabel(invoice.nextDueOn)}
                    </p>
                    {invoice.dues.length > 1 && (
                      <p className="mt-1 whitespace-nowrap text-sm text-slate-400">
                        {invoice.dues.length} vencimientos
                      </p>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-5 py-2.5 font-medium text-teal-800">
                    {ars(invoice.balanceMinor)}
                    {invoice.paidMinor !== "0" && (
                      <p className="mt-1 whitespace-normal text-sm font-normal text-slate-400">
                        Pagado {ars(invoice.paidMinor)} de{" "}
                        {ars(invoice.amountMinor)}
                      </p>
                    )}
                    {invoice.overdueMinor !== "0" &&
                      invoice.overdueMinor !== invoice.balanceMinor && (
                        <p className="mt-1 text-sm font-normal text-rose-600">
                          Vencido: {ars(invoice.overdueMinor)}
                        </p>
                      )}
                  </td>
                  <td className="px-5 py-2.5">
                    <p className="mb-1 whitespace-nowrap text-sm text-slate-500">
                      {paymentLabels[invoice.paymentStatus]}
                    </p>
                    <DueBadge status={invoice.dueStatus} />
                  </td>
                  <td className="px-5 py-2.5 text-right">
                    <div className="flex items-center justify-end gap-1 whitespace-nowrap">
                      {options?.canPay &&
                        (invoice.balanceMinor !== "0" ||
                          sessionStorage.getItem(paymentKey(invoice.id))) && (
                          <button
                            type="button"
                            className="inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-slate-100 px-3 text-sm font-medium text-slate-700 transition-colors hover:bg-teal-50 hover:text-teal-800 focus-visible:outline-2 focus-visible:outline-teal-500"
                            onClick={() => void openPayment(invoice.id)}
                          >
                            <WalletCards size={16} aria-hidden="true" />
                            {sessionStorage.getItem(paymentKey(invoice.id))
                              ? "Verificar pago"
                              : "Registrar pago"}
                          </button>
                        )}
                      <button
                        type="button"
                        className="inline-flex h-9 items-center justify-center gap-2 rounded-lg px-3 text-sm font-medium text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800 focus-visible:outline-2 focus-visible:outline-teal-500"
                        onClick={() => void openDetail(invoice.id)}
                      >
                        <Eye size={16} aria-hidden="true" />
                        Ver detalle
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {loading && !data && (
            <p className="p-10 text-center text-base text-slate-400">
              Consultando facturas…
            </p>
          )}
          {!loading && !data?.items.length && !error && (
            <div className="flex flex-col items-center px-4 py-12 text-center">
              <FileText size={28} className="mb-3 text-teal-300" />
              <p className="text-base font-medium text-slate-700">
                No hay deudas para mostrar
              </p>
              <p className="mt-1 max-w-sm text-sm leading-relaxed text-slate-400">
                {search || supplier || due !== "ALL"
                  ? "Probá cambiar los filtros."
                  : "Dejá pendiente de pago al recibir mercadería o registrá una deuda independiente desde aquí."}
              </p>
            </div>
          )}
        </div>
        <div className="shrink-0 border-t border-slate-100 px-3 py-2 text-center text-sm text-slate-400">
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
          onSaved={(id, donde: DondeQuedo) => {
            closeEditor();
            setNotice(
              donde === "PC"
                ? EN_LA_PC
                : "Factura registrada. No se modificó stock ni Caja.",
            );
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
          onSaved={(donde: DondeQuedo) => {
            setPaying(undefined);
            setRevision((r) => r + 1);
            setNotice(
              donde === "PC"
                ? EN_LA_PC
                : "Pago registrado. No se modificó Caja ni stock.",
            );
          }}
        />
      )}
      {detail && voiding && (
        <VoidPayment
          invoice={detail}
          paymentId={voiding}
          scope={scope}
          onClose={() => setVoiding(undefined)}
          onSaved={(donde: DondeQuedo) => {
            setVoiding(undefined);
            setRevision((r) => r + 1);
            if (donde === "PC") setNotice(EN_LA_PC);
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
          {toast}
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="font-semibold">
                {detail.supplierName}
                {detail.porEnviar && <PorEnviar />}
              </h3>
              <p className="mt-1 text-sm text-slate-500">
                Emisión {dateLabel(detail.issuedOn)} · {branchName}
              </p>
            </div>
            <DueBadge status={detail.dueStatus} />
          </div>
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-teal-100 bg-teal-50/50 p-4">
            <div>
              <p className="text-sm text-teal-700">Saldo pendiente</p>
              <p className="mt-1 text-xl font-semibold text-teal-800">
                {ars(detail.balanceMinor)}
              </p>
            </div>
            <p className="text-sm text-slate-500">
              Importe original {ars(detail.amountMinor)}
            </p>
            {options?.canPay &&
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
          <h3 className="mb-2 flex items-center gap-2 text-base font-medium">
            <CalendarClock size={16} className="text-teal-600" />
            Vencimientos
          </h3>
          <div className="overflow-auto rounded-xl border border-slate-200">
            <table className="w-full text-base">
              <thead className="bg-slate-50 text-left text-sm text-slate-500">
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
            <h3 className="mb-2 text-base font-semibold">Historial de pagos</h3>
            {!detail.payments.length ? (
              <p className="text-sm text-slate-400">
                Todavía no se registraron pagos.
              </p>
            ) : (
              <div className="divide-y divide-slate-100 rounded-xl border border-slate-200">
                {detail.payments.map((p) => (
                  <div key={p.id} className="p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span
                        className={`text-base font-medium ${p.voidedAt ? "text-slate-400 line-through" : "text-teal-800"}`}
                      >
                        {ars(p.amountMinor)}
                        {p.porEnviar && <PorEnviar />}
                      </span>
                      <span className="text-sm text-slate-500">
                        {dateLabel(p.paidOn)} · {paymentMethods[p.method]}
                      </span>
                      {options?.canPay && !p.voidedAt && (
                        <button
                          className="text-sm text-slate-400 hover:text-rose-600"
                          onClick={() => setVoiding(p.id)}
                        >
                          Anular pago
                        </button>
                      )}
                    </div>
                    <p className="mt-1 text-sm text-slate-400">
                      {p.createdByName}
                      {p.reference ? ` · ${p.reference}` : ""}
                    </p>
                    {p.voidedAt && (
                      <p className="mt-1 text-sm text-rose-600">
                        Anulado por {p.voidedByName}: {p.voidReason}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>
          {detail.purchaseId && (
            <div className="mt-4 rounded-xl border border-slate-200 p-3 text-sm text-slate-500">
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
            <div className="mt-4 space-y-1 text-base text-slate-600">
              {detail.reference && <p>Referencia: {detail.reference}</p>}
              {detail.notes && <p>{detail.notes}</p>}
            </div>
          )}
          <p className="mt-5 text-sm text-slate-400">
            Registrada por {detail.createdByName} ·{" "}
            {new Date(detail.createdAt).toLocaleString("es-AR", {
              timeZone: "America/Argentina/Buenos_Aires",
            })}
          </p>
          <footer className="mt-4 flex items-center justify-between gap-3 border-t border-slate-100 pt-4">
            <p className="text-sm text-slate-400">No modifica stock ni Caja.</p>
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
