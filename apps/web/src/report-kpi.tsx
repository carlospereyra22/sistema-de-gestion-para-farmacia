import {
  useEffect,
  useState,
  type CSSProperties,
  type ReactElement,
  type ReactNode,
} from "react";
import { DURACION_ENTRADA, easeOutCubic } from "./lib/animacion-reportes";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import type { ReportKpi } from "@gestion/contracts";
import { formatKpiValue, kpiTrend, unavailableText } from "./lib/report-format";
import { ReportHelp, reportCardClass } from "./report-states";

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
  /** Entrada animada: el número sube desde 0 (SISTEMA-87). */
  animar?: boolean;
  /** Orden de aparición de la tarjeta. */
  orden?: number;
}): ReactElement {
  const trend = kpiTrend(kpi, higherIsBetter);
  const avance = useAvance(animar && kpi.available && kpi.value !== null);
  const mostrado =
    avance < 1 && kpi.value !== null
      ? {
          ...kpi,
          value: String(
            kpi.unit === "percent"
              ? Number(kpi.value) * avance
              : Math.round(Number(kpi.value) * avance),
          ),
        }
      : kpi;
  const TrendIcon =
    trend.direction === "up"
      ? ArrowUpRight
      : trend.direction === "down"
        ? ArrowDownRight
        : Minus;
  return (
    <article
      className={`${reportCardClass} reportes-entrada flex gap-3 px-4 py-3.5`}
      style={{ "--orden": orden } as CSSProperties}
    >
      <span className="grid size-10 shrink-0 place-items-center rounded-full bg-[#e8faf5] text-[#087f70]">
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
          {formatKpiValue(mostrado)}
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

/**
 * Avance de 0 a 1 de los números que suben, con una curva suave. Sin
 * animación es 1 desde el principio (y en el servidor, para los tests).
 */
function useAvance(animar: boolean) {
  const [avance, setAvance] = useState(animar ? 0 : 1);
  useEffect(() => {
    if (!animar) return;
    let cuadro = 0;
    const inicio = performance.now();
    const paso = (ahora: number) => {
      const t = Math.min(1, (ahora - inicio) / DURACION_ENTRADA);
      setAvance(easeOutCubic(t));
      if (t < 1) cuadro = requestAnimationFrame(paso);
    };
    cuadro = requestAnimationFrame(paso);
    return () => cancelAnimationFrame(cuadro);
  }, [animar]);
  return avance;
}
