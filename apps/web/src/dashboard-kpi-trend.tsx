import { ArrowUp, ArrowDown, Minus } from "lucide-react";
import { DashboardMiniChart } from "./dashboard-mini-chart";
import { dashboardChange } from "./lib/dashboard-change";
import { metricValueClass } from "./lib/dashboard-metrics";

export function DashboardKpiTrend({
  days,
  kind,
  color,
  value,
  note,
}: {
  days: { date: string; totalMinor: string; count: number }[];
  kind: "sales" | "tickets";
  color: string;
  value?: string;
  /** Texto debajo de la variación, por ejemplo la cantidad de tickets. */
  note?: string;
}) {
  const values = days.map((day) =>
    BigInt(kind === "sales" ? day.totalMinor : day.count),
  );
  if (values.length < 2) return null;
  const current = values.at(-1)!;
  const previous = values.at(-2)!;
  const change = dashboardChange(current, previous);
  const Icon =
    change.direction > 0 ? ArrowUp : change.direction < 0 ? ArrowDown : Minus;
  return (
    <div className="mt-2">
      {value !== undefined && (
        <p
          className={`whitespace-nowrap font-bold leading-8 tracking-tight tabular-nums text-slate-900 ${metricValueClass(value)}`}
        >
          {value}
        </p>
      )}
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-2">
        <div className="min-w-0">
          <div className="mt-0.5 flex items-center gap-1 text-xs font-medium leading-4">
            <Icon
              size={14}
              aria-hidden="true"
              className={
                change.direction < 0
                  ? "text-rose-500"
                  : change.direction > 0
                    ? "text-emerald-600"
                    : "text-slate-400"
              }
            />
            <span
              className={
                change.direction < 0
                  ? "text-rose-600"
                  : change.direction > 0
                    ? "text-emerald-600"
                    : "text-slate-500"
              }
            >
              {change.label}
            </span>
          </div>
          {note && (
            <p className="mt-0.5 text-xs leading-4 text-slate-500">{note}</p>
          )}
        </div>
        <DashboardMiniChart
          heading={
            kind === "sales"
              ? "Ventas de los últimos días"
              : "Tickets de los últimos días"
          }
          values={values}
          color={color}
          labels={days.map(
            (day, index) =>
              `${day.date}: ${kind === "sales" ? (Number(day.totalMinor) / 100).toLocaleString("es-AR", { style: "currency", currency: "ARS" }) : `${values[index]} tickets`}`,
          )}
        />
      </div>
      <p className="sr-only">Últimos {days.length} días</p>
    </div>
  );
}
