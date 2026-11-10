import { useId, useState, type ReactNode } from "react";
import {
  ArrowLeft,
  CalendarClock,
  ChevronRight,
  CircleDollarSign,
  History,
  Plus,
  Search,
  ShieldCheck,
  UserRound,
  Wallet,
} from "lucide-react";
import { AccountCustomerContact } from "./account-customer-contact";
import { Pagination } from "./pagination";
import { ProductFilterSelect } from "./product-filter-select";
import {
  actorFilterOptions,
  actorName,
  matchesActorFilter,
  matchesCreditFilter,
  validActorFilter,
  type AccountCreditFilter,
} from "./lib/account-customer-selection";
import type { CustomerAccount } from "./lib/api";
import { accountInitials } from "./lib/account-initials";
import {
  customerIdentityDetail,
  matchingCustomerNames,
} from "./lib/customer-identity";

const money = (value: number | string) =>
  (Number(value) / 100).toLocaleString("es-AR", {
    style: "currency",
    currency: "ARS",
  });
const rowColumns =
  "md:grid md:grid-cols-[minmax(0,1.5fr)_minmax(0,1.2fr)_minmax(0,0.8fr)_minmax(0,0.8fr)_16px] lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1.1fr)_minmax(0,0.7fr)_minmax(0,0.9fr)_minmax(0,0.7fr)_16px]";
const pageSize = 10;
type AccountBalanceFilter = "all" | "debt" | "clear";
export function AccountCustomerList({
  accounts,
  disabled,
  loading,
  query,
  onQuery,
  onSelect,
  onCreate,
  summary,
}: {
  accounts: CustomerAccount[];
  disabled: boolean;
  loading: boolean;
  query: string;
  onQuery: (value: string) => void;
  onSelect: (id: string) => void;
  onCreate: (name?: string) => void;
  summary?: ReactNode;
}) {
  const [filter, setFilter] = useState<AccountBalanceFilter>("all");
  const [creditFilter, setCreditFilter] = useState<AccountCreditFilter>("all");
  const [creatorChoice, setCreatorChoice] = useState("all");
  const [enablerChoice, setEnablerChoice] = useState("all");
  const [pagination, setPagination] = useState({ scope: "", page: 1 });
  const creatorOptions = actorFilterOptions(
    accounts.map((account) => account.createdBy),
    "Creado por",
  );
  // Sin cuenta corriente no hay quién la haya habilitado: no es un dato faltante.
  const enablerOptions = actorFilterOptions(
    accounts
      .filter((account) => account.creditEnabled)
      .map((account) => account.creditEnabledBy),
    "Habilitada por",
  );
  const creatorFilter = validActorFilter(creatorOptions, creatorChoice);
  const enablerFilter = validActorFilter(enablerOptions, enablerChoice);
  const passesSelectors = (account: CustomerAccount) =>
    matchesCreditFilter(account, creditFilter) &&
    matchesActorFilter(account.createdBy, creatorFilter) &&
    (enablerFilter === "all" ||
      (account.creditEnabled &&
        matchesActorFilter(account.creditEnabledBy, enablerFilter)));
  const normalize = (text: string) =>
    text
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLocaleLowerCase();
  const search = query.trim();
  const matches = accounts.filter((account) =>
    normalize(`${account.name} ${customerIdentityDetail(account)}`).includes(
      normalize(search),
    ),
  );
  const visible = matches.filter(
    (account) =>
      passesSelectors(account) &&
      (filter === "all" ||
        (filter === "debt"
          ? Number(account.balanceMinor) > 0
          : Number(account.balanceMinor) <= 0)),
  );
  // Un CUIT o teléfono sin resultados no sirve como nombre del cliente nuevo.
  const suggestedName =
    !matches.length && /\p{L}/u.test(search) ? search : undefined;
  const scope = `${filter}:${creditFilter}:${creatorFilter}:${enablerFilter}:${search}`;
  const totalPages = Math.max(1, Math.ceil(visible.length / pageSize));
  const page = Math.min(
    pagination.scope === scope ? pagination.page : 1,
    totalPages,
  );
  const pageItems = visible.slice((page - 1) * pageSize, page * pageSize);
  const changePage = (next: number) => setPagination({ scope, page: next });
  return (
    <>
      <div className="grid shrink-0 items-stretch gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(0,640px)]">
        <div className="flex min-w-0 flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-semibold text-slate-800">Clientes</h2>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-sm text-slate-500">
              {accounts.length}
            </span>
          </div>
          <label className="relative block min-w-44 grow basis-full sm:basis-44">
            <Search
              size={16}
              aria-hidden="true"
              className="absolute left-3 top-3 text-slate-400"
            />
            <input
              aria-label="Buscar cliente"
              placeholder="Buscar por nombre, CUIT o teléfono…"
              autoComplete="off"
              value={query}
              onChange={(event) => onQuery(event.target.value)}
              className="h-10 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-base focus:border-teal-500 focus:outline-none"
            />
          </label>
          <button
            type="button"
            disabled={disabled}
            onClick={() => onCreate()}
            className="inline-flex h-10 items-center gap-2 rounded-lg bg-teal-700 px-4 text-sm font-semibold text-white disabled:opacity-50"
          >
            <Plus size={16} aria-hidden="true" />
            Nuevo cliente
          </button>
        </div>
        {summary}
      </div>
      <section
        aria-label="Lista de clientes con cuenta corriente"
        className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"
      >
        <div className="grid shrink-0 gap-2 border-b border-slate-100 px-4 py-3 sm:grid-cols-2 lg:grid-cols-4">
          <ProductFilterSelect
            compact
            label="Filtrar clientes por saldo"
            icon={<CircleDollarSign size={15} aria-hidden />}
            value={filter}
            options={[
              { value: "all", label: "Saldo: todos" },
              { value: "debt", label: "Con deuda" },
              { value: "clear", label: "Al día" },
            ]}
            onChange={(value) => setFilter(value as AccountBalanceFilter)}
          />
          <ProductFilterSelect
            compact
            label="Filtrar clientes por quién los creó"
            icon={<UserRound size={15} aria-hidden />}
            value={creatorFilter}
            options={creatorOptions}
            onChange={setCreatorChoice}
          />
          <ProductFilterSelect
            compact
            label="Filtrar clientes por quién habilitó la cuenta"
            icon={<ShieldCheck size={15} aria-hidden />}
            value={enablerFilter}
            options={enablerOptions}
            onChange={setEnablerChoice}
          />
          <ProductFilterSelect
            compact
            label="Filtrar clientes por cuenta corriente"
            icon={<Wallet size={15} aria-hidden />}
            value={creditFilter}
            options={[
              { value: "all", label: "Cuenta corriente: todos" },
              { value: "with", label: "Con cuenta corriente" },
              { value: "without", label: "Sin cuenta corriente" },
            ]}
            onChange={(value) => setCreditFilter(value as AccountCreditFilter)}
          />
        </div>
        {pageItems.length > 0 && (
          <div
            aria-hidden="true"
            className={`hidden shrink-0 items-center gap-3 border-b border-slate-100 bg-slate-50/60 px-4 py-2 text-xs font-medium uppercase tracking-wide text-slate-500 ${rowColumns}`}
          >
            <span>Cliente</span>
            <span>CUIT / DNI y teléfono</span>
            <span className="hidden lg:block">Creado por</span>
            <span>Crédito</span>
            <span className="text-right">Saldo</span>
            <span />
          </div>
        )}
        <div
          key={`${scope}:${page}`}
          className="min-h-0 flex-1 overflow-y-auto"
        >
          {pageItems.map((account) => {
            const detail =
              customerIdentityDetail(account) ||
              (matchingCustomerNames(accounts, account.name, account.id)
                .length > 0
                ? `Ficha ${account.id.slice(0, 8)}`
                : "");
            const credit = account.creditEnabled
              ? "Crédito habilitado"
              : "Sin crédito";
            return (
              <button
                type="button"
                key={account.id}
                disabled={disabled}
                onClick={() => onSelect(account.id)}
                className={`flex w-full items-center gap-3 border-b border-b-slate-100 px-4 py-2.5 text-left last:border-b-0 hover:bg-slate-50 ${rowColumns}`}
              >
                <span className="flex min-w-0 flex-1 items-center gap-3">
                  <span
                    aria-hidden="true"
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-100 text-sm font-semibold text-slate-500"
                  >
                    {accountInitials(account.name)}
                  </span>
                  <span className="min-w-0">
                    <span className="flex min-w-0 items-center gap-2">
                      <strong
                        className="truncate text-base font-semibold text-slate-800"
                        title={account.name}
                      >
                        {account.name}
                      </strong>
                      {account.active === false && (
                        <span className="shrink-0 rounded-md bg-slate-100 px-1.5 py-0.5 text-xs text-slate-500">
                          Eliminado
                        </span>
                      )}
                      {account.porEnviar && (
                        <span className="shrink-0 whitespace-nowrap rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800">
                          Por enviar
                        </span>
                      )}
                    </span>
                    <span className="mt-0.5 block truncate text-sm text-slate-500 md:hidden">
                      {[detail, credit].filter(Boolean).join(" · ")}
                    </span>
                  </span>
                </span>
                <span className="hidden min-w-0 truncate text-sm text-slate-500 md:block">
                  {detail || "Sin informar"}
                </span>
                <span className="hidden min-w-0 truncate text-sm text-slate-500 lg:block">
                  {actorName(account.createdBy)}
                </span>
                <span className="hidden min-w-0 md:block">
                  <span
                    className={`block truncate text-sm ${account.creditEnabled ? "text-teal-700" : "text-slate-400"}`}
                  >
                    {credit}
                  </span>
                  {account.creditEnabled && (
                    <span className="mt-0.5 block truncate text-xs text-slate-500">
                      Por: {actorName(account.creditEnabledBy)}
                    </span>
                  )}
                </span>
                <span className="shrink-0 text-right">
                  <strong className="block text-base font-semibold tabular-nums text-slate-800">
                    {money(account.balanceMinor)}
                  </strong>
                  <span
                    className={`mt-0.5 inline-block rounded-md px-1.5 py-0.5 text-xs ${Number(account.balanceMinor) > 0 ? "bg-amber-50 text-amber-700" : "bg-emerald-50 text-emerald-700"}`}
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
                  size={16}
                  className="text-slate-300"
                />
              </button>
            );
          })}
          {!visible.length && (
            <div className="flex flex-col items-center gap-3 p-8 text-center text-sm text-slate-500">
              <p>
                {loading
                  ? "Cargando cuentas…"
                  : !accounts.length
                    ? "Todavía no hay clientes."
                    : matches.length
                      ? "No hay clientes con este filtro."
                      : `No encontramos «${search}».`}
              </p>
              {!loading && (!accounts.length || suggestedName) && (
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => onCreate(suggestedName)}
                  className="inline-flex items-center gap-2 rounded-lg border border-teal-200 bg-teal-50 px-4 py-2 text-sm font-medium text-teal-700 disabled:opacity-50"
                >
                  <Plus size={16} aria-hidden="true" />
                  {suggestedName
                    ? `Crear «${suggestedName}»`
                    : "Crear el primer cliente"}
                </button>
              )}
            </div>
          )}
        </div>
        <Pagination
          integrated
          total={visible.length}
          currentPage={page}
          totalPages={totalPages}
          noun="clientes"
          label="Páginas de clientes"
          onChange={changePage}
        />
      </section>
    </>
  );
}

export function AccountCustomerProfile({
  account,
  onBack,
  backDisabled = false,
}: {
  account: CustomerAccount;
  /** Volver al listado: el botón va en la misma barra que los datos. */
  onBack?: () => void;
  backDisabled?: boolean;
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
        <div className="account-profile-bar flex min-w-0 flex-wrap items-center gap-x-5 gap-y-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
          {onBack && (
            <button
              type="button"
              disabled={backDisabled}
              onClick={onBack}
              className="inline-flex h-10 shrink-0 items-center gap-2 rounded-lg border border-slate-200 px-3 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
            >
              <ArrowLeft size={16} aria-hidden="true" />
              Volver a clientes
            </button>
          )}
          <div
            className={`flex min-w-0 items-center gap-3 ${onBack ? "account-profile-group" : ""}`}
          >
            <span
              aria-hidden="true"
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-teal-100 text-lg font-semibold text-teal-800"
            >
              {accountInitials(account.name)}
            </span>
            <div className="min-w-0">
              <h2 className="break-words text-xl font-semibold leading-tight text-slate-900">
                {account.name}
              </h2>
              <span
                className={`mt-1 inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium ${account.creditEnabled ? "bg-teal-50 text-teal-700" : "bg-slate-100 text-slate-500"}`}
              >
                <span className="h-1.5 w-1.5 rounded-full bg-current" />
                {account.creditEnabled
                  ? "Crédito habilitado"
                  : "Crédito deshabilitado"}
              </span>
            </div>
          </div>
          <div className="account-profile-group min-w-0">
            <AccountCustomerContact account={account} />
          </div>
          <div className="account-profile-group flex min-w-0 items-center gap-2 text-xs text-slate-500">
            <UserRound
              size={16}
              aria-hidden="true"
              className="shrink-0 text-slate-500"
            />
            <p className="min-w-0 leading-5">
              Creado por:{" "}
              <strong className="font-semibold text-slate-700">
                {actorName(account.createdBy)}
              </strong>
              {account.creditEnabled && (
                <>
                  {" · "}
                  <br className="hidden xl:inline" />
                  Cuenta habilitada por:{" "}
                  <strong className="font-semibold text-slate-700">
                    {actorName(account.creditEnabledBy)}
                  </strong>
                </>
              )}
            </p>
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
