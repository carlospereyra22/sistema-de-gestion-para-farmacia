import { useId, useState } from "react";
import {
  CalendarClock,
  ChevronRight,
  History,
  Search,
  ShieldCheck,
  Wallet,
} from "lucide-react";
import type { CustomerAccount } from "./lib/api";
import { accountInitials } from "./lib/account-initials";
import { historyPages } from "./lib/history-pagination";
import {
  customerIdentityDetail,
  matchingCustomerNames,
} from "./lib/customer-identity";

const money = (value: number | string) =>
  (Number(value) / 100).toLocaleString("es-AR", {
    style: "currency",
    currency: "ARS",
  });
export function AccountCustomerList({
  accounts,
  selectedId,
  disabled,
  loading,
  query,
  onQuery,
  onSelect,
  dropdown = false,
}: {
  accounts: CustomerAccount[];
  selectedId: string;
  disabled: boolean;
  loading: boolean;
  query: string;
  onQuery: (value: string) => void;
  onSelect: (id: string) => void;
  dropdown?: boolean;
}) {
  const [filter, setFilter] = useState<"all" | "debt" | "clear">("all");
  const [pagination, setPagination] = useState({ scope: "", page: 1 });
  const options = [
    { id: "all", label: "Todos", count: accounts.length },
    {
      id: "debt",
      label: "Con deuda",
      count: accounts.filter((account) => Number(account.balanceMinor) > 0)
        .length,
    },
    {
      id: "clear",
      label: "Al día",
      count: accounts.filter((account) => Number(account.balanceMinor) <= 0)
        .length,
    },
  ] as const;
  const normalize = (text: string) =>
    text
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLocaleLowerCase();
  const visible = accounts.filter(
    (account) =>
      normalize(`${account.name} ${customerIdentityDetail(account)}`).includes(
        normalize(query.trim()),
      ) &&
      (filter === "all" ||
        (filter === "debt"
          ? Number(account.balanceMinor) > 0
          : Number(account.balanceMinor) <= 0)),
  );
  const scope = `${filter}:${query.trim()}`;
  const totalPages = Math.max(1, Math.ceil(visible.length / 5));
  const page = Math.min(
    pagination.scope === scope ? pagination.page : 1,
    totalPages,
  );
  const pageItems = visible.slice((page - 1) * 5, page * 5);
  const changePage = (next: number) => setPagination({ scope, page: next });
  return (
    <section
      aria-label="Lista de clientes con cuenta corriente"
      className={`flex min-w-0 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm ${dropdown ? "max-h-[min(65dvh,560px)]" : "lg:min-h-80 lg:[contain:size]"}`}
    >
      <div
        className={`shrink-0 space-y-3 border-b border-slate-100 ${dropdown ? "p-2.5" : "p-4"}`}
      >
        {!dropdown && (
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-800">Clientes</h2>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">
              {accounts.length}
            </span>
          </div>
        )}
        {!dropdown && (
          <label className="relative block">
            <Search
              size={15}
              aria-hidden="true"
              className="absolute left-3 top-3 text-slate-400"
            />
            <input
              aria-label="Buscar cliente"
              placeholder="Buscar cliente…"
              value={query}
              onChange={(event) => onQuery(event.target.value)}
              className="h-10 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-sm"
            />
          </label>
        )}
        <div
          role="group"
          aria-label="Filtrar clientes por saldo"
          className={
            dropdown
              ? "grid grid-cols-3 gap-1 rounded-lg bg-slate-100/80 p-1"
              : "flex flex-wrap gap-1.5 text-[11px]"
          }
        >
          {options.map((option) => (
            <button
              type="button"
              key={option.id}
              aria-pressed={filter === option.id}
              onClick={() => setFilter(option.id)}
              className={
                dropdown
                  ? `min-w-0 rounded-md px-1 py-1.5 text-[11px] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-teal-600 ${filter === option.id ? "bg-white text-teal-800 shadow-sm" : "text-slate-500 hover:bg-white/60 hover:text-slate-700"}`
                  : `rounded-full px-2.5 py-1.5 text-[11px] font-medium ${filter === option.id ? "bg-teal-700 text-white" : "bg-slate-50 text-slate-500 hover:bg-slate-100"}`
              }
            >
              {option.label}{" "}
              {!dropdown && (
                <span className="ml-1 opacity-75">{option.count}</span>
              )}
            </button>
          ))}
        </div>
      </div>
      <div
        key={`${scope}:${page}`}
        className="min-h-0 max-h-[60vh] flex-1 overflow-y-auto lg:max-h-none"
      >
        {pageItems.map((account) => {
          const active = selectedId === account.id;
          return (
            <button
              type="button"
              key={account.id}
              disabled={disabled}
              aria-pressed={active}
              onClick={() => onSelect(account.id)}
              className={`flex w-full items-center gap-3 border-b border-l-[3px] border-b-slate-100 px-3 py-3.5 text-left last:border-b-0 ${active ? "border-l-teal-600 bg-teal-50/80" : "border-l-transparent hover:bg-slate-50"}`}
            >
              <span
                aria-hidden="true"
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${active ? "bg-teal-100 text-teal-800" : "bg-slate-100 text-slate-500"}`}
              >
                {accountInitials(account.name)}
              </span>
              <span className="min-w-0 flex-1">
                <strong
                  className="block truncate text-sm font-semibold text-slate-800"
                  title={account.name}
                >
                  {account.name}
                </strong>
                {(customerIdentityDetail(account) ||
                  matchingCustomerNames(accounts, account.name, account.id)
                    .length > 0) && (
                  <span className="mt-1 block truncate text-[11px] text-slate-500">
                    {customerIdentityDetail(account) ||
                      `Ficha ${account.id.slice(0, 8)}`}
                  </span>
                )}
                <span
                  className={`mt-1 block text-[11px] ${account.creditEnabled ? "text-teal-700" : "text-slate-400"}`}
                >
                  {account.creditEnabled ? "Crédito habilitado" : "Sin crédito"}
                </span>
              </span>
              <span className="shrink-0 text-right">
                <strong className="block text-xs font-semibold tabular-nums text-slate-800">
                  {money(account.balanceMinor)}
                </strong>
                <span
                  className={`mt-1 inline-block rounded-md px-1.5 py-0.5 text-[10px] ${Number(account.balanceMinor) > 0 ? "bg-amber-50 text-amber-700" : "bg-emerald-50 text-emerald-700"}`}
                >
                  {Number(account.balanceMinor) > 0
                    ? "Con deuda"
                    : Number(account.balanceMinor) < 0
                      ? "A favor"
                      : "Al día"}
                </span>
              </span>
              <ChevronRight
                aria-hidden="true"
                size={13}
                className={active ? "text-teal-600" : "text-slate-300"}
              />
            </button>
          );
        })}
      </div>
      {!visible.length && (
        <p className="p-6 text-center text-xs leading-5 text-slate-500">
          {loading
            ? "Cargando cuentas…"
            : accounts.length
              ? "No hay clientes para esta búsqueda."
              : "Creá un cliente en Clientes para habilitar su cuenta corriente."}
        </p>
      )}
      <nav
        aria-label="Páginas de clientes"
        className="mt-auto flex shrink-0 flex-col items-center gap-2 border-t border-slate-100 px-3 py-2.5"
      >
        <span role="status" className="text-[10px] text-slate-400">
          {visible.length
            ? `${(page - 1) * 5 + 1}–${Math.min(page * 5, visible.length)} de ${visible.length}`
            : "0 clientes"}
        </span>
        <div className="flex items-center gap-1.5 text-xs">
          <button
            type="button"
            aria-label="Página anterior de clientes"
            disabled={disabled || loading || page === 1}
            onClick={() => changePage(page - 1)}
            className="size-7 rounded-full border border-teal-200 text-teal-700 disabled:opacity-35"
          >
            ‹
          </button>
          {historyPages(page, totalPages).map((item) =>
            typeof item === "string" ? (
              <span key={item} className="text-slate-400">
                …
              </span>
            ) : (
              <button
                key={item}
                type="button"
                aria-label={`Página ${item} de clientes`}
                aria-current={item === page ? "page" : undefined}
                disabled={disabled || loading}
                onClick={() => changePage(item)}
                className={`size-7 rounded-lg border font-medium disabled:opacity-35 ${item === page ? "border-teal-700 bg-teal-700 text-white shadow-sm" : "border-slate-200 bg-white text-teal-700 hover:bg-teal-50"}`}
              >
                {item}
              </button>
            ),
          )}
          <button
            type="button"
            aria-label="Página siguiente de clientes"
            disabled={disabled || loading || page === totalPages}
            onClick={() => changePage(page + 1)}
            className="size-7 rounded-full border border-teal-200 text-teal-700 disabled:opacity-35"
          >
            ›
          </button>
        </div>
      </nav>
    </section>
  );
}

export function AccountCustomerProfile({
  account,
}: {
  account: CustomerAccount;
}) {
  const tooltipId = useId();
  const [activeHint, setActiveHint] = useState<string | null>(null);
  const balance = Number(account.balanceMinor);
  const lastPayment = account.movements
    .filter((item) => item.type === "CREDIT" && !item.saleId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  const cards = [
    {
      label: balance < 0 ? "Saldo a favor" : "Saldo pendiente",
      value: money(Math.abs(balance)),
      note: balance > 0 ? "Deuda actual del cliente" : "Sin deuda pendiente",
      icon: Wallet,
      color: balance > 0 ? "#be4563" : "#0f766e",
    },
    {
      label: "Crédito disponible",
      value: !account.creditEnabled
        ? money(0)
        : account.creditLimitMinor === null
          ? "Sin límite"
          : money(Math.max(0, Number(account.creditLimitMinor) - balance)),
      note:
        account.creditLimitMinor === null
          ? "Límite autorizado: sin límite"
          : `Límite: ${money(account.creditLimitMinor)}`,
      icon: ShieldCheck,
      color: "#2874a6",
    },
    {
      label: "Último pago",
      value: lastPayment ? money(lastPayment.amountMinor) : "Sin pagos",
      paymentDate: lastPayment
        ? new Date(lastPayment.createdAt).toLocaleDateString("es-AR", {
            timeZone: "America/Argentina/Buenos_Aires",
          })
        : null,
      note: lastPayment
        ? "Importe y fecha del último cobro registrado"
        : "Sin cobros registrados",
      icon: History,
      color: "#188469",
    },
    {
      label: "Plazo de pago",
      value:
        account.accountTermDays == null
          ? "Sin vencimiento"
          : `${account.accountTermDays} días`,
      note: "Para nuevas ventas",
      icon: CalendarClock,
      color: "#7954b3",
    },
  ];
  return (
    <header className="account-profile">
      <div className="account-profile-layout">
        <div className="flex min-w-0 items-center gap-3">
          <span
            aria-hidden="true"
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-teal-100 text-lg font-semibold text-teal-800"
          >
            {accountInitials(account.name)}
          </span>
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
              Cuenta del cliente
            </p>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
              <h2 className="break-words text-xl font-semibold text-slate-900">
                {account.name}
              </h2>
              <span
                className={`inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-[10px] font-medium ${account.creditEnabled ? "bg-teal-50 text-teal-700" : "bg-slate-100 text-slate-500"}`}
              >
                <span className="h-1.5 w-1.5 rounded-full bg-current" />
                {account.creditEnabled
                  ? "Crédito habilitado"
                  : "Crédito deshabilitado"}
              </span>
            </div>
          </div>
        </div>
        <dl className="account-profile-metrics grid min-w-0 grid-cols-2 gap-2">
          {cards.map(
            ({ label, value, note, icon: Icon, color, paymentDate }, index) => (
              <div
                key={label}
                className="relative min-w-0 rounded-xl border border-slate-200 bg-white p-3 shadow-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-600"
                style={{ borderTopWidth: 3, borderTopColor: color }}
                tabIndex={0}
                aria-describedby={`${tooltipId}-${index}`}
                onMouseEnter={() => setActiveHint(label)}
                onMouseLeave={() => setActiveHint(null)}
                onFocus={() => setActiveHint(label)}
                onBlur={() => setActiveHint(null)}
                onKeyDown={(event) => {
                  if (event.key === "Escape") setActiveHint(null);
                }}
              >
                <span
                  className="absolute right-3 top-2.5 flex h-6 w-6 items-center justify-center rounded-lg bg-slate-50"
                  style={{ color }}
                  aria-hidden="true"
                >
                  <Icon size={14} />
                </span>
                <dt className="pr-9 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                  {label}
                </dt>
                <dd
                  className={`mt-1.5 min-w-0 font-semibold leading-5 tabular-nums ${paymentDate ? "flex flex-wrap items-baseline gap-x-2 text-sm" : "break-words text-base"}`}
                  style={{ color }}
                >
                  <span>{value}</span>
                  {paymentDate && (
                    <span className="whitespace-nowrap">{paymentDate}</span>
                  )}
                </dd>
                <dd
                  id={`${tooltipId}-${index}`}
                  role="tooltip"
                  hidden={activeHint !== label}
                  className="absolute inset-x-0 bottom-full z-50 pb-2"
                >
                  <span className="block rounded-lg border border-[#d3e5e0] bg-white px-[9px] py-[7px] text-[11px] font-normal leading-4 text-slate-600 shadow-[0_4px_12px_rgb(15_23_42_/_10%)]">
                    {note}
                  </span>
                </dd>
              </div>
            ),
          )}
        </dl>
      </div>
    </header>
  );
}
