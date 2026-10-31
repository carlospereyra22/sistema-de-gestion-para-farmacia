import { useState } from "react";
import { parsePrice } from "./lib/price-lists-api";

export function ListPriceInput({
  name,
  amount,
  disabled,
  onChange,
}: {
  name: string;
  amount?: string | null;
  disabled: boolean;
  onChange: (amount: string | null) => void;
}) {
  const [focused, setFocused] = useState(false);
  const [text, setText] = useState("");
  const display =
    amount == null
      ? ""
      : new Intl.NumberFormat("es-AR", {
          style: "currency",
          currency: "ARS",
        }).format(Number(amount) / 100);
  return (
    <input
      aria-label={`Nuevo precio de ${name}`}
      inputMode="decimal"
      disabled={disabled}
      placeholder="—"
      className={`h-9 w-36 rounded-lg border px-3 text-right text-sm tabular-nums disabled:opacity-50 ${amount == null ? "border-slate-200 bg-transparent text-slate-700" : "border-teal-200 bg-teal-50 text-teal-800 font-medium"}`}
      value={focused ? text : display}
      onFocus={() => {
        setFocused(true);
        setText(
          amount == null
            ? ""
            : (Number(amount) / 100).toFixed(2).replace(".", ","),
        );
      }}
      onChange={(event) => {
        const next = event.target.value;
        if (!/^\d{0,10}(?:[.,]\d{0,2})?$/.test(next)) return;
        if (!next) {
          setText("");
          onChange(null);
          return;
        }
        const normalized = next
          .replace(",", ".")
          .replace(/^\./, "0.")
          .replace(/\.$/, ".0");
        const parsed = parsePrice(normalized);
        if (parsed === null) return;
        setText(next);
        onChange(parsed);
      }}
      onBlur={() => setFocused(false)}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          event.currentTarget.blur();
        }
      }}
    />
  );
}
