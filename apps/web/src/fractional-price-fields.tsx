import { useId } from "react";
export function FractionalPriceFields({
  enabled,
  linked,
  base,
  divisor,
  markup,
  result,
  disabled,
  onEnabled,
  onBase,
  onDivisor,
  onMarkup,
}: {
  enabled: boolean;
  linked: boolean;
  base: string;
  divisor: string;
  markup: string;
  result: string | null;
  disabled: boolean;
  onEnabled: (value: boolean) => void;
  onBase: (value: string) => void;
  onDivisor: (value: string) => void;
  onMarkup: (value: string) => void;
}) {
  const id = useId();
  const input =
    "mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-normal disabled:bg-slate-100";
  return (
    <fieldset
      disabled={disabled}
      className="mt-3 rounded-xl border border-teal-100 bg-teal-50/40 p-3"
    >
      <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-slate-800">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(event) => onEnabled(event.target.checked)}
          aria-controls={id}
        />{" "}
        Fraccionar precio
      </label>
      {enabled && (
        <div id={id} className="mt-3 space-y-3">
          <label className="block text-xs font-medium text-slate-600">
            {linked
              ? "Precio base de la referencia ($)"
              : "Precio base del pack ($)"}
            <input
              className={input}
              inputMode="decimal"
              value={base}
              disabled={linked || disabled}
              onChange={(event) => onBase(event.target.value)}
              placeholder="Ej. 12859,57"
            />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="text-xs font-medium text-slate-600">
              Dividir por
              <input
                className={input}
                inputMode="numeric"
                value={divisor}
                onChange={(event) => onDivisor(event.target.value)}
                placeholder="Ej. 2"
              />
            </label>
            <label className="text-xs font-medium text-slate-600">
              Recargo (%)
              <input
                className={input}
                inputMode="decimal"
                value={markup}
                onChange={(event) => onMarkup(event.target.value)}
                placeholder="0"
              />
            </label>
          </div>
          <div
            aria-live="polite"
            className="flex items-center justify-between gap-3 rounded-lg bg-white px-3 py-2 text-sm"
          >
            <span className="text-slate-600">Precio fraccionado</span>
            <strong className="text-teal-800">
              {result === null
                ? "Revisá los valores"
                : new Intl.NumberFormat("es-AR", {
                    style: "currency",
                    currency: "ARS",
                  }).format(Number(result) / 100)}
            </strong>
          </div>
          <p className="text-xs leading-relaxed text-slate-500">
            {linked
              ? "Se recalcula automáticamente cuando cambia la referencia, manteniendo el divisor y el recargo."
              : "Se recalcula cuando cambiás el precio base manual."}{" "}
            Solo modifica el precio; no divide el stock.
          </p>
        </div>
      )}
    </fieldset>
  );
}
