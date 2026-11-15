type SaleStockSwitchProps = {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
};

// Interruptor tipo switch para filtrar el catálogo de ventas por stock disponible.
export function SaleStockSwitch({
  checked,
  onChange,
  label = "Con stock",
}: SaleStockSwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`group inline-flex h-10 shrink-0 items-center gap-2.5 whitespace-nowrap rounded-full border px-3 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-600 ${
        checked
          ? "border-teal-200 bg-teal-50 text-teal-900"
          : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
      }`}
    >
      <span
        aria-hidden
        className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${
          checked ? "bg-teal-600" : "bg-slate-300 group-hover:bg-slate-400"
        }`}
      >
        <span
          className={`absolute left-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${
            checked ? "translate-x-4" : "translate-x-0"
          }`}
        />
      </span>
      {label}
    </button>
  );
}
