import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AccountCustomerPicker } from "./account-customer-picker";
import { AccountCustomerContact } from "./account-customer-contact";
import { AccountItemSelector } from "./account-item-selector";
import { Pagination } from "./pagination";
import { AccountCollectionDialog } from "./account-collection-dialog";
import { StatusToast } from "./status-toast";
import { filterAccountHistory } from "./lib/account-history";
import { AccountPaymentSummary } from "./account-payment-summary";
import { AccountCashSession } from "./account-cash-session";
import { AccountMixedPayment } from "./account-mixed-payment";
import { AccountPaymentMethods } from "./account-payment-methods";
import { AccountPaymentTerm } from "./account-payment-term";
import { AccountDebtStatement } from "./account-debt-statement";
import {
  mixedReceiptPayments,
  type MixedDraft,
} from "./lib/account-mixed-payment";
import { AccountSummary } from "./account-summary";
import { AccountCustomerProfile } from "./account-customer-panels";
import { AccountDueDates } from "./account-due-dates";
import { accountTicket } from "./lib/thermal-ticket";
import { DirectTicketPrint } from "./direct-ticket-print";
import {
  ShieldCheck,
  Infinity as InfinityIcon,
  CircleDollarSign,
  Check,
  ReceiptText,
  Printer,
  Users,
  CalendarClock,
} from "lucide-react";
import {
  configureCustomerAccount,
  createCustomerAccountReceipt,
  getAccountReceipt,
  getCustomerAccounts,
  getCash,
  getAccountSaleDetail,
  assignAccountItems,
  type ItemAllocation,
  type AccountSaleDetail,
  type CustomerAccount,
  type CashSession,
} from "./lib/api";

const money = (value: string | number) =>
  (Number(value) / 100).toLocaleString("es-AR", {
    style: "currency",
    currency: "ARS",
  });
const field =
  "mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-100";
const button =
  "rounded-lg bg-teal-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50";
export function CustomerAccounts({
  active = true,
  token,
  organizationId,
  branchId,
  toolbarTarget,
  organizationName = "Resumen de cuenta corriente",
  branchName = "Sucursal seleccionada",
  error,
}: {
  active?: boolean;
  token: string;
  organizationId: string;
  branchId: string;
  toolbarTarget?: HTMLElement | null;
  organizationName?: string;
  branchName?: string;
  error: (message: string) => void;
}) {
  const [collectionModal, setCollectionModal] = useState(false);
  const [collectionError, setCollectionError] = useState("");
  const [dueRevision, setDueRevision] = useState(0);
  useEffect(() => {
    setCollectionModal(false);
    setDueSelection(undefined);
    setSelectionValid(false);
  }, [organizationId, branchId]);
  const [accounts, setAccounts] = useState<CustomerAccount[]>([]);
  const [statementOpen, setStatementOpen] = useState(false);
  const [summaryTarget, setSummaryTarget] = useState<HTMLDivElement | null>(
    null,
  );
  const [dueSelection, setDueSelection] = useState<{
    customerId: string;
    saleId: string;
    applied?: boolean;
  }>();
  const [historyFilter, setHistoryFilter] = useState<
    "all" | "sales" | "receipts"
  >("all");
  const [collectionMenuTarget, setCollectionMenuTarget] =
    useState<HTMLDivElement | null>(null);
  const [selectedId, setSelectedId] = useState("");
  const [expandedMovement, setExpandedMovement] = useState("");
  const [tab, setTab] = useState<"movements" | "history" | "credit" | "due">(
    "movements",
  );
  const [enabled, setEnabled] = useState(false);
  const [unlimited, setUnlimited] = useState(false);
  const [limit, setLimit] = useState("");
  const [termDays, setTermDays] = useState("");
  const [screen, setScreen] = useState<"clients" | "due">("clients");
  const [visitedDueScope, setVisitedDueScope] = useState("");
  const dueScope = `${organizationId}:${branchId}`;
  const [amount, setAmount] = useState("");
  const [allocations, setAllocations] = useState<ItemAllocation[]>([]);
  const [assignmentId, setAssignmentId] = useState("");
  const [selectionValid, setSelectionValid] = useState(false);
  const [selectionVersion, setSelectionVersion] = useState(0);
  const selectionChanged = useCallback(
    (items: ItemAllocation[], movementId: string, valid: boolean) => {
      setAllocations(items);
      setAssignmentId(movementId);
      setSelectionValid(valid);
      setAmount(
        String(items.reduce((sum, item) => sum + item.amountMinor, 0) / 100),
      );
    },
    [],
  );
  const [method, setMethod] = useState<"CASH" | "CARD" | "TRANSFER">(
    "TRANSFER",
  );
  const [sessions, setSessions] = useState<CashSession[]>([]);
  const [mixedPayment, setMixedPayment] = useState(false);
  const [mixedDraft, setMixedDraft] = useState<MixedDraft>({
    CASH: "",
    CARD: "",
    TRANSFER: "",
  });
  const paymentParts = mixedReceiptPayments(mixedDraft);
  const paymentTotal = Math.round(Number(amount || 0) * 100);
  const mixedValid =
    paymentParts !== null &&
    paymentParts.length > 0 &&
    paymentParts.reduce((sum, part) => sum + BigInt(part.amountMinor), 0n) ===
      BigInt(Number.isSafeInteger(paymentTotal) ? paymentTotal : 0);
  const [sessionId, setSessionId] = useState("");
  const [allowWithoutSession, setAllowWithoutSession] = useState(true);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [confirmedReceipt, setConfirmedReceipt] = useState<{
    id: string;
    amountMinor: string;
    customerName: string;
  } | null>(null);
  const [ticketTarget, setTicketTarget] = useState<{
    receiptId: string;
    customerId: string;
  }>();
  const printReceipt = (receiptId: string) =>
    setTicketTarget({ receiptId, customerId: selectedId });
  const loadTicket = useCallback(
    async () =>
      accountTicket(
        await getAccountReceipt(
          token,
          organizationId,
          branchId,
          ticketTarget!.customerId,
          ticketTarget!.receiptId,
        ),
      ),
    [token, organizationId, branchId, ticketTarget],
  );
  const operation = useRef(crypto.randomUUID());
  const pending = useRef(false);
  const selected = accounts.find((account) => account.id === selectedId);
  const historyRows = filterAccountHistory(
    selected?.movements ?? [],
    historyFilter,
  );
  const [historyPagination, setHistoryPagination] = useState({
    scope: "",
    page: 1,
  });
  const historyScope = `${organizationId}:${branchId}:${selectedId}:${historyFilter}`;
  const historyPages = Math.max(1, Math.ceil(historyRows.length / 10));
  const historyPage = Math.min(
    historyPagination.scope === historyScope ? historyPagination.page : 1,
    historyPages,
  );
  const historyPageRows = [...historyRows]
    .reverse()
    .slice((historyPage - 1) * 10, historyPage * 10);
  const load = async () => {
    const items = await getCustomerAccounts(token, organizationId, branchId);
    setAccounts(items);
    setSelectedId((id) =>
      items.some((item) => item.id === id) ? id : (items[0]?.id ?? ""),
    );
  };
  useEffect(() => {
    if (!active) return;
    setLoading(true);
    void load()
      .catch((cause: unknown) =>
        error(
          cause instanceof Error
            ? cause.message
            : "No se pudieron cargar las cuentas.",
        ),
      )
      .finally(() => setLoading(false));
    void getCash(token, organizationId, branchId)
      .then((cash) => {
        const open = cash.sessions.filter((session) => !session.closedAt);
        setSessions(open);
        setAllowWithoutSession(cash.settings?.allowWithoutSession ?? true);
        setSessionId(open[0]?.id ?? "");
      })
      .catch(() => {
        setSessions([]);
        setSessionId("");
      });
  }, [token, organizationId, branchId, active]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (active) {
      setDueRevision((value) => value + 1);
      return;
    }
    setScreen("clients");
    setCollectionModal(false);
    setStatementOpen(false);
    setTicketTarget(undefined);
    setConfirmedReceipt(null);
    setDueSelection(undefined);
    setSelectionValid(false);
    setAllocations([]);
    setAmount("");
  }, [active]);
  useEffect(() => {
    setEnabled(selected?.creditEnabled ?? false);
    setUnlimited(selected?.creditLimitMinor === null);
    setLimit(String(Number(selected?.creditLimitMinor ?? 0) / 100));
    setTermDays(
      selected?.accountTermDays == null ? "" : String(selected.accountTermDays),
    );
  }, [selected]);
  useEffect(() => {
    setAmount("");
    setMixedDraft({ CASH: "", CARD: "", TRANSFER: "" });
    setMixedPayment(false);
    setNote("");
    setMessage("");
    setConfirmedReceipt(null);
  }, [selectedId, branchId, organizationId]);
  useEffect(() => {
    operation.current = crypto.randomUUID();
  }, [
    amount,
    method,
    note,
    sessionId,
    selectedId,
    allocations,
    mixedDraft,
    mixedPayment,
  ]);
  const save = async (kind: "credit" | "receipt") => {
    if (!selected || pending.current) return;
    pending.current = true;
    setBusy(true);
    setMessage("");
    setCollectionError("");
    setConfirmedReceipt(null);
    try {
      if (kind === "credit") {
        const minor = Math.round(Number(limit) * 100);
        if (
          !unlimited &&
          (!limit.trim() || !Number.isSafeInteger(minor) || minor < 0)
        )
          throw new Error("Ingresá un límite válido.");
        const days = termDays === "" ? null : Number(termDays);
        if (
          days !== null &&
          (!Number.isInteger(days) || days < 0 || days > 3650)
        )
          throw new Error("Ingresá un plazo entre 0 y 3650 días.");
        await configureCustomerAccount(
          token,
          organizationId,
          branchId,
          selected.id,
          enabled,
          unlimited ? null : minor,
          days,
        );
        setMessage("Configuración de crédito guardada.");
      } else {
        if (!selectionValid)
          throw new Error("Revisá la selección de artículos y los importes.");
        const minor = Math.round(Number(amount) * 100);
        if (
          !Number.isSafeInteger(minor) ||
          minor <= 0 ||
          (!assignmentId &&
            minor >
              Number(selected.balanceMinor) +
                allocations.reduce(
                  (sum, item) =>
                    sum +
                    (item.expectedPendingMinor !== undefined
                      ? (item.nextPendingMinor ?? item.amountMinor) -
                        item.expectedPendingMinor
                      : 0),
                  0,
                ))
        )
          throw new Error(
            "El importe debe ser mayor a cero y no superar la deuda.",
          );
        if (assignmentId)
          await assignAccountItems(
            token,
            organizationId,
            branchId,
            selected.id,
            assignmentId,
            allocations,
          );
        else {
          if (mixedPayment && !mixedValid)
            throw new Error(
              "Completá los medios de pago hasta alcanzar exactamente el total a cobrar.",
            );
          const receipt = await createCustomerAccountReceipt(
            token,
            organizationId,
            branchId,
            selected.id,
            minor,
            mixedPayment
              ? paymentParts!.length > 1
                ? "OTHER"
                : paymentParts![0]!.method
              : method,
            note,
            sessionId || undefined,
            operation.current,
            allocations,
            mixedPayment ? paymentParts! : undefined,
          );
          setConfirmedReceipt({ ...receipt, customerName: selected.name });
        }
        setAmount("");
        setMixedDraft({ CASH: "", CARD: "", TRANSFER: "" });
        setNote("");
        operation.current = crypto.randomUUID();
        setMessage(
          assignmentId
            ? "Artículos asignados sin modificar el saldo ni la caja."
            : "Cobro registrado y asignado a los artículos seleccionados.",
        );
        setCollectionModal(false);
        setDueRevision((value) => value + 1);
        setDueSelection(undefined);
        setSelectionVersion((value) => value + 1);
        setSelectionValid(false);
      }
      await load();
    } catch (cause) {
      setCollectionError(
        cause instanceof Error
          ? cause.message
          : "No se pudo guardar la operación.",
      );
      error(
        cause instanceof Error
          ? cause.message
          : "No se pudo guardar la operación.",
      );
    } finally {
      pending.current = false;
      setBusy(false);
    }
  };
  const debt = accounts.reduce(
    (sum, account) => sum + Math.max(Number(account.balanceMinor), 0),
    0,
  );
  const openDueCollection = (id: string, saleId: string) => {
    setDueSelection({ customerId: id, saleId });
    setSelectedId(id);
    setSelectionValid(false);
    setCollectionError("");
    setSelectionVersion((value) => value + 1);
    setCollectionModal(true);
  };
  const collectionForm =
    active && selected ? (
      <form
        className="account-collection-form mt-4 grid items-start gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          void save("receipt");
        }}
      >
        <div className="account-items-column min-w-0">
          <AccountItemSelector
            saleScope={collectionModal ? dueSelection?.saleId : undefined}
            initialSaleId={
              dueSelection?.customerId === selected.id && !dueSelection.applied
                ? dueSelection.saleId
                : undefined
            }
            onInitialSaleHandled={() =>
              setDueSelection((current) =>
                current ? { ...current, applied: true } : current,
              )
            }
            summaryTarget={summaryTarget}
            onStatement={() => setStatementOpen(true)}
            menuTarget={collectionMenuTarget}
            key={`${selected.id}:${selectionVersion}`}
            token={token}
            organizationId={organizationId}
            branchId={branchId}
            customerId={selected.id}
            disabled={busy}
            onChange={selectionChanged}
            onUpdated={load}
          />
        </div>
        <aside className="account-collection-summary rounded-xl border border-slate-200 bg-white p-4 shadow-sm xl:sticky xl:top-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-800">
              <ReceiptText size={16} className="text-teal-700" />
              Resumen del cobro
            </h3>
            <div ref={setCollectionMenuTarget} className="shrink-0" />
          </div>
          <div className="rounded-xl border border-teal-100/70 bg-teal-50/80 px-3 py-3 text-center">
            <p className="text-[11px] font-medium uppercase tracking-wide text-teal-700">
              {assignmentId ? "Total a asignar" : "Total a cobrar"}
            </p>
            <strong className="mt-1 block break-words text-2xl font-semibold leading-tight tracking-tight text-teal-700 tabular-nums">
              {money(Number(amount || 0) * 100 || 0)}
            </strong>
            <p className="mt-1.5 text-[11px] text-teal-700/70">
              {allocations.length}{" "}
              {allocations.length === 1
                ? "artículo seleccionado"
                : "artículos seleccionados"}
            </p>
          </div>
          {!assignmentId && (
            <AccountPaymentSummary
              balanceMinor={selected.balanceMinor}
              adjustmentMinor={allocations.reduce(
                (sum, item) =>
                  sum +
                  (item.expectedPendingMinor !== undefined
                    ? (item.nextPendingMinor ?? item.amountMinor) -
                      item.expectedPendingMinor
                    : 0),
                0,
              )}
              amountMinor={Math.round(Number(amount || 0) * 100)}
              valid={selectionValid}
            />
          )}
          <div ref={setSummaryTarget} />
          <div className={`mt-4 grid gap-3 ${assignmentId ? "hidden" : ""}`}>
            <fieldset disabled={busy}>
              <legend className="sr-only">Medios de pago</legend>
              <div className="mb-2 flex items-center justify-between gap-2">
                <span
                  aria-hidden="true"
                  className="text-xs font-medium text-slate-600"
                >
                  Medios de pago
                </span>
                <label className="flex cursor-pointer items-center gap-1.5 text-[11px] text-slate-600">
                  <input
                    type="checkbox"
                    checked={mixedPayment}
                    onChange={(event) => setMixedPayment(event.target.checked)}
                    className="accent-teal-700"
                  />
                  Pago mixto
                </label>
              </div>
              {mixedPayment ? (
                <AccountMixedPayment
                  total={paymentTotal}
                  value={mixedDraft}
                  onChange={setMixedDraft}
                />
              ) : (
                <AccountPaymentMethods value={method} onChange={setMethod} />
              )}
            </fieldset>
            {!assignmentId && (
              <AccountCashSession
                sessions={sessions}
                value={sessionId}
                onChange={setSessionId}
                allowWithoutSession={allowWithoutSession}
              />
            )}
            <label className="text-sm">
              Referencia / observación
              <input
                className={field}
                value={note}
                maxLength={300}
                onChange={(event) => setNote(event.target.value)}
              />
            </label>
          </div>
          <footer className="account-collection-footer mt-4 flex flex-col-reverse gap-2">
            <button
              className={`${button} w-full`}
              disabled={
                busy ||
                !selectionValid ||
                (!assignmentId && !allowWithoutSession && !sessionId) ||
                (!assignmentId && mixedPayment && !mixedValid)
              }
            >
              {busy
                ? "Registrando..."
                : assignmentId
                  ? "Guardar asignación"
                  : "Confirmar cobro"}
            </button>
            {assignmentId && (
              <p className="text-center text-[11px] text-slate-400">
                Sin modificar el saldo ni la caja
              </p>
            )}
          </footer>
        </aside>
      </form>
    ) : null;
  return (
    <div className={active ? "account-workspace space-y-4" : "hidden"}>
      {confirmedReceipt && (
        <PaymentConfirmedDialog
          receipt={confirmedReceipt}
          onClose={() => setConfirmedReceipt(null)}
          onPrint={() => void printReceipt(confirmedReceipt.id)}
        />
      )}
      {message && !confirmedReceipt && (
        <StatusToast message={message} onClose={() => setMessage("")} />
      )}
      {collectionModal && dueSelection && (
        <AccountCollectionDialog
          busy={busy}
          saleId={dueSelection.saleId}
          customerName={selected?.name ?? "Cargando cliente"}
          error={collectionError}
          onClose={() => {
            setCollectionModal(false);
            setDueSelection(undefined);
            setSelectionValid(false);
            setSelectionVersion((value) => value + 1);
          }}
        >
          {collectionForm ?? (
            <p className="py-6 text-sm text-slate-500">
              La cuenta no está disponible. Cerrá esta ventana y actualizá la
              lista.
            </p>
          )}
        </AccountCollectionDialog>
      )}
      {statementOpen && (
        <AccountDebtStatement
          key={`${organizationId}:${branchId}`}
          token={token}
          organizationId={organizationId}
          branchId={branchId}
          organizationName={organizationName}
          branchName={branchName}
          accounts={accounts}
          selectedId={selectedId}
          onClose={() => setStatementOpen(false)}
        />
      )}
      {ticketTarget && (
        <DirectTicketPrint
          key={ticketTarget.receiptId}
          load={loadTicket}
          onClose={() => setTicketTarget(undefined)}
        />
      )}
      <div className="grid items-stretch gap-3 lg:grid-cols-[minmax(230px,1fr)_minmax(300px,380px)] xl:grid-cols-[minmax(230px,1fr)_minmax(300px,380px)_minmax(420px,1.8fr)]">
        {screen === "clients" && (
          <>
            <AccountCustomerPicker
              accounts={accounts}
              selectedId={selectedId}
              disabled={busy}
              loading={loading}
              onSelect={(id) => {
                setDueSelection(undefined);
                setHistoryFilter("all");
                setSelectedId(id);
                setScreen("clients");
              }}
            />
            <AccountCustomerContact account={selected} />
            <div className="lg:col-span-2 xl:col-span-1">
              <AccountSummary
                debtMinor={debt}
                enabled={
                  accounts.filter((account) => account.creditEnabled).length
                }
                owing={
                  accounts.filter((account) => Number(account.balanceMinor) > 0)
                    .length
                }
              />
            </div>
          </>
        )}
        {active &&
          toolbarTarget &&
          createPortal(
            <div className="flex flex-wrap items-center gap-2">
              <nav
                aria-label="Apartados de cuenta corriente"
                className="flex gap-2"
              >
                {(
                  [
                    ["clients", "Clientes"],
                    ["due", "Vencimientos"],
                  ] as const
                ).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    disabled={busy}
                    aria-current={screen === value ? "page" : undefined}
                    onClick={() => {
                      if (value === "due") setVisitedDueScope(dueScope);
                      setScreen(value);
                    }}
                    className={`inline-flex h-11 items-center gap-2 rounded-lg border px-3 text-sm font-medium shadow-sm ${screen === value ? "border-teal-200 bg-teal-50 text-teal-800" : "border-slate-300 bg-white text-slate-500 hover:bg-slate-50"}`}
                  >
                    {value === "clients" ? (
                      <Users size={16} />
                    ) : (
                      <CalendarClock size={16} />
                    )}
                    {label}
                  </button>
                ))}
              </nav>
            </div>,
            toolbarTarget,
          )}
      </div>
      <div className={screen === "due" ? "min-w-0" : "hidden"}>
        {(screen === "due" || visitedDueScope === dueScope) && (
          <AccountDueDates
            key={`${organizationId}:${branchId}`}
            token={token}
            organizationId={organizationId}
            branchId={branchId}
            revision={dueRevision}
            active={active && screen === "due"}
            onCustomer={openDueCollection}
          />
        )}
      </div>
      <div
        className={
          screen === "clients" ? "account-client-panel min-w-0" : "hidden"
        }
      >
        <section
          data-collecting={tab === "movements" && Boolean(selected)}
          className="account-customer-detail min-w-0 rounded-xl border border-slate-200 bg-white p-4 shadow-sm lg:p-5"
        >
          {selected ? (
            <>
              <div className="account-customer-heading">
                <AccountCustomerProfile account={selected} />
              </div>
              <div className="account-customer-tabs mt-5 flex flex-wrap gap-4 border-b border-slate-200">
                {(
                  [
                    ["movements", "Cobrar"],
                    ["due", "Vencimientos"],
                    ["history", "Historial"],
                    ["credit", "Configurar crédito"],
                  ] as const
                ).map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => {
                      setDueSelection(undefined);
                      setTab(key);
                    }}
                    className={`border-b-2 px-1 pb-3 text-sm ${tab === key ? "border-teal-600 font-semibold text-teal-700" : "border-transparent text-slate-500"}`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {tab === "due" ? (
                <div className="account-customer-due mt-4">
                  <AccountDueDates
                    key={`${branchId}-${selected.id}`}
                    token={token}
                    organizationId={organizationId}
                    branchId={branchId}
                    customerId={selected.id}
                    active={active}
                    revision={dueRevision}
                    onCustomer={(id, saleId) => {
                      setDueSelection({ customerId: id, saleId });
                      setSelectionValid(false);
                      setCollectionError("");
                      setSelectionVersion((value) => value + 1);
                      setCollectionModal(false);
                      setTab("movements");
                    }}
                  />
                </div>
              ) : tab === "credit" ? (
                <form
                  className="mt-5 space-y-5"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void save("credit");
                  }}
                >
                  <div className="grid items-stretch gap-4 xl:grid-cols-[0.95fr_1.05fr]">
                    <div className="grid min-w-0 gap-4 xl:grid-rows-[0.8fr_1fr]">
                      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                        <div className="mb-3 flex items-center gap-3">
                          <span className="rounded-full bg-teal-50 p-2 text-teal-700">
                            <ShieldCheck size={20} />
                          </span>
                          <div>
                            <h3 className="text-base font-semibold text-slate-800">
                              Estado del crédito
                            </h3>
                          </div>
                        </div>
                        <div
                          className={`flex items-center justify-between gap-4 rounded-lg border px-3 py-2.5 ${enabled ? "border-teal-100 bg-teal-50/60" : "border-slate-200 bg-slate-50/60"}`}
                        >
                          <div className="flex items-center gap-3">
                            <div>
                              <h3 className="text-sm font-semibold text-slate-800">
                                Compras a cuenta corriente
                              </h3>
                              <p className="mt-1 text-xs text-slate-500">
                                {enabled
                                  ? "El cliente puede financiar sus compras."
                                  : "Habilitá el crédito para permitir nuevas compras."}
                              </p>
                            </div>
                          </div>
                          <button
                            type="button"
                            role="switch"
                            aria-checked={enabled}
                            aria-label="Habilitar compras a cuenta corriente"
                            disabled={busy || !selected.active}
                            onClick={() => setEnabled(!enabled)}
                            className={`relative h-7 w-12 shrink-0 rounded-full border-0 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-2 disabled:opacity-50 ${enabled ? "bg-teal-600" : "bg-slate-300"}`}
                          >
                            <span
                              className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow-sm transition-all ${enabled ? "left-6" : "left-1"}`}
                            />
                          </button>
                        </div>
                      </section>
                      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                        <div className="mb-5 flex items-center gap-3">
                          <span className="rounded-full bg-blue-50 p-3 text-blue-600">
                            <CalendarClock size={22} />
                          </span>
                          <div>
                            <h3 className="text-base font-semibold text-slate-800">
                              Condiciones
                            </h3>
                            <p className="mt-1 text-xs text-slate-500">
                              Plazo de pago para las nuevas ventas.
                            </p>
                          </div>
                        </div>
                        <AccountPaymentTerm
                          key={selected.id}
                          value={termDays}
                          onChange={setTermDays}
                          disabled={busy}
                        />
                      </section>
                    </div>
                    <fieldset
                      disabled={busy}
                      className="min-w-0 rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
                    >
                      <legend className="sr-only">Tipo de crédito</legend>
                      <div className="mb-5 flex items-center gap-3">
                        <span className="rounded-full bg-teal-50 p-3 text-teal-700">
                          <CircleDollarSign size={22} />
                        </span>
                        <div>
                          <h3 className="text-base font-semibold text-slate-800">
                            Tipo de crédito
                          </h3>
                          <p className="mt-1 text-xs text-slate-500">
                            Definí cuánto puede adeudar el cliente.
                          </p>
                        </div>
                      </div>
                      <div className="mb-5 grid grid-cols-2 gap-3">
                        {[
                          {
                            value: false,
                            title: "Con límite",
                            description: "Establecé un máximo de deuda.",
                            icon: CircleDollarSign,
                          },
                          {
                            value: true,
                            title: "Sin límite",
                            description: "Compras sin un tope de crédito.",
                            icon: InfinityIcon,
                          },
                        ].map(({ value, title, description, icon: Icon }) => (
                          <label
                            key={title}
                            className={`relative flex cursor-pointer flex-col items-start gap-2 rounded-xl border p-4 text-sm transition-colors focus-within:ring-2 focus-within:ring-teal-100 ${unlimited === value ? "border-teal-500 bg-teal-50/60 text-teal-800" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}
                          >
                            <input
                              className="absolute right-3 top-3 h-4 w-4 accent-teal-700"
                              type="radio"
                              name="credit-limit-mode"
                              checked={unlimited === value}
                              onChange={() => setUnlimited(value)}
                            />
                            <Icon size={24} className="mb-1 text-teal-600" />
                            <span className="font-semibold">{title}</span>
                            <span className="text-xs leading-5 text-slate-500">
                              {description}
                            </span>
                          </label>
                        ))}
                      </div>
                      {!unlimited ? (
                        <label className="block text-sm font-medium text-slate-700">
                          Límite autorizado ($)
                          <input
                            className={field}
                            type="number"
                            min="0"
                            step="any"
                            required
                            value={limit}
                            placeholder="Ej. 50000"
                            onChange={(event) => setLimit(event.target.value)}
                          />
                          <span className="mt-2 block text-xs font-normal text-slate-500">
                            Con $0 no se autorizan nuevas compras a crédito.
                          </span>
                        </label>
                      ) : (
                        <p className="flex items-start gap-2 text-xs leading-5 text-slate-500">
                          <InfinityIcon size={16} /> No se aplicará un tope de
                          deuda mientras el crédito esté habilitado.
                        </p>
                      )}
                      <div className="mt-5 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-4">
                        <span className="text-xs text-slate-500">
                          Saldo actual del cliente
                        </span>
                        <strong className="text-base font-semibold text-slate-800 tabular-nums">
                          {money(selected.balanceMinor)}
                        </strong>
                      </div>
                    </fieldset>
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-4 border-t border-slate-100 pt-4">
                    <p className="max-w-md text-xs leading-5 text-slate-500">
                      Deshabilitar el crédito conserva el historial y permite
                      cobrar deudas pendientes.
                    </p>
                    <button
                      className={`${button} inline-flex items-center gap-2`}
                      disabled={busy}
                    >
                      <Check size={16} />
                      {busy ? "Guardando..." : "Guardar cambios"}
                    </button>
                  </div>
                </form>
              ) : (
                <>
                  {tab === "movements" && !collectionModal && collectionForm}
                  {tab === "history" && (
                    <section className="account-history-panel flex min-h-0 flex-1 flex-col">
                      <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
                        <h3 className="font-semibold">
                          Historial de movimientos
                        </h3>
                        <div
                          role="group"
                          aria-label="Filtrar historial de cuenta"
                          className="ml-auto inline-flex shrink-0 gap-1 rounded-lg bg-slate-100 p-1"
                        >
                          {(
                            [
                              { id: "all", label: "Todos" },
                              { id: "sales", label: "Ventas" },
                              { id: "receipts", label: "Cobros" },
                            ] as const
                          ).map((option) => (
                            <button
                              key={option.id}
                              type="button"
                              aria-pressed={historyFilter === option.id}
                              onClick={() => setHistoryFilter(option.id)}
                              className={`inline-flex items-center gap-2 rounded-md px-4 py-2 text-xs font-medium transition-colors ${historyFilter === option.id ? "bg-white text-teal-800 shadow-sm" : "text-slate-500 hover:text-slate-800"}`}
                            >
                              {option.id === "receipts" ? (
                                <Check size={14} />
                              ) : (
                                <ReceiptText size={14} />
                              )}
                              {option.label}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div className="mt-3 max-h-[55vh] overflow-auto">
                        <table className="w-full text-left text-sm">
                          <thead className="bg-slate-50 text-xs text-slate-500">
                            <tr>
                              <th className="px-3 py-2">Fecha</th>
                              <th className="px-3 py-2">Detalle</th>
                              <th className="px-3 py-2 text-right">Debe</th>
                              <th className="px-3 py-2 text-right">Haber</th>
                              <th className="w-px px-3 py-2 text-center">
                                Acciones
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            {historyPageRows.map((movement) => (
                              <Fragment key={movement.id}>
                                <tr
                                  key={movement.id}
                                  className="border-b border-slate-100"
                                >
                                  <td className="px-3 py-2 whitespace-nowrap">
                                    {new Date(
                                      movement.createdAt,
                                    ).toLocaleString("es-AR")}
                                  </td>
                                  <td className="px-3 py-2">
                                    {movement.isPriceAdjustment ||
                                    movement.isDebtAdjustment
                                      ? "Ajuste de deuda"
                                      : movement.type === "DEBIT"
                                        ? "Venta a cuenta corriente"
                                        : movement.saleId
                                          ? "Anulación de venta"
                                          : `Cobro · ${movement.paymentMethod === "CASH" ? "Efectivo" : movement.paymentMethod === "CARD" ? "Tarjeta" : movement.paymentMethod === "OTHER" ? "Pago mixto" : "Transferencia"}`}
                                    <span className="block text-xs text-slate-500">
                                      {movement.isPriceAdjustment ||
                                      movement.isDebtAdjustment
                                        ? movement.note
                                        : movement.saleId
                                          ? `Compra · ${movement.saleId.slice(0, 8).toUpperCase()}`
                                          : movement.note}
                                    </span>
                                  </td>
                                  <td className="px-3 py-2 text-right">
                                    {movement.type === "DEBIT"
                                      ? money(movement.amountMinor)
                                      : "—"}
                                  </td>
                                  <td className="px-3 py-2 text-right text-teal-700">
                                    {movement.type === "CREDIT"
                                      ? money(movement.amountMinor)
                                      : "—"}
                                  </td>
                                  <td className="px-3 py-2 text-right whitespace-nowrap">
                                    {movement.saleId && (
                                      <button
                                        type="button"
                                        aria-expanded={
                                          expandedMovement === movement.id
                                        }
                                        onClick={() =>
                                          setExpandedMovement(
                                            expandedMovement === movement.id
                                              ? ""
                                              : movement.id,
                                          )
                                        }
                                        className="inline-flex items-center gap-1.5 rounded-lg border border-teal-200 bg-teal-50 px-2.5 py-1.5 text-xs font-medium text-teal-700 hover:bg-teal-100"
                                      >
                                        <ReceiptText size={14} />
                                        {expandedMovement === movement.id
                                          ? "Cerrar detalle"
                                          : "Ver detalle"}
                                      </button>
                                    )}
                                    {movement.type === "CREDIT" &&
                                      !movement.saleId && (
                                        <button
                                          type="button"
                                          onClick={() =>
                                            void printReceipt(movement.id)
                                          }
                                          className="inline-flex items-center gap-1.5 rounded-lg border border-teal-200 bg-teal-50 px-2.5 py-1.5 text-xs font-medium text-teal-700 hover:bg-teal-100"
                                        >
                                          <Printer size={14} /> Imprimir ticket
                                        </button>
                                      )}
                                  </td>
                                </tr>
                                {expandedMovement === movement.id && (
                                  <tr>
                                    <td
                                      colSpan={5}
                                      className="bg-slate-50/70 p-4"
                                    >
                                      <PurchaseDetail
                                        token={token}
                                        organizationId={organizationId}
                                        branchId={branchId}
                                        customerId={selected.id}
                                        movementId={movement.id}
                                      />
                                    </td>
                                  </tr>
                                )}
                              </Fragment>
                            ))}
                          </tbody>
                        </table>
                        {selected.movements.length > 0 &&
                          !historyRows.length && (
                            <p className="py-10 text-center text-sm text-slate-500">
                              No hay{" "}
                              {historyFilter === "receipts"
                                ? "cobros"
                                : "ventas"}{" "}
                              para mostrar.
                            </p>
                          )}
                        {!selected.movements.length && (
                          <div className="flex flex-col items-center py-10 text-center">
                            <span className="mb-3 rounded-full bg-slate-50 p-4 text-slate-400">
                              <ReceiptText size={25} />
                            </span>
                            <p className="text-sm font-medium text-slate-700">
                              Esta cuenta todavía no tiene movimientos
                            </p>
                            <p className="mt-1 max-w-sm text-xs leading-5 text-slate-500">
                              {selected.creditEnabled
                                ? "Las compras financiadas y los cobros aparecerán acá."
                                : "Configurá el crédito para comenzar a operar con este cliente."}
                            </p>
                            {!selected.creditEnabled && (
                              <button
                                type="button"
                                onClick={() => setTab("credit")}
                                className="mt-4 rounded-lg border border-teal-200 bg-teal-50 px-4 py-2 text-sm font-medium text-teal-700"
                              >
                                Configurar crédito
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                      <Pagination
                        compact
                        total={historyRows.length}
                        currentPage={historyPage}
                        totalPages={historyPages}
                        noun="movimientos"
                        label="Páginas del historial de cuenta corriente"
                        onChange={(page) =>
                          setHistoryPagination({ scope: historyScope, page })
                        }
                      />
                    </section>
                  )}
                </>
              )}
            </>
          ) : (
            <p className="py-12 text-center text-slate-500">
              Seleccioná un cliente para ver su cuenta.
            </p>
          )}
        </section>
      </div>
    </div>
  );
}

function PaymentConfirmedDialog({
  receipt,
  onClose,
  onPrint,
}: {
  receipt: { id: string; customerName: string; amountMinor: string };
  onClose: () => void;
  onPrint: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);
  return (
    <dialog
      ref={dialog}
      onCancel={onClose}
      aria-labelledby="payment-confirmed-title"
      className="m-auto w-[calc(100%-2rem)] max-w-md rounded-2xl border border-slate-200 bg-white p-6 text-slate-900 shadow-2xl backdrop:bg-slate-950/35 backdrop:backdrop-blur-sm"
    >
      <div className="flex size-12 items-center justify-center rounded-full bg-teal-100 text-teal-700">
        <ShieldCheck size={25} />
      </div>
      <h2 id="payment-confirmed-title" className="mt-4 text-xl font-semibold">
        Cobro confirmado
      </h2>
      <p className="mt-2 text-sm text-slate-600">
        Se registró correctamente un cobro de {money(receipt.amountMinor)}.
      </p>
      <div className="mt-5 rounded-xl bg-slate-50 p-4 text-sm">
        <div className="flex justify-between gap-3">
          <span className="text-slate-500">Cliente</span>
          <span className="text-right font-medium">{receipt.customerName}</span>
        </div>
        <div className="mt-2 flex justify-between gap-3">
          <span className="text-slate-500">Comprobante de pago</span>
          <span className="font-mono text-xs">
            {receipt.id.slice(0, 8).toUpperCase()}
          </span>
        </div>
      </div>
      <p className="mt-4 text-xs text-slate-500">
        Podés imprimir el ticket ahora o reimprimirlo desde Historial. Es un
        comprobante interno, no una factura fiscal.
      </p>
      <div className="mt-6 grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={onClose}
          className="border border-slate-300 py-2.5 text-sm font-medium text-slate-700"
        >
          Cerrar
        </button>
        <button
          type="button"
          onClick={onPrint}
          className="bg-teal-700 py-2.5 text-sm font-semibold text-white"
        >
          Imprimir ticket
        </button>
      </div>
    </dialog>
  );
}

function PurchaseDetail({
  token,
  organizationId,
  branchId,
  customerId,
  movementId,
}: {
  token: string;
  organizationId: string;
  branchId: string;
  customerId: string;
  movementId: string;
}) {
  const scope = `${organizationId}:${branchId}:${customerId}:${movementId}`;
  const [snapshot, setSnapshot] = useState<{
    scope: string;
    detail: AccountSaleDetail;
  }>();
  const detail = snapshot?.scope === scope ? snapshot.detail : undefined;
  const [failure, setFailure] = useState("");
  useEffect(() => {
    let active = true;
    setFailure("");
    void getAccountSaleDetail(
      token,
      organizationId,
      branchId,
      customerId,
      movementId,
    )
      .then((result) => {
        if (active) setSnapshot({ scope, detail: result });
      })
      .catch((cause: unknown) => {
        if (active)
          setFailure(
            cause instanceof Error
              ? cause.message
              : "No se pudo cargar la compra.",
          );
      });
    return () => {
      active = false;
    };
  }, [token, organizationId, branchId, customerId, movementId, scope]);
  if (failure)
    return (
      <p role="alert" className="text-sm text-rose-600">
        {failure}
      </p>
    );
  if (!detail)
    return (
      <p role="status" className="text-sm text-slate-500">
        Cargando detalle de la compra...
      </p>
    );
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h4 className="font-semibold text-slate-800">
          Detalle de compra · {detail.id.slice(0, 8).toUpperCase()}
        </h4>
        <span className="text-xs text-slate-500">
          {detail.completedAt
            ? new Date(detail.completedAt).toLocaleString("es-AR")
            : ""}
          {detail.status === "CANCELLED" ? " · Anulada" : ""}
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-100 text-xs text-slate-500">
            <tr>
              <th className="px-2 py-2 text-left">Producto</th>
              <th className="px-2 py-2 text-right">Cantidad</th>
              <th className="px-2 py-2 text-right">Precio unit.</th>
              <th className="px-2 py-2 text-right">Descuento</th>
              <th className="px-2 py-2 text-right">Subtotal</th>
            </tr>
          </thead>
          <tbody>
            {detail.items.map((item) => (
              <tr key={item.id} className="border-b border-slate-100">
                <td className="px-2 py-3">{item.name}</td>
                <td className="px-2 py-3 text-right">{item.quantity}</td>
                <td className="whitespace-nowrap px-2 py-3 text-right">
                  {money(item.unitPriceMinor)}
                </td>
                <td className="whitespace-nowrap px-2 py-3 text-right">
                  {money(item.discountMinor)}
                </td>
                <td className="whitespace-nowrap px-2 py-3 text-right font-medium">
                  {money(item.subtotalMinor)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-4 flex flex-wrap justify-end gap-6 text-sm">
        <span>
          Total de compra: <strong>{money(detail.totalMinor)}</strong>
        </span>
        <span className="text-teal-700">
          A cuenta corriente:{" "}
          <strong>{money(detail.accountAmountMinor)}</strong>
        </span>
      </div>
    </section>
  );
}
