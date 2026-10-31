import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { CalendarClock, RefreshCw, Search } from "lucide-react";
import { Pagination } from "./pagination";
import {
  AccountDueFilters,
  AccountDueActiveFilters,
} from "./account-due-filters";
import { AccountDueSalePanel } from "./account-due-sale-panel";
import { AccountDueOverview } from "./account-due-overview";
import { SearchableSaleSelect } from "./searchable-sale-select";
import {
  preferredDueSale,
  matchesDuePeriod,
} from "./lib/account-due-presentation";
import { accountInitials } from "./lib/account-initials";
import {
  getAccountDueDates,
  matchesDueFilters,
  scopeDueRows,
  type AccountDueDates as DueData,
  type DueFilter,
} from "./lib/account-due-dates";

const money = (minor: string) =>
  (Number(minor) / 100).toLocaleString("es-AR", {
    style: "currency",
    currency: "ARS",
  });
const date = (value: string) => value.split("-").reverse().join("/");
export function AccountDueDates({
  token,
  organizationId,
  branchId,
  customerId,
  onCustomer,
  revision = 0,
  active = true,
}: {
  token: string;
  organizationId: string;
  branchId: string;
  customerId?: string;
  revision?: number;
  active?: boolean;
  onCustomer: (id: string, saleId: string) => void;
}) {
  const [selection, setSelectedSale] = useState<string | null>(null);
  const workspace = useRef<HTMLDivElement>(null);
  const lastFetch = useRef(0);
  const requestToken = useRef(token);
  useEffect(() => {
    requestToken.current = token;
  }, [token]);
  useLayoutEffect(() => {
    const element = workspace.current;
    if (!element || !active) return;
    let frame = 0;
    const applyHeight = () =>
      element.style.setProperty(
        "--due-height",
        `${Math.max(320, window.innerHeight - Math.max(0, element.getBoundingClientRect().top) - 32)}px`,
      );
    const measure = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(applyHeight);
    };
    applyHeight();
    const observer = new ResizeObserver(measure);
    if (element.parentElement) observer.observe(element.parentElement);
    window.addEventListener("resize", measure);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [active]);
  const [period, setPeriod] = useState("all");
  const [status, setStatus] = useState("ALL");
  const [clientFilter, setClientFilter] = useState("");
  const [data, setData] = useState<DueData>();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [version, setVersion] = useState(0);
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState<DueFilter[]>([]);
  const changeFilters = (next: DueFilter[]) => {
    setFilters(next);
    setPage(1);
  };
  const [page, setPage] = useState(1);
  useEffect(() => {
    let active = true;
    setLoading(true);
    lastFetch.current = Date.now();
    setError("");
    void getAccountDueDates(requestToken.current, organizationId, branchId)
      .then((result) => {
        if (active) setData(result);
      })
      .catch((cause: unknown) => {
        if (active) {
          setError(
            cause instanceof Error
              ? cause.message
              : "No se pudieron cargar los vencimientos.",
          );
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [organizationId, branchId, version, revision]);
  useEffect(() => {
    if (!active) return;
    const refresh = () => {
      if (
        document.visibilityState === "visible" &&
        Date.now() - lastFetch.current >= 30000
      )
        setVersion((value) => value + 1);
    };
    refresh();
    const timer = window.setInterval(refresh, 60000);
    window.addEventListener("focus", refresh);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", refresh);
    };
  }, [active]);
  const rows = scopeDueRows(data?.rows ?? [], customerId);
  const normalize = (text: string) =>
    text
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();
  const searched = rows.filter((row) =>
    normalize(`${row.customerName} ${row.saleId}`).includes(
      normalize(query.trim()),
    ),
  );
  const filtered = searched.filter(
    (row) =>
      matchesDueFilters(row, filters) &&
      (status === "ALL" || row.status === status) &&
      matchesDuePeriod(row, period, data?.today) &&
      (!clientFilter || row.customerId === clientFilter),
  );
  const selectedSale = customerId
    ? null
    : (selection ?? preferredDueSale(filtered));
  const pages = Math.max(1, Math.ceil(filtered.length / 10));
  const current = Math.min(page, pages);
  return (
    <div
      ref={workspace}
      data-split={!customerId}
      className="account-due-workspace grid items-start gap-4"
    >
      <div className="account-due-main min-w-0 space-y-4">
        {data && !customerId && (
          <div className="min-w-0">
            <AccountDueOverview rows={rows} />
          </div>
        )}
        <section
          data-due-list
          className={
            customerId
              ? "min-w-0"
              : "min-w-0 rounded-xl border border-slate-200 bg-white shadow-sm"
          }
          aria-label="Vencimientos de cuenta corriente"
        >
          {data && customerId && <AccountDueOverview rows={rows} compact />}
          <div
            className={`account-due-list-body space-y-3 ${customerId ? "pt-4" : "p-4"}`}
          >
            <div
              className="account-due-toolbar flex flex-wrap items-end gap-2"
              aria-label="Buscar y filtrar vencimientos"
            >
              <label className="relative min-w-[160px] flex-1 sm:basis-52">
                <Search
                  size={15}
                  className="absolute left-3 top-3 text-slate-400"
                />
                <input
                  aria-label={
                    customerId ? "Buscar venta" : "Buscar cliente o venta"
                  }
                  placeholder={
                    customerId ? "Buscar venta…" : "Buscar cliente o venta…"
                  }
                  value={query}
                  onChange={(event) => {
                    setQuery(event.target.value);
                    setPage(1);
                  }}
                  className="h-10 w-full rounded-lg border border-slate-200 pl-9 pr-3 text-sm"
                />
              </label>

              <div className="account-due-filter">
                <span>Período de vencimiento</span>
                <SearchableSaleSelect
                  label="Período de vencimiento"
                  value={period}
                  onChange={(value) => {
                    setPeriod(value);
                    setPage(1);
                  }}
                  options={[
                    { value: "all", label: "Todos" },
                    { value: "today", label: "Hoy" },
                    { value: "7", label: "Próximos 7 días" },
                    { value: "30", label: "Próximos 30 días" },
                    { value: "undated", label: "Sin fecha" },
                  ]}
                />
              </div>
              <div className="account-due-filter">
                <span>Estado</span>
                <SearchableSaleSelect
                  label="Estado de la venta"
                  value={status}
                  onChange={(value) => {
                    setStatus(value);
                    setFilters([]);
                    setPage(1);
                  }}
                  options={[
                    { value: "ALL", label: "Todos" },
                    { value: "OVERDUE", label: "Vencidas" },
                    { value: "TODAY", label: "Vence hoy" },
                    { value: "UPCOMING", label: "En término" },
                    { value: "UNDATED", label: "Sin fecha" },
                    { value: "REVIEW", label: "Por revisar" },
                  ]}
                />
              </div>
              {!customerId && (
                <div className="account-due-filter">
                  <span>Cliente</span>
                  <SearchableSaleSelect
                    label="Cliente"
                    value={clientFilter}
                    onChange={(value) => {
                      setClientFilter(value);
                      setPage(1);
                    }}
                    options={[
                      { value: "", label: "Todos" },
                      ...[
                        ...new Map(
                          rows.map((row) => [row.customerId, row.customerName]),
                        ).entries(),
                      ].map(([value, label]) => ({ value, label })),
                    ]}
                  />
                </div>
              )}

              <AccountDueFilters
                label="Más filtros"
                selected={filters}
                onChange={(next) => {
                  setStatus("ALL");
                  changeFilters(next);
                }}
                rows={searched}
              />
              <button
                type="button"
                aria-label="Actualizar vencimientos"
                title="Actualizar vencimientos"
                disabled={loading}
                onClick={() => setVersion((value) => value + 1)}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-slate-200 text-teal-700 disabled:opacity-50"
              >
                <RefreshCw size={15} />
              </button>
            </div>
            <AccountDueActiveFilters
              selected={filters}
              onChange={changeFilters}
            />
            {error && (
              <p
                role="alert"
                className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700"
              >
                {error}
              </p>
            )}
            {loading && !data ? (
              <p
                role="status"
                className="py-8 text-center text-sm text-slate-500"
              >
                Cargando vencimientos…
              </p>
            ) : (
              <>
                <div className="account-due-table-scroll overflow-auto">
                  <table
                    className={`w-full text-sm ${customerId ? "min-w-[520px]" : "min-w-[700px]"}`}
                  >
                    <thead className="bg-slate-50 text-[11px] text-slate-500">
                      <tr>
                        {[
                          ...(customerId ? [] : ["Cliente"]),
                          "Venta",
                          "Vencimiento",
                          "Estado",
                          "Pendiente",
                          "Acciones",
                        ].map((label) => (
                          <th
                            key={label}
                            className={`px-3 py-2.5 font-medium ${label === "Acciones" ? "w-px whitespace-nowrap text-right" : label === "Pendiente" ? "text-right" : "text-left"}`}
                          >
                            {label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {filtered
                        .slice((current - 1) * 10, current * 10)
                        .map((row) => (
                          <tr
                            key={row.saleId}
                            onClick={
                              customerId
                                ? undefined
                                : () => setSelectedSale(row.saleId)
                            }
                            className={`border-b border-slate-100 last:border-0 ${customerId ? "" : "cursor-pointer"} ${selectedSale === row.saleId ? "bg-teal-50/70" : "hover:bg-slate-50/50"}`}
                          >
                            {!customerId && (
                              <td className="px-3 py-3 font-medium text-slate-800">
                                <span className="flex items-center gap-2">
                                  <span
                                    aria-hidden="true"
                                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[10px] font-semibold text-slate-500"
                                  >
                                    {accountInitials(row.customerName)}
                                  </span>
                                  <span
                                    className="max-w-40 truncate"
                                    title={row.customerName}
                                  >
                                    {row.customerName}
                                  </span>
                                </span>
                              </td>
                            )}
                            <td className="px-3 py-3 text-xs text-slate-500">
                              <button
                                type="button"
                                aria-label={`${customerId ? "Cobrar" : "Ver"} venta ${row.saleId.slice(0, 8).toUpperCase()}`}
                                aria-pressed={selectedSale === row.saleId}
                                onClick={() =>
                                  customerId
                                    ? onCustomer(row.customerId, row.saleId)
                                    : setSelectedSale(row.saleId)
                                }
                                className="rounded text-left font-semibold text-slate-700 underline-offset-4 hover:text-teal-700 hover:underline"
                              >
                                {row.saleId.slice(0, 8).toUpperCase()}
                              </button>
                              {row.saleDate && (
                                <span className="mt-1 block whitespace-nowrap text-[10px] text-slate-400">
                                  {new Date(row.saleDate).toLocaleDateString(
                                    "es-AR",
                                    {
                                      timeZone:
                                        "America/Argentina/Buenos_Aires",
                                    },
                                  )}
                                </span>
                              )}
                            </td>
                            <td
                              className={`whitespace-nowrap px-3 py-3 text-xs font-medium ${row.status === "OVERDUE" ? "text-rose-600" : "text-slate-600"}`}
                            >
                              {row.dueDate
                                ? date(row.dueDate)
                                : "Sin vencimiento"}
                            </td>
                            <td className="px-3 py-3">
                              <span
                                className={`inline-block whitespace-nowrap rounded-full px-2 py-1 text-[11px] ${row.status === "OVERDUE" ? "bg-rose-50 text-rose-700" : row.status === "TODAY" || row.status === "REVIEW" ? "bg-amber-50 text-amber-800" : row.status === "UPCOMING" ? "bg-teal-50 text-teal-700" : "bg-slate-100 text-slate-500"}`}
                              >
                                {row.status === "OVERDUE"
                                  ? `${row.daysOverdue} ${row.daysOverdue === 1 ? "día" : "días"} de atraso`
                                  : row.status === "TODAY"
                                    ? "Vence hoy"
                                    : row.status === "UPCOMING"
                                      ? "En término"
                                      : row.status === "REVIEW"
                                        ? "Por revisar"
                                        : "Sin fecha"}
                              </span>
                              {row.reviewReason && (
                                <span className="mt-1 block text-[11px] text-slate-500">
                                  {row.reviewReason}
                                </span>
                              )}
                            </td>
                            <td className="whitespace-nowrap px-3 py-3 text-right font-semibold tabular-nums text-teal-700">
                              {row.pendingMinor === null
                                ? "Por conciliar"
                                : money(row.pendingMinor)}
                            </td>
                            <td className="w-px whitespace-nowrap px-3 py-3 text-right">
                              <button
                                type="button"
                                onClick={() =>
                                  customerId
                                    ? onCustomer(row.customerId, row.saleId)
                                    : setSelectedSale(row.saleId)
                                }
                                className="rounded-lg border border-teal-200 bg-teal-50 px-3 py-1.5 text-xs font-medium text-teal-700"
                              >
                                {customerId ? "Cobrar" : "Ver detalle"}
                              </button>
                            </td>
                          </tr>
                        ))}
                      {!filtered.length && (
                        <tr>
                          <td
                            colSpan={customerId ? 5 : 6}
                            className="p-8 text-center text-slate-500"
                          >
                            No hay ventas pendientes para este filtro.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
                <Pagination
                  compact
                  total={filtered.length}
                  currentPage={current}
                  totalPages={pages}
                  noun="ventas"
                  label="Páginas de vencimientos"
                  onChange={setPage}
                />
              </>
            )}
          </div>
        </section>
      </div>
      {selectedSale ? (
        <AccountDueSalePanel
          key={`${organizationId}:${branchId}:${selectedSale}`}
          token={token}
          organizationId={organizationId}
          branchId={branchId}
          saleId={selectedSale}
          revision={version + revision}
          reveal={selection !== null}
          onClose={() => setSelectedSale("")}
          onCollect={onCustomer}
        />
      ) : !customerId ? (
        <aside
          className={`rounded-xl border border-dashed border-slate-300 bg-white/70 px-6 py-12 text-center ${customerId ? "hidden" : ""}`}
        >
          <CalendarClock size={30} className="mx-auto mb-4 text-teal-600" />
          <h3 className="text-sm font-semibold text-slate-700">
            Consultá una venta
          </h3>
          <p className="mt-2 text-xs leading-5 text-slate-500">
            Seleccioná una venta para ver el detalle, los artículos, los pagos y
            su historial.
          </p>
          <p className="mt-5 text-[11px] leading-5 text-slate-400">
            Los cobros parciales conservan el vencimiento original. No se
            generan recargos automáticos.
          </p>
        </aside>
      ) : null}
    </div>
  );
}
