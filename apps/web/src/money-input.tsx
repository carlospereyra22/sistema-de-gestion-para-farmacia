import type { ReactElement } from "react";
import { formatAmountTyping } from "./lib/amount-typing";

// Importe en pesos con el mismo bloque "$" del cobro, a la altura de los campos
// de formulario. El 0,00 es referencia: el campo vacío sigue siendo obligatorio
// para que nadie confirme un costo en cero sin querer.
export function MoneyInput({
  label,
  value,
  onChange,
  required = true,
  disabled = false,
  labelClassName = "mt-4 block text-sm",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  disabled?: boolean;
  labelClassName?: string;
}): ReactElement {
  return (
    <label className={labelClassName}>
      {label}
      <span className="money-input-field mt-1 grid h-10 grid-cols-[40px_minmax(0,1fr)] overflow-hidden rounded-lg border bg-white">
        <span
          aria-hidden
          className="grid place-items-center border-r border-slate-200 bg-slate-50 font-semibold text-slate-500"
        >
          $
        </span>
        <input
          type="text"
          inputMode="decimal"
          autoComplete="off"
          required={required}
          disabled={disabled}
          value={value}
          placeholder="0,00"
          onChange={(event) => onChange(formatAmountTyping(event.target.value))}
          onKeyDown={(event) => {
            // El punto del teclado numérico también marca centavos.
            if (event.key === "." && !value.includes(",")) {
              event.preventDefault();
              onChange(formatAmountTyping(`${value},`));
            }
          }}
          className="min-w-0 bg-transparent px-3 text-sm tabular-nums outline-none disabled:cursor-not-allowed disabled:text-slate-400"
        />
      </span>
    </label>
  );
}
