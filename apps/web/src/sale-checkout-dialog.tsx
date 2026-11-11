import { useEffect, useId, useRef, type ReactNode } from "react";
import {
  ArrowLeftRight,
  ArrowRight,
  Banknote,
  Check,
  CircleCheck,
  Coins,
  CreditCard,
  ShoppingBag,
  ShoppingCart,
  Tag,
  Trash2,
  TriangleAlert,
  UserRound,
  X,
} from "lucide-react";
import {
  cashAmountDraft,
  changeMinor,
  quickCashAmounts,
} from "./lib/sale-quick-amounts";
import { salesShortcut, type SalesPaymentMethod } from "./lib/sales-shortcuts";
import { amountTypingSuffix, formatAmountTyping } from "./lib/amount-typing";

const money = (minor: number) =>
  new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS" }).format(
    minor / 100,
  );

const METHODS = [
  { value: "CASH", label: "Efectivo", key: "1", Icon: Banknote },
  { value: "CARD", label: "Tarjeta", key: "2", Icon: CreditCard },
  { value: "TRANSFER", label: "Transferencia", key: "3", Icon: ArrowLeftRight },
  { value: "ACCOUNT", label: "Cuenta corriente", key: "4", Icon: UserRound },
] as const;

const methodOf = (method: SalesPaymentMethod) =>
  METHODS.find((item) => item.value === method)!;

const methodLabel = (method: SalesPaymentMethod) => methodOf(method).label;

const editableTarget = (target: EventTarget) =>
  target instanceof Element &&
  Boolean(
    target.closest(
      'input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"], [role="combobox"], [role="spinbutton"]',
    ),
  );

function TotalDetail({
  Icon,
  label,
  value,
}: {
  Icon: typeof ShoppingBag;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="grid size-11 shrink-0 place-items-center rounded-full bg-white text-teal-700 shadow-sm ring-1 ring-teal-100">
        <Icon size={19} aria-hidden="true" />
      </span>
      <div>
        <p className="text-xs text-slate-500">{label}</p>
        <p className="text-[15px] font-semibold tabular-nums text-slate-800">
          {value}
        </p>
      </div>
    </div>
  );
}

// Solo presenta el cobro: pagos, validaciones y confirmacion siguen en Ventas.
export function SaleCheckoutDialog({
  summary,
  subtotalMinor,
  discountMinor,
  totalMinor,
  paidMinor,
  payments,
  method,
  accountEnabled,
  amount,
  receivedMinor,
  documentChoice,
  sessionNotice,
  errorMessage,
  submitting,
  confirmDisabled,
  onMethod,
  onAmount,
  onRemovePayment,
  onSplit,
  onConfirm,
  onClose,
}: {
  summary: string;
  subtotalMinor: number;
  discountMinor: number;
  totalMinor: number;
  paidMinor: number;
  payments: { method: SalesPaymentMethod; amountMinor: number }[];
  method: SalesPaymentMethod;
  accountEnabled: boolean;
  amount: string;
  receivedMinor?: number;
  documentChoice: ReactNode;
  sessionNotice?: string;
  errorMessage?: string;
  submitting: boolean;
  confirmDisabled: boolean;
  onMethod: (method: SalesPaymentMethod) => void;
  onAmount: (value: string) => void;
  onRemovePayment: (method: SalesPaymentMethod) => void;
  onSplit: (nextMethod: SalesPaymentMethod) => void;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const amountInput = useRef<HTMLInputElement>(null);
  const amountId = useId();
  const dueMinor = Math.max(totalMinor - paidMinor, 0);
  const showAmount = method !== "ACCOUNT" && dueMinor > 0;
  const cashEntry = showAmount && method === "CASH";
  const deliveredChange =
    method === "CASH" && dueMinor > 0 && receivedMinor !== undefined
      ? changeMinor(receivedMinor, dueMinor)
      : changeMinor(paidMinor, totalMinor);
  const shortMinor =
    showAmount &&
    receivedMinor !== undefined &&
    receivedMinor > 0 &&
    receivedMinor < dueMinor
      ? dueMinor - receivedMinor
      : 0;
  const confirmButton = useRef<HTMLButtonElement>(null);
  // Sin campo de importe (cuenta corriente o ya cubierto), Enter confirma desde el botón.
  useEffect(() => {
    if (!amountInput.current) {
      confirmButton.current?.focus();
      return;
    }
    amountInput.current.focus();
    amountInput.current.select();
  }, [method, showAmount]);
  const setAmount = (minor: number) => {
    onAmount(cashAmountDraft(minor));
    amountInput.current?.focus();
  };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/35 p-4 backdrop-blur-sm">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="sale-checkout-title"
        // Alto según el contenido, compacto para no necesitar scroll en el caso
        // normal; con poca pantalla, encabezado, total y pie quedan quietos y
        // solo el cuerpo se desplaza.
        className="sale-checkout-dialog flex max-h-[calc(100dvh-2rem)] w-full max-w-[920px] flex-col overflow-hidden rounded-3xl bg-white shadow-2xl ring-1 ring-slate-200"
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            event.stopPropagation();
            if (!submitting) onClose();
            return;
          }
          const shortcut = salesShortcut(event.nativeEvent, {
            editing: editableTarget(event.target),
            blocked: submitting,
            checkoutOpen: true,
          });
          if (!shortcut) return;
          event.preventDefault();
          if (shortcut.action === "checkout") onConfirm();
          if (
            shortcut.action === "payment-method" &&
            (shortcut.method !== "ACCOUNT" || accountEnabled)
          )
            onMethod(shortcut.method);
        }}
      >
        <header className="flex items-center gap-4 border-b border-slate-100 px-7 py-4">
          <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-teal-700 text-white shadow-sm shadow-teal-900/20">
            <ShoppingCart size={24} aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1 border-l border-slate-200 pl-4">
            <h2
              id="sale-checkout-title"
              className="text-xl font-semibold leading-7 text-slate-900"
            >
              Cobrar venta
            </h2>
            <p className="truncate text-sm text-slate-500">{summary}</p>
          </div>
          <button
            type="button"
            aria-label="Volver"
            title="Volver (Esc)"
            disabled={submitting}
            onClick={onClose}
            className="grid size-10 shrink-0 place-items-center rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-50"
          >
            <X size={20} aria-hidden="true" />
          </button>
        </header>
        {sessionNotice ? (
          <p className="flex items-center justify-center gap-2 border-b border-amber-100 bg-amber-50/80 px-7 py-2 text-center text-xs font-medium text-amber-900">
            <TriangleAlert
              size={15}
              aria-hidden="true"
              className="shrink-0 text-amber-600"
            />
            {sessionNotice}
          </p>
        ) : null}

        {/* Total siempre visible; los pagos ya cargados se ven acá mismo para
            no sumar bloques al cuerpo. */}
        <div className="px-7 pt-4">
          <div className="rounded-2xl bg-gradient-to-br from-teal-50 via-emerald-50/70 to-white px-6 py-4 ring-1 ring-teal-100">
            <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
              <div>
                <p className="text-sm font-semibold text-slate-700">
                  Total a pagar
                </p>
                <p className="text-[36px] font-bold leading-10 tracking-tight tabular-nums text-teal-800">
                  {money(totalMinor)}
                </p>
              </div>
              <div className="flex flex-wrap gap-x-10 gap-y-2 sm:border-l sm:border-teal-100 sm:pl-8">
                <TotalDetail
                  Icon={ShoppingBag}
                  label="Subtotal"
                  value={money(subtotalMinor)}
                />
                <TotalDetail
                  Icon={Tag}
                  label="Descuento"
                  value={money(discountMinor)}
                />
              </div>
            </div>
            {payments.length ? (
              <div className="mt-3 border-t border-teal-100 pt-3">
                {paidMinor < totalMinor ? (
                  <div className="h-2 overflow-hidden rounded-full bg-white ring-1 ring-teal-100">
                    <div
                      className="h-full rounded-full bg-teal-600 transition-[width]"
                      style={{ width: `${(paidMinor / totalMinor) * 100}%` }}
                    />
                  </div>
                ) : null}
                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5">
                  <span className="text-xs font-semibold text-teal-700">
                    Pagado {money(paidMinor)}
                  </span>
                  <ul
                    aria-label="Pagos registrados"
                    className="flex flex-1 flex-wrap gap-1.5"
                  >
                    {payments.map((payment) => {
                      const { Icon } = methodOf(payment.method);
                      return (
                        <li
                          key={payment.method}
                          className="inline-flex h-7 items-center gap-1.5 rounded-full bg-white pl-2.5 pr-0.5 text-xs shadow-sm ring-1 ring-teal-100"
                        >
                          <Icon
                            size={13}
                            aria-hidden="true"
                            className="text-teal-700"
                          />
                          <span className="text-slate-600">
                            {methodLabel(payment.method)}
                          </span>
                          <span className="font-semibold tabular-nums text-slate-900">
                            {money(payment.amountMinor)}
                          </span>
                          <button
                            type="button"
                            aria-label={`Quitar pago en ${methodLabel(payment.method)}`}
                            disabled={submitting}
                            onClick={() => onRemovePayment(payment.method)}
                            className="grid size-6 place-items-center rounded-full text-slate-400 hover:bg-rose-50 hover:text-rose-700"
                          >
                            <Trash2 size={12} />
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                  {paidMinor < totalMinor ? (
                    <span className="text-xs font-semibold text-rose-700">
                      Resta {money(dueMinor)}
                    </span>
                  ) : null}
                </div>
              </div>
            ) : null}
          </div>
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-7 py-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Medio de pago
            </p>
            <div
              role="radiogroup"
              aria-label="Medio de pago"
              className="mt-2.5 grid grid-cols-2 gap-3 sm:grid-cols-4"
            >
              {METHODS.map(({ value, label, key, Icon }) => {
                const accountLocked = value === "ACCOUNT" && !accountEnabled;
                const selected = method === value;
                return (
                  <button
                    key={value}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    disabled={submitting || accountLocked}
                    title={
                      accountLocked
                        ? "Cuenta corriente: elegí un cliente con cuenta habilitada."
                        : undefined
                    }
                    onClick={() => onMethod(value)}
                    className={`flex min-h-12 items-center gap-2.5 rounded-xl border px-2.5 py-1.5 text-left text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-45 ${selected ? "border-teal-500 bg-teal-50 text-teal-900 shadow-sm ring-1 ring-teal-500" : "border-slate-200 bg-white text-slate-700 hover:border-teal-300 hover:bg-teal-50/40"}`}
                  >
                    <span
                      className={`grid size-9 shrink-0 place-items-center rounded-lg ${selected ? "bg-teal-600 text-white" : "bg-slate-100 text-slate-500"}`}
                    >
                      <Icon size={18} aria-hidden="true" />
                    </span>
                    <span className="min-w-0 flex-1 leading-tight">
                      {label}
                    </span>
                    <kbd
                      className={`grid size-5 shrink-0 place-items-center rounded border text-[10px] font-medium ${selected ? "border-teal-300 text-teal-700" : "border-slate-200 text-slate-400"}`}
                    >
                      {key}
                    </kbd>
                  </button>
                );
              })}
            </div>
          </div>

          {showAmount ? (
            <div className="rounded-2xl border border-slate-200 px-5 py-4">
              <div
                className={`grid gap-4 ${cashEntry || shortMinor > 0 ? "sm:grid-cols-[minmax(0,1fr)_250px]" : ""}`}
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-3">
                    <label
                      htmlFor={amountId}
                      className="shrink-0 text-sm font-semibold text-slate-800"
                    >
                      {method === "CASH"
                        ? "Efectivo recibido"
                        : "Importe a cobrar"}
                      {paidMinor > 0 ? (
                        <span className="font-normal text-slate-500">
                          {" "}
                          · resta {money(dueMinor)}
                        </span>
                      ) : null}
                    </label>
                    {/* Con importe parcial, Enter registra lo tipeado y deja
                        el resto para otro medio. */}
                    {shortMinor > 0 ? (
                      <p className="ml-auto flex min-w-0 items-center gap-1.5 whitespace-nowrap text-xs text-slate-500">
                        <kbd className="shrink-0 rounded-md border border-slate-300 bg-white px-1.5 text-[10px] font-semibold text-slate-600 shadow-sm">
                          Enter
                        </kbd>
                        <span className="truncate">
                          <strong className="font-semibold text-slate-700">
                            Registrar {money(receivedMinor ?? 0)}
                          </strong>{" "}
                          y seguir
                        </span>
                      </p>
                    ) : null}
                  </div>
                  <div className="sale-checkout-amount mt-2 grid h-14 grid-cols-[44px_minmax(0,1fr)_auto] overflow-hidden rounded-xl border border-teal-400 bg-white focus-within:ring-4 focus-within:ring-teal-100">
                    <span className="grid place-items-center text-lg font-semibold text-slate-500">
                      $
                    </span>
                    {/* Alineado a la derecha: los centavos que faltan se ven en gris. */}
                    <span className="flex min-w-0 items-center pr-4 text-[28px] font-bold tabular-nums text-slate-900">
                      <input
                        id={amountId}
                        ref={amountInput}
                        type="text"
                        inputMode="decimal"
                        disabled={submitting}
                        value={amount}
                        placeholder="0,00"
                        onChange={(event) =>
                          onAmount(formatAmountTyping(event.target.value))
                        }
                        onKeyDown={(event) => {
                          if (event.key === "Enter" && !event.ctrlKey) {
                            event.preventDefault();
                            onConfirm();
                          }
                          // El punto del teclado numérico también marca centavos.
                          if (event.key === "." && !amount.includes(",")) {
                            event.preventDefault();
                            onAmount(formatAmountTyping(`${amount},`));
                          }
                        }}
                        className="min-w-0 flex-1 border-0 bg-transparent pl-2 text-right outline-none"
                      />
                      <span aria-hidden className="text-slate-300">
                        {amountTypingSuffix(amount)}
                      </span>
                    </span>
                    <button
                      type="button"
                      disabled={submitting}
                      onClick={() => setAmount(dueMinor)}
                      className="border-l border-slate-200 px-5 text-sm font-semibold text-teal-800 hover:bg-teal-50"
                    >
                      Exacto
                    </button>
                  </div>
                  {cashEntry ? (
                    <div
                      aria-label="Montos rápidos"
                      className="mt-2.5 flex flex-wrap gap-2"
                    >
                      {quickCashAmounts(dueMinor).map((value) => (
                        <button
                          key={value}
                          type="button"
                          disabled={submitting}
                          onClick={() => setAmount(value)}
                          className={`h-8 rounded-full border px-3 text-xs font-medium tabular-nums transition-colors ${receivedMinor === value ? "border-teal-200 bg-teal-50 text-teal-800" : "border-slate-200 bg-white text-slate-700 hover:border-teal-300 hover:bg-teal-50"}`}
                        >
                          {money(value)}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
                {/* Mismo lugar para el vuelto o lo que falta: la ventana no crece. */}
                {/* Mismo panel para el vuelto o lo que falta: cambia el
                    contenido, no la forma, y la ventana no salta. */}
                {cashEntry || shortMinor > 0 ? (
                  <div
                    aria-live="polite"
                    className="flex flex-col justify-center rounded-xl bg-slate-50 px-4 py-3 ring-1 ring-slate-100"
                  >
                    <p className="flex items-center gap-1.5 text-sm font-semibold text-slate-600">
                      <Coins
                        size={16}
                        aria-hidden="true"
                        className={
                          shortMinor > 0
                            ? "text-amber-600"
                            : deliveredChange > 0
                              ? "text-teal-600"
                              : "text-slate-400"
                        }
                      />
                      {shortMinor > 0 ? "Faltan" : "Vuelto"}
                    </p>
                    <p
                      className={`mt-0.5 truncate text-[28px] font-bold leading-9 tabular-nums transition-colors ${shortMinor > 0 ? "text-amber-700" : deliveredChange > 0 ? "text-teal-700" : "text-slate-300"}`}
                    >
                      {money(shortMinor > 0 ? shortMinor : deliveredChange)}
                    </p>
                    {shortMinor > 0 ? (
                      <>
                        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-200">
                          <div
                            className="h-full rounded-full bg-amber-500 transition-[width]"
                            style={{
                              width: `${((dueMinor - shortMinor) / dueMinor) * 100}%`,
                            }}
                          />
                        </div>
                        <p className="mt-1 text-[11px] text-slate-500">
                          Recibido {money(dueMinor - shortMinor)} de{" "}
                          {money(dueMinor)}
                        </p>
                      </>
                    ) : null}
                  </div>
                ) : null}
              </div>
              {shortMinor > 0 ? (
                <div className="mt-3.5 border-t border-dashed border-slate-200 pt-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Completar{" "}
                    <span className="text-amber-700">{money(shortMinor)}</span>
                  </p>
                  <div className="mt-2 grid gap-2.5 sm:grid-cols-3">
                    {METHODS.filter(
                      (item) =>
                        item.value !== method &&
                        (item.value !== "ACCOUNT" || accountEnabled),
                    ).map(({ value, label, Icon }) => (
                      <button
                        key={value}
                        type="button"
                        disabled={submitting}
                        onClick={() => onSplit(value)}
                        className="group flex h-12 items-center gap-2.5 rounded-xl border border-slate-200 bg-white pl-2 pr-3 text-left transition hover:border-teal-400 hover:bg-teal-50/50 hover:shadow-sm disabled:opacity-50"
                      >
                        <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-slate-100 text-slate-500 transition-colors group-hover:bg-teal-600 group-hover:text-white">
                          <Icon size={16} aria-hidden="true" />
                        </span>
                        <span className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-800">
                          {label}
                        </span>
                        <ArrowRight
                          size={15}
                          aria-hidden="true"
                          className="shrink-0 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-teal-600"
                        />
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}

          {/* Cobro ya cubierto (por ejemplo, tras un pago mixto en efectivo). */}
          {!showAmount && dueMinor === 0 ? (
            <div
              aria-live="polite"
              className="flex flex-wrap items-center gap-3 rounded-2xl border border-teal-100 bg-teal-50/60 px-4 py-3"
            >
              <CircleCheck
                size={22}
                aria-hidden="true"
                className="text-teal-700"
              />
              <p className="flex-1 text-sm font-semibold text-teal-900">
                Cobro completo
              </p>
              {deliveredChange > 0 ? (
                <p className="text-sm text-slate-600">
                  Vuelto{" "}
                  <strong className="text-xl tabular-nums text-teal-800">
                    {money(deliveredChange)}
                  </strong>
                </p>
              ) : null}
            </div>
          ) : null}

          <div className="flex flex-wrap items-start gap-x-6 gap-y-2">
            <p className="w-28 pt-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
              Comprobante
            </p>
            <div className="min-w-0 flex-1">{documentChoice}</div>
          </div>

          {errorMessage ? (
            <p
              role="alert"
              className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm text-rose-800"
            >
              {errorMessage}
            </p>
          ) : null}
        </div>

        <footer className="border-t border-slate-100 bg-slate-50/70 px-7 py-4">
          <div className="flex gap-3">
            <button
              type="button"
              disabled={submitting}
              onClick={onClose}
              className="inline-flex min-h-[52px] items-center justify-center gap-2.5 rounded-xl border border-slate-200 bg-white px-6 text-base font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              Volver
              <kbd className="rounded-md border border-slate-300 px-1.5 text-[11px] text-slate-500">
                Esc
              </kbd>
            </button>
            <button
              ref={confirmButton}
              type="button"
              disabled={confirmDisabled}
              onClick={onConfirm}
              className="ml-auto inline-flex min-h-[52px] flex-1 items-center justify-center gap-2.5 rounded-xl bg-teal-700 px-6 text-base font-semibold text-white shadow-md shadow-teal-900/15 hover:bg-teal-800 disabled:bg-slate-400 disabled:shadow-none sm:max-w-[380px]"
            >
              {!submitting && <Check size={20} aria-hidden="true" />}
              {submitting
                ? "Confirmando…"
                : errorMessage
                  ? "Reintentar"
                  : "Confirmar venta"}
              {!submitting && (
                <kbd className="rounded-md border border-white/50 px-1.5 text-[11px] font-medium">
                  Enter
                </kbd>
              )}
            </button>
          </div>
        </footer>
      </section>
    </div>
  );
}
