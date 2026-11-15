// Tarjeta con casilla para activar una opción del producto. Las opciones que
// habilita se muestran aparte, debajo de la fila de tarjetas.
export function OptionToggle({
  label,
  hint,
  checked,
  disabled,
  tone,
  controls,
  onChange,
}: {
  label: string;
  hint: string;
  checked: boolean;
  disabled: boolean;
  tone: "teal" | "indigo";
  /** id del panel de opciones que muestra al activarse. */
  controls?: string;
  onChange: (value: boolean) => void;
}) {
  const active =
    tone === "teal"
      ? "border-teal-300 bg-teal-50 ring-1 ring-teal-200"
      : "border-indigo-300 bg-indigo-50 ring-1 ring-indigo-200";
  return (
    <label
      className={`flex h-full cursor-pointer items-start gap-2.5 rounded-xl border p-3 transition-colors ${
        checked ? active : "border-slate-200 bg-white hover:bg-slate-50"
      } ${disabled ? "cursor-not-allowed opacity-60" : ""}`}
    >
      <input
        type="checkbox"
        className="mt-0.5"
        checked={checked}
        disabled={disabled}
        aria-controls={controls}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span className="min-w-0">
        <span className="block text-sm font-medium text-slate-800">
          {label}
        </span>
        <span className="block text-xs leading-snug text-slate-500">
          {hint}
        </span>
      </span>
    </label>
  );
}
