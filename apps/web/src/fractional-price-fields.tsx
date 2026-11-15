import { OptionToggle } from "./option-toggle";

type FractionalPriceProps = {
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
};

export const FRACTIONAL_PRICE_OPTIONS_ID = "opciones-fraccionar-precio";

export function FractionalPriceToggle({
  enabled,
  disabled,
  onEnabled,
}: Pick<FractionalPriceProps, "enabled" | "disabled" | "onEnabled">) {
  return (
    <OptionToggle
      label="Fraccionar precio"
      hint="Precio de una parte del pack."
      tone="teal"
      checked={enabled}
      disabled={disabled}
      controls={FRACTIONAL_PRICE_OPTIONS_ID}
      onChange={onEnabled}
    />
  );
}

/** Opciones del precio fraccionado; se muestran sólo con la opción activa. */
export function FractionalPriceOptions({
  enabled,
  linked,
  base,
  divisor,
  markup,
  result,
  disabled,
  onBase,
  onDivisor,
  onMarkup,
}: FractionalPriceProps) {
  if (!enabled) return null;
  const input =
    "mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-normal disabled:bg-slate-100";
  return (
    <fieldset
      id={FRACTIONAL_PRICE_OPTIONS_ID}
      disabled={disabled}
      className="space-y-3 rounded-xl border border-teal-100 bg-teal-50/40 p-3"
    >
      <legend className="sr-only">Fraccionar precio</legend>
      <p className="text-xs font-semibold uppercase tracking-wide text-teal-800">
        Fraccionar precio
      </p>
      <div className="grid gap-3 sm:grid-cols-3">
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
        Solo modifica el precio; el stock no cambia.
      </p>
    </fieldset>
  );
}

/** Casilla y opciones juntas (uso suelto). */
export function FractionalPriceFields(props: FractionalPriceProps) {
  return (
    <div className="mt-3 space-y-3">
      <FractionalPriceToggle {...props} />
      <FractionalPriceOptions {...props} />
    </div>
  );
}
