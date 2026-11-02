import { useEffect, useState } from "react";
import { discountDraft, parseDiscountDraft } from "./lib/discount-editor";
import { percentToDiscountMinor } from "./lib/sale-discount-percent";

type Mode = "percent" | "amount";

// El backend recibe siempre un importe: el porcentaje se convierte antes de aplicar.
export function SaleGeneralDiscount({
  subtotalMinor,
  discountMinor,
  disabled,
  onApply,
  onInvalid,
}: {
  subtotalMinor: number;
  discountMinor: number;
  disabled: boolean;
  onApply: (discountMinor: number) => void;
  onInvalid: (message: string) => void;
}) {
  const [mode, setMode] = useState<Mode>("percent");
  const [draft, setDraft] = useState("");
  const [editing, setEditing] = useState(false);
  useEffect(() => {
    if (editing) return;
    if (mode === "amount") setDraft(discountDraft(discountMinor));
    else if (!discountMinor) setDraft("");
  }, [discountMinor, mode, editing]);
  const apply = () => {
    const next =
      mode === "percent"
        ? percentToDiscountMinor(draft, subtotalMinor)
        : parseDiscountDraft(draft);
    if (next === undefined || next > subtotalMinor) {
      onInvalid(
        mode === "percent"
          ? "Indicá un porcentaje entre 0 y 100."
          : "Indicá un descuento válido que no supere el subtotal.",
      );
      return;
    }
    if (next !== discountMinor) onApply(next);
  };
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
                setDraft(
                  value === "amount" ? discountDraft(discountMinor) : "",
                );
              }}
              className={`w-8 rounded-md text-sm font-semibold ${mode === value ? "bg-white text-teal-800 shadow-sm" : "text-slate-500"}`}
            >
              {label}
            </button>
          ))}
        </div>
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
          placeholder="0"
          onFocus={(event) => {
            setEditing(true);
            event.currentTarget.select();
          }}
          onBlur={() => setEditing(false)}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.ctrlKey) {
              event.preventDefault();
              event.stopPropagation();
              apply();
              event.currentTarget.blur();
            }
            if (event.key === "Escape") {
              event.preventDefault();
              event.stopPropagation();
              setDraft(mode === "amount" ? discountDraft(discountMinor) : "");
              event.currentTarget.blur();
            }
          }}
          className="h-9 w-24 rounded-lg border border-slate-200 bg-white px-2.5 text-right text-sm tabular-nums disabled:opacity-50"
        />
      </div>
    </div>
  );
}
