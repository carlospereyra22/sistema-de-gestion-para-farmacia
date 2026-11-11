import { lazy, Suspense, useMemo } from "react";
import type { EChartsCoreOption } from "echarts/core";
import { BarChart3, PieChart } from "lucide-react";
import type { PlatformOrganization } from "./lib/platform-api";
import {
  etiquetaDeMes,
  farmaciasPorEstado,
  type GrupoDeEstado,
} from "./lib/platform-resumen";
import { PlatformPanel } from "./platform-ui";
import { ars } from "./supplier-payables/api";

// ECharts se descarga solo al abrir Pagos, como en Reportes.
const ReportChart = lazy(() => import("./report-chart"));

const colorDeEstado: Record<GrupoDeEstado, string> = {
  "al-dia": "bg-emerald-500",
  aviso: "bg-amber-500",
  cortadas: "bg-rose-500",
  "sin-cobro": "bg-slate-400",
};

const compacto = new Intl.NumberFormat("es-AR", {
  notation: "compact",
  maximumFractionDigits: 1,
});

/** Gráfico de Pagos: lo cobrado en cada uno de los últimos 12 meses. */
export function CobrosPorMes({
  mensual,
}: {
  mensual: { month: string; amountMinor: string }[];
}) {
  const total = mensual.reduce(
    (suma, { amountMinor }) => suma + BigInt(amountMinor),
    0n,
  );
  const option = useMemo<EChartsCoreOption>(() => {
    const ultimo = mensual.length - 1;
    return {
      grid: { left: 4, right: 8, top: 16, bottom: 0, containLabel: true },
      tooltip: {
        trigger: "axis",
        axisPointer: {
          type: "shadow",
          shadowStyle: { color: "rgba(8, 127, 112, 0.06)" },
        },
        formatter: (params: unknown) => {
          const punto = (Array.isArray(params) ? params[0] : params) as {
            dataIndex: number;
          };
          const fila = mensual[punto.dataIndex];
          if (!fila) return "";
          const [anio, mes] = fila.month.split("-");
          return `<span style="color:#64748b">${mes}/${anio}</span><br/><b>${ars(fila.amountMinor)}</b>`;
        },
      },
      xAxis: {
        type: "category",
        data: mensual.map(({ month }) => etiquetaDeMes(month)),
        axisLabel: { color: "#64748b", fontSize: 11 },
      },
      yAxis: {
        type: "value",
        splitNumber: 3,
        // Sin cobros, ECharts inventa una escala ($ 0,3…): se oculta.
        ...(mensual.every(({ amountMinor }) => amountMinor === "0")
          ? { max: 1 }
          : {}),
        axisLabel: {
          show: !mensual.every(({ amountMinor }) => amountMinor === "0"),
          formatter: (valor: number) => `$ ${compacto.format(valor)}`,
        },
      },
      series: [
        {
          type: "bar",
          name: "Cobrado",
          barMaxWidth: 30,
          data: mensual.map(({ amountMinor }, indice) => ({
            value: Number(amountMinor) / 100,
            itemStyle: {
              color: indice === ultimo ? "#087f70" : "#8fd3c3",
              borderRadius: [4, 4, 0, 0],
            },
          })),
          emphasis: { itemStyle: { color: "#066b60" } },
        },
      ],
    };
  }, [mensual]);
  return (
    <PlatformPanel
      icon={<BarChart3 size={16} />}
      title="Cobros por mes"
      description="Pagos vigentes de los últimos 12 meses. El mes en curso, en verde oscuro."
      actions={
        <span className="text-right">
          <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            12 meses
          </span>
          <span className="block text-lg font-bold tabular-nums text-slate-900">
            {ars(total.toString())}
          </span>
        </span>
      }
    >
      <div className="relative">
        <Suspense fallback={<div style={{ height: 240 }} />}>
          <ReportChart
            option={option}
            label="Cobros de los últimos 12 meses"
            height={240}
          />
        </Suspense>
        {total === 0n && (
          <p className="pointer-events-none absolute inset-0 grid place-items-center">
            <span className="rounded-full border border-[#dce7ef] bg-white/90 px-4 py-2 text-sm font-medium text-slate-600 shadow-sm">
              Todavía no hay cobros en estos meses
            </span>
          </p>
        )}
      </div>
    </PlatformPanel>
  );
}

/** Barra de Farmacias: cuántas hay en cada grupo de estado. */
export function EstadoDeFarmacias({
  farmacias,
}: {
  farmacias: PlatformOrganization[];
}) {
  const grupos = farmaciasPorEstado(farmacias);
  const total = grupos.reduce((suma, { cantidad }) => suma + cantidad, 0);
  return (
    <PlatformPanel
      icon={<PieChart size={16} />}
      title="Estado de las farmacias"
      description={`${total} ${total === 1 ? "farmacia con plan" : "farmacias con plan"}`}
    >
      <div
        role="img"
        aria-label={grupos
          .map(({ etiqueta, cantidad }) => `${etiqueta}: ${cantidad}`)
          .join(", ")}
        className="flex h-3.5 gap-[2px] overflow-hidden rounded-full bg-slate-100"
      >
        {grupos
          .filter(({ cantidad }) => cantidad > 0)
          .map(({ grupo, etiqueta, cantidad }) => (
            <span
              key={grupo}
              title={`${etiqueta}: ${cantidad}`}
              className={`h-full first:rounded-l-full last:rounded-r-full ${colorDeEstado[grupo]}`}
              style={{ flexGrow: cantidad, flexBasis: 0 }}
            />
          ))}
      </div>
      <ul className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        {grupos.map(({ grupo, etiqueta, descripcion, cantidad }) => (
          <li
            key={grupo}
            className="flex items-center gap-3 rounded-xl border border-[#e6eef3] px-3 py-2.5"
          >
            <span
              aria-hidden="true"
              className={`size-2.5 shrink-0 rounded-full ${colorDeEstado[grupo]}`}
            />
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium text-slate-800">
                {etiqueta}
              </span>
              <span className="block truncate text-xs text-slate-500">
                {descripcion}
              </span>
            </span>
            <span className="text-right">
              <span className="block text-lg font-bold tabular-nums leading-6 text-slate-900">
                {cantidad}
              </span>
              <span className="block text-[11px] tabular-nums text-slate-500">
                {total ? Math.round((cantidad / total) * 100) : 0}%
              </span>
            </span>
          </li>
        ))}
      </ul>
    </PlatformPanel>
  );
}
