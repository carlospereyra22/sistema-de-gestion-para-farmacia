import { ArrowUp, ArrowDown, Minus } from "lucide-react";
import { DashboardMiniChart } from "./dashboard-mini-chart";
import { dashboardChange } from "./lib/dashboard-change";

export function DashboardKpiTrend({
  days,
  kind,
  color,
  value,
}: {
  days: { date: string; totalMinor: string; count: number }[];
  kind: "sales" | "tickets";
  color: string;
  value?: string;
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
    <div className="mt-2 grid grid-cols-[minmax(0,1fr)_auto] items-end gap-3">
      <div className="min-w-0">
        {value !== undefined && (
          <p
            className="break-words text-[28px] font-bold leading-8 tracking-tight tabular-nums"
            style={{ color }}
          >
            {value}
          </p>
        )}
        <div className="mt-1 flex items-center gap-1 text-[10px] font-medium leading-4">
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
      <p className="sr-only">Últimos {days.length} días</p>
    </div>
  );
}
