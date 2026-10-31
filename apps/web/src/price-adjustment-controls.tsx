export function PriceAdjustmentControls({
  direction,
  mode,
  value,
  onDirectionChange,
  onModeChange,
  onValueChange,
}: {
  direction: "UP" | "DOWN";
  mode: "PERCENT" | "FIXED";
  value: string;
  onDirectionChange: (direction: "UP" | "DOWN") => void;
  onModeChange: (mode: "PERCENT" | "FIXED") => void;
  onValueChange: (value: string) => void;
}) {
  return (
    <div className="space-y-4 rounded-xl bg-slate-50 p-4">
      <fieldset>
        <legend className="mb-2 text-sm font-medium">¿Qué querés hacer?</legend>
        <div className="grid grid-cols-2 gap-2">
          {(["UP", "DOWN"] as const).map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={direction === option}
              className={`flex items-center justify-center gap-2 rounded-lg border px-4 py-3 text-sm font-semibold transition-colors ${option === "DOWN" ? (direction === option ? "border-orange-500 bg-orange-50 text-orange-800" : "border-orange-200 bg-orange-50/30 text-orange-700 hover:bg-orange-50") : direction === option ? "border-teal-600 bg-teal-50 text-teal-900" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-100"}`}
              onClick={() => onDirectionChange(option)}
            >
              <span aria-hidden="true" className="text-xl leading-none">
                {option === "UP" ? "+" : "−"}
              </span>
              {option === "UP" ? "Aumentar" : "Bajar"}
            </button>
          ))}
        </div>
      </fieldset>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm font-medium">
          Tipo de ajuste
          <select
            className="mt-2 h-10 w-full rounded-lg border bg-white px-3"
            value={mode}
            onChange={(event) =>
              onModeChange(event.target.value as "PERCENT" | "FIXED")
            }
          >
            <option value="PERCENT">Porcentaje (%)</option>
            <option value="FIXED">Monto fijo ($)</option>
          </select>
        </label>
        <label className="text-sm font-medium">
          {mode === "PERCENT" ? "Porcentaje" : "Monto"} a{" "}
          {direction === "UP" ? "aumentar" : "bajar"}
          <span className="relative mt-2 block">
            <input
              aria-label="Valor del ajuste"
              className="h-10 w-full rounded-lg border bg-white pl-3 pr-10"
              inputMode="decimal"
              value={value}
              placeholder={mode === "PERCENT" ? "Ej. 5" : "Ej. 500"}
              onChange={(event) => {
                if (/^\d*(?:[.,]\d{0,2})?$/.test(event.target.value))
                  onValueChange(event.target.value);
              }}
            />
            <span
              aria-hidden="true"
              className="pointer-events-none absolute right-3 top-2.5 text-slate-500"
            >
              {mode === "PERCENT" ? "%" : "$"}
            </span>
          </span>
        </label>
      </div>
      <p className="text-xs text-slate-500">
        Ingresá solo el valor, sin signo. La vista previa se actualiza
        automáticamente.
      </p>
    </div>
  );
}
