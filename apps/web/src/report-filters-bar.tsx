import { useState, type ReactElement } from "react";
import { ArrowLeftRight, CalendarDays, RotateCcw, Store } from "lucide-react";
import type { ReportOption } from "@gestion/contracts";
import {
  branchChoices,
  comparisonOptions,
  customRangeError,
  datePresets,
  presetRange,
  type DatePreset,
  type ReportView,
} from "./lib/report-view";
import { ProductFilterSelect } from "./product-filter-select";
import { reportCardClass } from "./report-states";

const fieldClass =
  "h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 shadow-sm transition-colors hover:border-teal-300 focus:border-teal-400 focus:outline-none focus:ring-2 focus:ring-teal-500/10";
const labelClass =
  "flex min-w-0 flex-col gap-1 text-xs font-medium text-slate-600";

/**
 * Filtros globales de Reportes: periodo, sucursal y comparacion. Las fechas se
 * editan siempre; al tocarlas el periodo pasa a "Personalizado" y se aplica en
 * cuanto el rango es valido.
 */
export function ReportFiltersBar({
  view,
  branches,
  today,
  onChange,
  onReset,
}: {
  view: ReportView;
  branches: readonly ReportOption[];
  today: string;
  onChange: (next: ReportView) => void;
  onReset: () => void;
}): ReactElement {
  const [draft, setDraft] = useState({ from: view.from, to: view.to });
  // Si el rango cambia desde afuera (otro periodo, Restablecer), el borrador lo sigue.
  const [applied, setApplied] = useState({ from: view.from, to: view.to });
  if (applied.from !== view.from || applied.to !== view.to) {
    setApplied({ from: view.from, to: view.to });
    setDraft({ from: view.from, to: view.to });
  }
  const editing = draft.from !== view.from || draft.to !== view.to;
  const error = editing ? customRangeError(draft.from, draft.to, today) : null;
  const choices = branchChoices(branches);

  const changeDate = (next: { from: string; to: string }) => {
    setDraft(next);
    if (!customRangeError(next.from, next.to, today))
      onChange({ ...view, preset: "custom", ...next });
  };

  return (
    <div
      className={`${reportCardClass} grid gap-3 p-3 sm:grid-cols-2 lg:grid-cols-[minmax(170px,1fr)_minmax(260px,auto)_minmax(180px,1fr)_minmax(200px,1fr)_auto] lg:items-start`}
    >
      <div className={labelClass}>
        Período
        <ProductFilterSelect
          compact
          label="Período"
          icon={<CalendarDays size={15} aria-hidden />}
          value={editing ? "custom" : view.preset}
          options={datePresets.map((preset) => ({
            value: preset.id,
            label: preset.label,
          }))}
          onChange={(value) => {
            const preset = value as DatePreset;
            if (preset === "custom") onChange({ ...view, preset });
            else onChange({ ...view, preset, ...presetRange(preset, today) });
          }}
        />
      </div>
      <div className="flex min-w-0 flex-col gap-1">
        <div className="grid grid-cols-2 gap-2">
          <label className={labelClass}>
            Desde
            <input
              type="date"
              aria-label="Desde"
              className={fieldClass}
              max={today}
              value={draft.from}
              onChange={(event) =>
                changeDate({ ...draft, from: event.target.value })
              }
            />
          </label>
          <label className={labelClass}>
            Hasta
            <input
              type="date"
              aria-label="Hasta"
              className={fieldClass}
              max={today}
              value={draft.to}
              onChange={(event) =>
                changeDate({ ...draft, to: event.target.value })
              }
            />
          </label>
        </div>
        {error ? (
          <p role="alert" className="text-[11px] text-rose-600">
            {error}
          </p>
        ) : null}
      </div>
      <div className={labelClass}>
        Sucursal
        {choices.length > 1 ? (
          <ProductFilterSelect
            compact
            label="Sucursal"
            icon={<Store size={15} aria-hidden />}
            value={view.branchId}
            options={choices.map((branch) => ({
              value: branch.id,
              label: branch.name,
            }))}
            onChange={(branchId) => onChange({ ...view, branchId })}
          />
        ) : (
          <span
            aria-label="Sucursal"
            className={`${fieldClass} flex items-center gap-2 truncate bg-slate-50 hover:border-slate-200`}
          >
            <Store size={15} className="shrink-0 text-teal-600" aria-hidden />
            {choices[0]?.name ?? "Sin sucursales asignadas"}
          </span>
        )}
      </div>
      <div className={labelClass}>
        Comparar con
        <ProductFilterSelect
          compact
          label="Comparar con"
          icon={<ArrowLeftRight size={15} aria-hidden />}
          value={view.comparison}
          options={comparisonOptions.map((option) => ({
            value: option.id,
            label: option.label,
          }))}
          onChange={(comparison) =>
            onChange({
              ...view,
              comparison: comparison as ReportView["comparison"],
            })
          }
        />
      </div>
      <button
        type="button"
        onClick={onReset}
        className="inline-flex h-10 items-center justify-center gap-1.5 self-end rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 shadow-sm hover:border-teal-300 hover:bg-teal-50/40"
      >
        <RotateCcw size={14} aria-hidden />
        Restablecer
      </button>
    </div>
  );
}
