import { DashboardChartDetail } from "./dashboard-chart-detail";

export function DashboardInventoryChart({
  rows,
  kind,
  color,
}: {
  rows: { label: string; value: number }[];
  kind: "missing" | "expiry";
  color: string;
}) {
  const total = rows.reduce((sum, row) => sum + row.value, 0);
  const max = Math.max(1, ...rows.map((row) => row.value));
  const missing = kind === "missing";
  const title = missing ? "Faltantes por categoría" : "Lotes por vencimiento";
  return (
    <DashboardChartDetail
      title={title}
      color={color}
      rows={rows.map((row) => ({
        label: row.label,
        value: `${row.value} ${missing ? (row.value === 1 ? "producto" : "productos") : row.value === 1 ? "lote" : "lotes"}`,
      }))}
    >
      <div className="w-32" aria-hidden="true">
        {total === 0 ? (
          <div className="rounded-lg bg-slate-50 px-2 py-3 text-center text-[10px] text-slate-500">
            {missing ? "Sin faltantes" : "Sin lotes a revisar"}
          </div>
        ) : missing ? (
          <div className="space-y-1.5">
            {rows.slice(0, 2).map((row) => (
              <div key={row.label}>
                <div className="mb-1 flex justify-between gap-2 text-[9px] leading-3 text-slate-500">
                  <span className="truncate">{row.label}</span>
                  <span className="font-semibold tabular-nums text-slate-700">
                    {row.value}
                  </span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-orange-50">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${(row.value / max) * 100}%`,
                      background: `linear-gradient(90deg, ${color}88, ${color})`,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div>
            <div className="flex h-12 items-end gap-1.5 border-b border-slate-100">
              {rows.map((row, index) => (
                <div
                  key={row.label}
                  className="relative flex h-full flex-1 items-end justify-center"
                >
                  <div
                    className="w-3 rounded-t-sm"
                    style={{
                      height: `${(row.value / max) * 65}%`,
                      backgroundColor: index === 0 ? "#f43f5e" : color,
                      opacity: index === 0 ? 1 : 1 - index * 0.12,
                    }}
                  />
                  <span
                    className="absolute text-[9px] font-semibold tabular-nums text-slate-600"
                    style={{ bottom: `calc(${(row.value / max) * 65}% + 2px)` }}
                  >
                    {row.value}
                  </span>
                </div>
              ))}
            </div>
            <div className="mt-1 flex gap-1.5 text-center text-[8px] text-slate-500">
              {["Venc.", "≤7d", "14d", "21d", "30d"].map((label) => (
                <span key={label} className="flex-1">
                  {label}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </DashboardChartDetail>
  );
}
