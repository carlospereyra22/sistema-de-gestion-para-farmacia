import { type CSSProperties, type ReactElement, type ReactNode } from "react";
import { MOVIMIENTO } from "./lib/animacion-reportes";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import type { ReportKpi } from "@gestion/contracts";
import { formatKpiValue, kpiTrend, unavailableText } from "./lib/report-format";
import { ReportHelp, reportCardClass } from "./report-states";
import { useEntrada } from "./lib/use-reportes-movimiento";
import { NumeroAnimado } from "./reportes-movimiento";

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
  animar = false,
  orden = 0,
}: {
  label: string;
  icon: ReactNode;
  kpi: ReportKpi;
  help: string;
  higherIsBetter?: boolean;
  /**
   * Entrada animada: la tarjeta aparece y el número cuenta desde 0 (SISTEMA-87,
   * SISTEMA-90). Sin ella, un cambio de filtros igual va del valor anterior al
   * nuevo con una transición corta.
   */
  animar?: boolean;
  /** Orden de aparición de la tarjeta. */
  orden?: number;
}): ReactElement {
  const trend = kpiTrend(kpi, higherIsBetter);
  const [ref, entrada] = useEntrada<HTMLElement>(animar);
  const TrendIcon =
    trend.direction === "up"
      ? ArrowUpRight
      : trend.direction === "down"
        ? ArrowDownRight
        : Minus;
  return (
    <article
      ref={ref}
      data-entrada={entrada}
      className={`${reportCardClass} reportes-entrada flex gap-3 px-4 py-3.5`}
      style={{ "--orden": orden } as CSSProperties}
    >
      <span className="grid size-10 shrink-0 place-items-center rounded-full bg-marca-970 text-marca-535">
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <h3 className="flex items-center gap-1 text-xs font-semibold text-slate-600">
          <span className="truncate">{label}</span>
          <ReportHelp text={help} />
        </h3>
        <p
          className="mt-1 truncate text-2xl font-bold leading-8 tracking-tight text-slate-900 tabular-nums"
          title={
            kpi.available
              ? undefined
              : unavailableText[kpi.unavailableReason ?? "NO_DATA"]
          }
        >
          {kpi.available && kpi.value !== null ? (
            <NumeroAnimado
              valor={kpi.value}
              formato={(value) => formatKpiValue({ ...kpi, value })}
              decimales={kpi.unit === "percent"}
              entrada={animar}
              listo={entrada !== "pendiente"}
              retraso={
                MOVIMIENTO.contadorRetraso + orden * MOVIMIENTO.contadorDesfase
              }
            />
          ) : (
            formatKpiValue(kpi)
          )}
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
