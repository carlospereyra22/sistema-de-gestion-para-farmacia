import { useEffect, useRef, useState } from "react";
import { discountDraft, parseDiscountDraft } from "./lib/discount-editor";
import { amountTypingSuffix, formatAmountTyping } from "./lib/amount-typing";

// "1.000,50" con puntos de miles; vacío si no hay descuento.
const amountText = (minor: number) =>
  minor ? formatAmountTyping(discountDraft(minor)) : "";
import { percentToDiscountMinor } from "./lib/sale-discount-percent";

type Mode = "percent" | "amount";

const money = (minor: number) =>
  new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS" }).format(
    minor / 100,
  );

// El backend recibe siempre un importe: el porcentaje se convierte antes de aplicar.
// Se aplica mientras se escribe; un texto inválido espera y se corrige al salir.
export function SaleGeneralDiscount({
  subtotalMinor,
  discountMinor,
  totalDiscountMinor,
  disabled,
  onApply,
  onInvalid,
}: {
  subtotalMinor: number;
  discountMinor: number;
  totalDiscountMinor: number;
  disabled: boolean;
  onApply: (discountMinor: number) => void;
  onInvalid: (message: string) => void;
}) {
  const [mode, setMode] = useState<Mode>("percent");
  const [draft, setDraft] = useState("");
  const [editing, setEditing] = useState(false);
  const beforeEditing = useRef("");
  const cancelling = useRef(false);
  const target = (value: string) => {
    const next =
      mode === "percent"
        ? percentToDiscountMinor(value, subtotalMinor)
        : parseDiscountDraft(value);
    return next !== undefined && next <= subtotalMinor ? next : undefined;
  };
  useEffect(() => {
    if (editing) return;
    if (mode === "amount") setDraft(amountText(discountMinor));
    else if (!discountMinor) setDraft("");
  }, [discountMinor, mode, editing]);
  // En % también se recalcula si cambia el subtotal (se agregan o quitan productos).
  useEffect(() => {
    const next = target(draft);
    if (next !== undefined && next !== discountMinor) onApply(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft, mode, subtotalMinor]);
  return (
    <div className="sale-general-discount">
      <p className="text-xs font-semibold text-slate-700">Descuento general</p>
      <div className="mt-1.5 flex items-center gap-1.5">
        <div
          role="group"
          aria-label="Tipo de descuento"
          className="flex h-9 rounded-lg bg-slate-100 p-0.5"
        >
          {(
            [
              ["percent", "%"],
              ["amount", "$"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              aria-pressed={mode === value}
              aria-label={
                value === "percent"
                  ? "Descuento en porcentaje"
                  : "Descuento en pesos"
              }
              disabled={disabled}
              onClick={() => {
                setMode(value);
                setDraft(value === "amount" ? amountText(discountMinor) : "");
              }}
              className={`w-8 rounded-md text-sm font-semibold ${mode === value ? "bg-white text-teal-800 shadow-sm" : "text-slate-500"}`}
            >
              {label}
            </button>
          ))}
        </div>
        <label className="sale-general-discount-field flex h-9 w-28 items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 text-sm tabular-nums focus-within:border-[#31826a]">
          {mode === "amount" && (
            <span aria-hidden className="text-slate-500">
              $
            </span>
          )}
          <input
            aria-label={
              mode === "percent"
                ? "Porcentaje de descuento general"
                : "Importe de descuento general"
            }
            type="text"
            inputMode="decimal"
            disabled={disabled}
            value={draft}
            placeholder={mode === "amount" ? "0,00" : "0"}
            onFocus={(event) => {
              beforeEditing.current = draft;
              setEditing(true);
              event.currentTarget.select();
            }}
            onBlur={() => {
              setEditing(false);
              if (cancelling.current) {
                cancelling.current = false;
                return;
              }
              if (target(draft) !== undefined) return;
              onInvalid(
                mode === "percent"
                  ? "Indicá un porcentaje entre 0 y 100."
                  : "Indicá un descuento válido que no supere el subtotal.",
              );
              setDraft(beforeEditing.current);
            }}
            onChange={(event) =>
              setDraft(
                mode === "amount"
                  ? formatAmountTyping(event.target.value)
                  : event.target.value,
              )
            }
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.ctrlKey) {
                event.preventDefault();
                event.stopPropagation();
                event.currentTarget.blur();
              }
              // Escape vuelve al valor que había antes de editar.
              if (event.key === "Escape") {
                event.preventDefault();
                event.stopPropagation();
                cancelling.current = true;
                setDraft(beforeEditing.current);
                setEditing(false);
                event.currentTarget.blur();
              }
            }}
            className="min-w-0 flex-1 bg-transparent text-right outline-none disabled:opacity-50"
          />
          {mode === "amount" && (
            <span aria-hidden className="-ml-1 text-slate-300">
              {amountTypingSuffix(draft)}
            </span>
          )}
          {mode === "percent" && (
            <span aria-hidden className="text-slate-500">
              %
            </span>
          )}
        </label>
        {totalDiscountMinor > 0 ? (
          <span
            aria-live="polite"
            className="ml-1 whitespace-nowrap text-sm font-semibold tabular-nums text-teal-700"
            title="Descuento total de la venta (general y por producto)"
          >
            <span className="font-normal text-slate-500">Total </span>−
            {money(totalDiscountMinor)}
          </span>
        ) : null}
      </div>
    </div>
  );
}
