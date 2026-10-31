import { useEffect, useRef, useState } from "react";
import { ReceiptText, X, CircleDollarSign } from "lucide-react";
import { getDueSaleDetail, type DueSaleDetail } from "./lib/account-due-sale";
import { AccountSaleTimeline } from "./account-sale-timeline";
import { AccountSaleArticles } from "./account-sale-articles";
import { accountInitials } from "./lib/account-initials";

const money = (value: string) =>
  (Number(value) / 100).toLocaleString("es-AR", {
    style: "currency",
    currency: "ARS",
  });
const date = (value: string | null, time = false) =>
  value
    ? new Date(
        value.length === 10 ? `${value}T12:00:00Z` : value,
      ).toLocaleString("es-AR", {
        timeZone: "America/Argentina/Buenos_Aires",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        ...(time ? ({ hour: "2-digit", minute: "2-digit" } as const) : {}),
      })
    : "Sin fecha";
const method = (value: string | null) =>
  value === "CASH"
    ? "Pago en efectivo"
    : value === "TRANSFER"
      ? "Transferencia bancaria"
      : value === "CARD"
        ? "Pago con tarjeta"
        : value === "OTHER"
          ? "Pago combinado"
          : "Pago registrado";
export function AccountDueSalePanel({
  token,
  organizationId,
  branchId,
  saleId,
  revision,
  reveal = true,
  onClose,
  onCollect,
}: {
  token: string;
  organizationId: string;
  branchId: string;
  saleId: string;
  revision: number;
  reveal?: boolean;
  onClose: () => void;
  onCollect: (customerId: string, saleId: string) => void;
}) {
  const [data, setData] = useState<DueSaleDetail>();
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [tab, setTab] = useState("detail");
  const requestToken = useRef(token);
  useEffect(() => {
    requestToken.current = token;
  }, [token]);
  const canCollect = Boolean(
    data &&
    !error &&
    data.pendingMinor !== null &&
    BigInt(data.pendingMinor) > 0n &&
    data.status !== "CANCELLED",
  );
  const panel = useRef<HTMLElement>(null);
  useEffect(() => {
    if (reveal && window.matchMedia("(max-width: 1099px)").matches)
      panel.current?.scrollIntoView({ block: "start", behavior: "smooth" });
  }, [saleId, reveal]);
  useEffect(() => {
    let active = true;
    setRefreshing(true);
    setError("");
    void getDueSaleDetail(
      requestToken.current,
      organizationId,
      branchId,
      saleId,
    )
      .then((result) => {
        if (active)
          setData((current) =>
            JSON.stringify(current) === JSON.stringify(result)
              ? current
              : result,
          );
      })
      .catch((cause: unknown) => {
        if (active)
          setError(
            cause instanceof Error
              ? cause.message
              : "No se pudo cargar la venta.",
          );
      })
      .finally(() => {
        if (active) setRefreshing(false);
      });
    return () => {
      active = false;
    };
  }, [organizationId, branchId, saleId, revision, retry]);
  return (
    <aside
      ref={panel}
      aria-label="Detalle de la venta seleccionada"
      className="account-due-sale-panel flex min-w-0 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"
    >
      <header className="flex shrink-0 items-start gap-3 p-4">
        <span className="rounded-xl bg-blue-50 p-2.5 text-blue-600">
          <ReceiptText size={22} />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="font-semibold text-slate-800">
            Venta {saleId.slice(0, 8).toUpperCase()}
          </h2>
          <p className="mt-1 text-[11px] text-slate-500">
            Comprobante · {data?.branchName ?? "Consultando venta"}
          </p>
        </div>
        <button
          type="button"
          aria-label="Cerrar detalle de venta"
          onClick={onClose}
          className="rounded-lg p-2 text-slate-400 hover:bg-slate-50"
        >
          <X size={18} />
        </button>
      </header>
      {error && (
        <div role="alert" className="p-4 text-sm text-rose-700">
          {error}
          <button
            type="button"
            onClick={() => setRetry((v) => v + 1)}
            className="ml-2 underline"
          >
            Reintentar
          </button>
        </div>
      )}
      {!data ? (
        <p role="status" className="p-8 text-center text-sm text-slate-500">
          Cargando venta…
        </p>
      ) : (
        <>
          <div className="flex shrink-0 items-center gap-3 px-4 pb-4">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-teal-100 font-semibold text-teal-700">
              {accountInitials(data.customer.name)}
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <strong className="text-slate-800">{data.customer.name}</strong>
                <span className="rounded-full bg-teal-50 px-2 py-1 text-[10px] text-teal-700">
                  {data.customer.creditEnabled
                    ? "Crédito habilitado"
                    : "Sin crédito"}
                </span>
              </div>
              <p className="mt-1 text-[10px] leading-5 text-slate-500">
                DNI/CUIT:{" "}
                {data.customer.document ||
                  data.customer.billingTaxId ||
                  "Sin informar"}{" "}
                · Tel.: {data.customer.billingPhone || "Sin informar"}
              </p>
            </div>
          </div>
          <div
            role="tablist"
            aria-label="Información de la venta"
            className="flex shrink-0 border-b border-slate-200 px-3"
          >
            {[
              ["detail", "Detalle"],
              ["items", `Artículos (${data.items.length})`],
              ["payments", `Pagos (${data.payments.length})`],
              ["history", "Historial"],
            ].map(([id, label]) => (
              <button
                key={id}
                id={`sale-tab-${id}`}
                role="tab"
                aria-selected={tab === id}
                tabIndex={tab === id ? 0 : -1}
                onKeyDown={(event) => {
                  const tabs = ["detail", "items", "payments", "history"];
                  const index = tabs.indexOf(id);
                  const next =
                    event.key === "ArrowRight"
                      ? tabs[(index + 1) % 4]
                      : event.key === "ArrowLeft"
                        ? tabs[(index + 3) % 4]
                        : event.key === "Home"
                          ? tabs[0]
                          : event.key === "End"
                            ? tabs[3]
                            : undefined;
                  if (next) {
                    event.preventDefault();
                    setTab(next);
                    document.getElementById(`sale-tab-${next}`)?.focus();
                  }
                }}
                aria-controls={`sale-panel-${id}`}
                type="button"
                onClick={() => setTab(id)}
                className={`flex-1 border-b-2 px-1 py-3 text-xs ${tab === id ? "border-teal-600 font-semibold text-teal-700" : "border-transparent text-slate-500"}`}
              >
                {label}
              </button>
            ))}
          </div>
          <div
            role="tabpanel"
            id={`sale-panel-${tab}`}
            aria-labelledby={`sale-tab-${tab}`}
            className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4"
          >
            {data.reviewReason && (
              <p className="rounded-lg bg-amber-50 p-3 text-xs leading-5 text-amber-800">
                {data.reviewReason} Revisá las asignaciones desde Clientes antes
                de cobrar.
              </p>
            )}
            {tab === "detail" && (
              <>
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold">Resumen de la venta</h3>
                  <span
                    className={`rounded-full px-2 py-1 text-[10px] ${data.status === "OVERDUE" ? "bg-rose-50 text-rose-600" : "bg-slate-100 text-slate-500"}`}
                  >
                    {data.status === "OVERDUE"
                      ? "Vencida"
                      : data.status === "PAID"
                        ? "Saldada"
                        : data.status === "TODAY"
                          ? "Vence hoy"
                          : data.status === "UPCOMING"
                            ? "En término"
                            : data.status === "REVIEW"
                              ? "Por revisar"
                              : data.status === "CANCELLED"
                                ? "Anulada"
                                : "Sin vencimiento"}
                  </span>
                </div>
                <dl className="grid grid-cols-3 gap-2">
                  {[
                    ["Fecha de venta", date(data.saleDate)],
                    ["Vencimiento", date(data.dueDate)],
                    [
                      "Días de atraso",
                      data.dueDate ? `${data.daysOverdue} días` : "—",
                    ],
                  ].map(([label, value]) => (
                    <div
                      key={label}
                      className="rounded-lg border border-slate-200 p-2"
                    >
                      <dt className="text-[10px] text-slate-500">{label}</dt>
                      <dd className="mt-1 text-xs font-medium">{value}</dd>
                    </div>
                  ))}
                </dl>
                <Totals data={data} />
                <h3 className="pt-2 text-sm font-semibold">
                  Información adicional
                </h3>
                <dl className="divide-y divide-slate-100 rounded-lg border border-slate-200 px-3">
                  {[
                    ["N.º de comprobante", data.id.slice(0, 8).toUpperCase()],
                    ["Sucursal", data.branchName],
                    ["Vendedor", data.seller ?? "Sin informar"],
                    [
                      "Estado de cobro",
                      data.status === "CANCELLED"
                        ? "Anulada"
                        : data.pendingMinor === null
                          ? "Por conciliar"
                          : data.pendingMinor === "0"
                            ? "Saldada"
                            : BigInt(data.paidMinor) > 0n
                              ? "Parcial"
                              : "Pendiente",
                    ],
                  ].map(([label, value]) => (
                    <div
                      key={label}
                      className="flex justify-between gap-3 py-3 text-xs"
                    >
                      <dt className="text-slate-500">{label}</dt>
                      <dd className="text-right font-medium">{value}</dd>
                    </div>
                  ))}
                </dl>
              </>
            )}
            {tab === "items" && <AccountSaleArticles data={data} />}
            {tab === "payments" && (
              <>
                <h3 className="text-sm font-semibold">
                  Pagos aplicados a esta venta
                </h3>
                {data.payments.length ? (
                  data.payments.map((payment) => (
                    <article
                      key={payment.id}
                      className="flex items-start gap-3 rounded-xl border border-slate-200 p-3"
                    >
                      <span className="rounded-full bg-teal-50 p-2 text-teal-700">
                        <CircleDollarSign size={18} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap justify-between gap-2 text-xs">
                          <strong>{method(payment.method)}</strong>
                          <strong className="text-teal-700">
                            {money(payment.amountMinor)}
                          </strong>
                        </div>
                        <p className="mt-2 text-[10px] text-slate-500">
                          {date(payment.at, true)} ·{" "}
                          {payment.actor ?? "Usuario sin informar"}
                        </p>
                        {payment.note && (
                          <p className="mt-1 break-words text-[11px] text-slate-500">
                            {payment.note}
                          </p>
                        )}
                        {payment.shared && (
                          <p className="mt-1 text-[10px] text-teal-700">
                            Importe de este recibo aplicado a esta venta.
                          </p>
                        )}
                      </div>
                    </article>
                  ))
                ) : (
                  <p className="py-6 text-center text-sm text-slate-500">
                    No hay pagos asignados a esta venta.
                  </p>
                )}
                <Totals data={data} />
              </>
            )}
            {tab === "history" && <AccountSaleTimeline data={data} />}
          </div>
          <footer className="shrink-0 border-t border-slate-100 p-4">
            <button
              type="button"
              disabled={refreshing || !canCollect}
              aria-busy={refreshing}
              onClick={() => onCollect(data.customer.id, data.id)}
              className={`account-due-collect flex w-full items-center justify-center gap-2 rounded-lg bg-teal-700 px-4 py-3 text-sm font-semibold text-white ${canCollect ? "" : "opacity-40"}`}
            >
              <CircleDollarSign size={17} />
              Cobrar saldo pendiente
            </button>
          </footer>
        </>
      )}
    </aside>
  );
}
function Totals({ data }: { data: DueSaleDetail }) {
  return (
    <div className="space-y-2">
      <dl className="grid grid-cols-2 rounded-lg bg-slate-50 p-3 text-xs">
        <div>
          <dt className="text-slate-500">Total original</dt>
          <dd className="mt-1 font-semibold">{money(data.totalMinor)}</dd>
        </div>
        <div className="border-l border-slate-200 pl-3">
          <dt className="text-slate-500">Pagos aplicados</dt>
          <dd className="mt-1 font-semibold">{money(data.paidMinor)}</dd>
        </div>
      </dl>
      <div className="flex items-center justify-between gap-2 rounded-lg border border-rose-100 bg-rose-50 p-3 text-rose-600">
        <span className="text-xs font-medium">Saldo pendiente</span>
        <strong className="text-base">
          {data.pendingMinor === null
            ? "Por conciliar"
            : money(data.pendingMinor)}
        </strong>
      </div>
    </div>
  );
}
