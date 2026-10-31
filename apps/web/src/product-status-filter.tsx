export function ProductStatusFilter({
  archived,
  onChange,
}: {
  archived: boolean;
  onChange: (archived: boolean) => void;
}) {
  return (
    <div
      role="group"
      aria-label="Estado de productos"
      className="flex h-10 rounded-lg border border-slate-200 bg-white p-1 shadow-sm"
    >
      {[false, true].map((value) => (
        <button
          key={String(value)}
          type="button"
          aria-pressed={archived === value}
          onClick={() => onChange(value)}
          className={`flex-1 rounded-md px-3 text-sm transition-colors ${archived === value ? "bg-teal-50 font-semibold text-teal-800" : "text-slate-500 hover:bg-slate-50"}`}
        >
          {value ? "Archivados" : "Activos"}
        </button>
      ))}
    </div>
  );
}
