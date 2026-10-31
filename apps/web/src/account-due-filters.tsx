import { useEffect, useRef, useState } from "react";
import { Funnel, X } from "lucide-react";
import {
  dueFilters,
  matchesDueFilter,
  type AccountDueRow,
  type DueFilter,
} from "./lib/account-due-dates";

type Props = {
  selected: DueFilter[];
  onChange: (filters: DueFilter[]) => void;
};

export function AccountDueFilters({
  selected,
  onChange,
  rows,
  label = "Filtros",
}: Props & { rows: AccountDueRow[]; label?: string }) {
  const menu = useRef<HTMLDetailsElement>(null);
  const [placement, setPlacement] = useState({ above: false, height: 280 });
  const positionMenu = () => {
    if (!menu.current?.open) return;
    const rect = menu.current.querySelector("summary")?.getBoundingClientRect();
    if (!rect) return;
    const below = window.innerHeight - rect.bottom - 14;
    const above = rect.top - 14;
    const opensAbove = below < 280 && above > below;
    setPlacement({
      above: opensAbove,
      height: Math.max(0, Math.min(280, opensAbove ? above : below)),
    });
  };
  useEffect(() => {
    const dismiss = (event: PointerEvent) => {
      if (event.target instanceof Node && !menu.current?.contains(event.target))
        menu.current?.removeAttribute("open");
    };
    document.addEventListener("pointerdown", dismiss);
    window.addEventListener("resize", positionMenu);
    window.addEventListener("scroll", positionMenu, true);
    return () => {
      document.removeEventListener("pointerdown", dismiss);
      window.removeEventListener("resize", positionMenu);
      window.removeEventListener("scroll", positionMenu, true);
    };
  }, []);
  return (
    <details
      ref={menu}
      className="relative shrink-0"
      onToggle={positionMenu}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          menu.current?.removeAttribute("open");
          menu.current?.querySelector("summary")?.focus();
        }
      }}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget))
          menu.current?.removeAttribute("open");
      }}
    >
      <summary
        aria-label="Filtros de vencimiento"
        className={`flex h-10 cursor-pointer list-none items-center gap-2 rounded-lg border px-3 text-sm [&::-webkit-details-marker]:hidden ${selected.length ? "border-teal-300 bg-teal-50 text-teal-800" : "border-slate-200 bg-white text-teal-700"}`}
      >
        <Funnel size={16} aria-hidden="true" />
        <span>{label}</span>
        {selected.length > 0 && (
          <span className="rounded-full bg-teal-700 px-1.5 text-[10px] text-white">
            {selected.length}
          </span>
        )}
      </summary>
      <fieldset
        style={{ maxHeight: placement.height }}
        className={`absolute right-0 z-50 m-0 min-w-0 w-64 max-w-[calc(100vw-3rem)] overflow-y-auto overscroll-contain rounded-xl border border-slate-200 bg-white p-2 shadow-lg ${placement.above ? "bottom-full mb-1.5" : "top-full mt-1.5"}`}
      >
        <legend className="sr-only">Estados de vencimiento</legend>
        <p className="mb-2 text-xs font-semibold text-slate-700">
          Mostrar ventas por estado
        </p>
        {dueFilters
          .filter((option) => option.id !== "ALL")
          .map((option) => (
            <label
              key={option.id}
              className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-xs text-slate-600 hover:bg-slate-50"
            >
              <input
                type="checkbox"
                className="accent-teal-700"
                checked={selected.includes(option.id)}
                onChange={() =>
                  onChange(
                    selected.includes(option.id)
                      ? selected.filter((id) => id !== option.id)
                      : [...selected, option.id],
                  )
                }
              />
              <span className="flex-1">{option.label}</span>
              <span className="text-[10px] tabular-nums text-slate-400">
                {rows.filter((row) => matchesDueFilter(row, option.id)).length}
              </span>
            </label>
          ))}
        <div className="mt-2 border-t border-slate-100 pt-2 text-xs">
          <button
            type="button"
            onClick={() => onChange([])}
            className="px-2 py-1 text-teal-700"
          >
            Limpiar filtros
          </button>
        </div>
      </fieldset>
    </details>
  );
}

export function AccountDueActiveFilters({ selected, onChange }: Props) {
  if (!selected.length) return null;
  return (
    <div
      aria-label="Filtros activos"
      className="flex flex-wrap gap-2 text-[11px]"
    >
      {dueFilters
        .filter((option) => selected.includes(option.id))
        .map((option) => (
          <button
            key={option.id}
            type="button"
            aria-label={`Quitar filtro: ${option.label}`}
            onClick={() => onChange(selected.filter((id) => id !== option.id))}
            className="inline-flex items-center gap-2 rounded-lg border border-teal-100 bg-teal-50 px-2 py-1 text-teal-800"
          >
            {option.label}
            <X size={12} aria-hidden="true" />
          </button>
        ))}
    </div>
  );
}
