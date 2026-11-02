import { useEffect, useId, useRef, type ReactNode } from "react";
import {
  ArrowLeftRight,
  Banknote,
  CreditCard,
  Trash2,
  UserRound,
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

const methodLabel = (method: SalesPaymentMethod) =>
  METHODS.find((item) => item.value === method)!.label;

const editableTarget = (target: EventTarget) =>
  target instanceof Element &&
  Boolean(
    target.closest(
      'input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"], [role="combobox"], [role="spinbutton"]',
    ),
  );

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
  const deliveredChange =
    method === "CASH" && dueMinor > 0 && receivedMinor !== undefined
      ? changeMinor(receivedMinor, dueMinor)
      : changeMinor(paidMinor, totalMinor);
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
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/35 p-4 backdrop-blur-sm">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="sale-checkout-title"
        // Alto fijo: la ventana no cambia de tamaño al sumar pagos o avisos; el cuerpo hace scroll.
        className="sale-checkout-dialog flex h-[min(580px,calc(100dvh-2rem))] w-full max-w-[700px] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
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
        <header className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-3">
          <div className="min-w-0">
            <h2 id="sale-checkout-title" className="text-lg font-semibold">
              Cobrar venta
            </h2>
            <p className="truncate text-xs text-slate-500">{summary}</p>
          </div>
          <button
            type="button"
            disabled={submitting}
            onClick={onClose}
            className="inline-flex h-9 shrink-0 items-center gap-2 rounded-lg border border-slate-200 px-3 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
          >
            Volver
            <kbd className="rounded border border-slate-300 px-1 text-[10px]">
              Esc
            </kbd>
          </button>
        </header>
        <div className="grid min-h-0 flex-1 content-start gap-5 overflow-y-auto px-5 py-4 sm:grid-cols-[210px_minmax(0,1fr)]">
          <div>
            <p className="text-sm font-semibold text-slate-700">
              Medio de pago
            </p>
            <div
              role="radiogroup"
              aria-label="Medio de pago"
              className="mt-2 grid gap-2"
            >
              {METHODS.map(({ value, label, key, Icon }) => {
                const disabled =
                  submitting || (value === "ACCOUNT" && !accountEnabled);
                const selected = method === value;
                return (
                  <button
                    key={value}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    disabled={disabled}
                    onClick={() => onMethod(value)}
                    className={`flex min-h-11 items-center gap-2.5 rounded-xl border px-2.5 text-left text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-45 ${selected ? "border-teal-600 bg-teal-50 text-teal-800 ring-1 ring-teal-600" : "border-slate-200 bg-white text-slate-700 hover:border-teal-200"}`}
                  >
                    <span
                      className={`grid size-[30px] shrink-0 place-items-center rounded-lg ${selected ? "bg-teal-100 text-teal-700" : "bg-slate-100 text-slate-500"}`}
                    >
                      <Icon size={16} aria-hidden="true" />
                    </span>
                    <span className="flex-1">{label}</span>
                    <kbd className="rounded border border-slate-300 px-1.5 text-[10px] text-slate-500">
                      {key}
                    </kbd>
                  </button>
                );
              })}
            </div>
            {!accountEnabled && (
              <p className="mt-2 text-[11px] leading-4 text-slate-500">
                Cuenta corriente: elegí un cliente con cuenta habilitada.
              </p>
            )}
            <p className="mt-5 text-sm font-semibold text-slate-700">
              Comprobante
            </p>
            <div className="mt-1">{documentChoice}</div>
          </div>
          <div className="min-w-0">
            <div className="rounded-xl bg-slate-50 px-4 py-3">
              <p className="text-xs font-semibold text-slate-600">
                Total a pagar
              </p>
              <p className="text-[28px] font-bold leading-9 tracking-tight tabular-nums text-[#087f70]">
                {money(totalMinor)}
              </p>
              <p className="text-xs text-slate-500">
                Subtotal {money(subtotalMinor)} · Descuento{" "}
                {money(discountMinor)}
              </p>
            </div>
            {paidMinor > 0 && paidMinor < totalMinor ? (
              <div className="mt-3">
                <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full rounded-full bg-[#087f70]"
                    style={{ width: `${(paidMinor / totalMinor) * 100}%` }}
                  />
                </div>
                <p className="mt-1.5 flex justify-between text-xs font-semibold">
                  <span className="text-teal-700">
                    Pagado {money(paidMinor)}
                  </span>
                  <span className="text-rose-700">Resta {money(dueMinor)}</span>
                </p>
              </div>
            ) : null}
            {payments.length ? (
              <div className="mt-3">
                <p className="text-xs font-semibold text-slate-700">Pagos</p>
                <ul className="mt-1.5 space-y-1.5">
                  {payments.map((payment) => (
                    <li
                      key={payment.method}
                      className="flex min-h-10 items-center gap-2 rounded-lg border border-slate-200 px-3 text-sm"
                    >
                      <span className="flex-1">
                        {methodLabel(payment.method)}
                      </span>
                      <span className="font-medium tabular-nums">
                        {money(payment.amountMinor)}
                      </span>
                      <button
                        type="button"
                        aria-label={`Quitar pago en ${methodLabel(payment.method)}`}
                        disabled={submitting}
                        onClick={() => onRemovePayment(payment.method)}
                        className="rounded p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-700"
                      >
                        <Trash2 size={14} />
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {showAmount ? (
              <div className="mt-4">
                <label
                  htmlFor={amountId}
                  className="block text-sm font-semibold text-slate-700"
                >
                  {method === "CASH" ? "Efectivo recibido" : "Importe a cobrar"}
                  {paidMinor > 0 ? ` · resta ${money(dueMinor)}` : ""}
                </label>
                <div className="sale-checkout-amount mt-1.5 grid h-12 grid-cols-[40px_minmax(0,1fr)_auto] overflow-hidden rounded-xl border border-teal-400 bg-white focus-within:ring-2 focus-within:ring-teal-200">
                  <span className="grid place-items-center border-r bg-slate-50 text-xl font-semibold text-slate-500">
                    $
                  </span>
                  {/* Alineado a la derecha: los centavos que faltan se ven en gris. */}
                  <span className="flex min-w-0 items-center pr-3 text-xl font-semibold tabular-nums">
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
                      className="min-w-0 flex-1 border-0 bg-transparent pl-3 text-right outline-none"
                    />
                    <span aria-hidden className="text-slate-300">
                      {amountTypingSuffix(amount)}
                    </span>
                  </span>
                  <button
                    type="button"
                    disabled={submitting}
                    onClick={() => {
                      onAmount(cashAmountDraft(dueMinor));
                      amountInput.current?.focus();
                    }}
                    className="border-l border-slate-200 bg-slate-50 px-4 text-sm font-semibold text-teal-800 hover:bg-teal-50"
                  >
                    Exacto
                  </button>
                </div>
                <p className="mt-1 text-[11px] text-slate-500">
                  Enter confirma
                </p>
              </div>
            ) : null}
            {showAmount && method === "CASH" ? (
              <div
                aria-label="Montos rápidos"
                className="mt-2 flex flex-wrap gap-1.5"
              >
                {quickCashAmounts(dueMinor)
                  .slice(1)
                  .map((value) => (
                    <button
                      key={value}
                      type="button"
                      disabled={submitting}
                      onClick={() => {
                        onAmount(cashAmountDraft(value));
                        amountInput.current?.focus();
                      }}
                      className="h-8 rounded-full border border-slate-200 bg-white px-3 text-xs font-medium tabular-nums text-slate-700 hover:border-teal-300 hover:bg-teal-50"
                    >
                      {money(value)}
                    </button>
                  ))}
              </div>
            ) : null}
            {deliveredChange > 0 ? (
              <div
                aria-live="polite"
                className="mt-3 flex items-center justify-between rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sky-950"
              >
                <span className="font-semibold">Vuelto a entregar</span>
                <span className="text-2xl font-bold tabular-nums text-sky-700">
                  {money(deliveredChange)}
                </span>
              </div>
            ) : null}
            {showAmount &&
            receivedMinor !== undefined &&
            receivedMinor > 0 &&
            receivedMinor < dueMinor ? (
              <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
                <p className="text-sm text-amber-900">
                  Faltan{" "}
                  <strong className="tabular-nums">
                    {money(dueMinor - receivedMinor)}
                  </strong>
                  . ¿Con qué medio se completa?
                </p>
                <div className="mt-2 flex flex-wrap gap-1.5">
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
                      className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-amber-300 bg-white px-3 text-sm font-medium text-slate-700 hover:border-teal-400 hover:text-teal-800"
                    >
                      <Icon size={15} aria-hidden="true" />
                      {label}
                    </button>
                  ))}
                </div>
                <p className="mt-2 text-[11px] text-amber-800">
                  También podés apretar Enter: se registra{" "}
                  {money(receivedMinor)} en {methodLabel(method).toLowerCase()}{" "}
                  y queda el resto para cobrar.
                </p>
              </div>
            ) : null}
            {errorMessage ? (
              <p
                role="alert"
                className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800"
              >
                {errorMessage}
              </p>
            ) : null}
          </div>
        </div>
        <footer className="border-t border-slate-200 bg-slate-50 px-5 py-3">
          {sessionNotice ? (
            <p className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
              {sessionNotice}
            </p>
          ) : null}
          <div className="flex gap-3">
            <button
              type="button"
              disabled={submitting}
              onClick={onClose}
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-5 text-sm font-medium text-slate-700 disabled:opacity-50"
            >
              Volver
              <kbd className="rounded border border-slate-300 px-1 text-[10px]">
                Esc
              </kbd>
            </button>
            <button
              ref={confirmButton}
              type="button"
              disabled={confirmDisabled}
              onClick={onConfirm}
              className="inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-teal-700 text-base font-semibold text-white shadow-sm hover:bg-teal-800 disabled:bg-slate-400"
            >
              {submitting
                ? "Confirmando…"
                : errorMessage
                  ? "Reintentar"
                  : "Confirmar venta"}
              {!submitting && (
                <kbd className="rounded border border-white/50 px-1.5 text-[11px] font-medium">
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
