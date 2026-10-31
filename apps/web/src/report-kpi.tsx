import type { ReactElement, ReactNode } from "react";
import { ArrowDownRight, ArrowUpRight, Info, Minus } from "lucide-react";
import type { ReportKpi } from "@gestion/contracts";
import { formatKpiValue, kpiTrend, unavailableText } from "./lib/report-format";
import { reportCardClass } from "./report-states";

/**
 * Tarjeta de indicador. `help` explica la formula (tooltip); `higherIsBetter`
 * decide si subir se pinta como favorable (ventas) o desfavorable (costos, deuda).
 */
export function ReportKpiCard({
  label,
  icon,
  kpi,
  help,
  higherIsBetter = true,
}: {
  label: string;
  icon: ReactNode;
  kpi: ReportKpi;
  help: string;
  higherIsBetter?: boolean;
}): ReactElement {
  const trend = kpiTrend(kpi, higherIsBetter);
  const TrendIcon =
    trend.direction === "up"
      ? ArrowUpRight
      : trend.direction === "down"
        ? ArrowDownRight
        : Minus;
  return (
    <article className={`${reportCardClass} flex gap-3 px-4 py-3.5`}>
      <span className="grid size-10 shrink-0 place-items-center rounded-full bg-[#e8faf5] text-[#087f70]">
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <h3 className="flex items-center gap-1 text-xs font-semibold text-slate-600">
          <span className="truncate">{label}</span>
          <span title={help} aria-label={`Cómo se calcula: ${help}`}>
            <Info size={13} className="text-slate-400" aria-hidden />
          </span>
        </h3>
        <p
          className="mt-1 truncate text-2xl font-bold leading-8 tracking-tight text-slate-900 tabular-nums"
          title={
            kpi.available
              ? undefined
              : unavailableText[kpi.unavailableReason ?? "NO_DATA"]
          }
        >
          {formatKpiValue(kpi)}
          {kpi.estimated && kpi.available ? (
            <span className="ml-1.5 align-middle text-[10px] font-semibold uppercase tracking-wide text-amber-600">
              estimado
            </span>
          ) : null}
        </p>
        <p className="mt-0.5 flex items-center gap-1 text-[11px] text-slate-500">
          {trend.direction === "none" ? (
            trend.text
          ) : (
            <>
              <span
                className={`inline-flex items-center gap-0.5 font-semibold ${
                  trend.tone === "good"
                    ? "text-emerald-700"
                    : trend.tone === "bad"
                      ? "text-rose-600"
                      : "text-slate-600"
                }`}
              >
                <TrendIcon size={13} aria-hidden />
                {trend.text}
              </span>
              vs. período anterior
            </>
          )}
        </p>
      </div>
    </article>
  );
}
