import { useEffect, useRef, type ReactElement } from "react";
import * as echarts from "echarts/core";
import {
  BarChart,
  HeatmapChart,
  LineChart,
  PieChart,
  ScatterChart,
} from "echarts/charts";
import {
  GridComponent,
  LegendComponent,
  MarkLineComponent,
  TooltipComponent,
  VisualMapComponent,
} from "echarts/components";
import { SVGRenderer } from "echarts/renderers";
import type { EChartsCoreOption, ECElementEvent } from "echarts/core";
import { reportChartTheme } from "./lib/report-chart-theme";

// Solo los graficos y componentes que usan los reportes, para no cargar ECharts entero.
echarts.use([
  BarChart,
  HeatmapChart,
  LineChart,
  PieChart,
  ScatterChart,
  GridComponent,
  LegendComponent,
  MarkLineComponent,
  TooltipComponent,
  VisualMapComponent,
  SVGRenderer,
]);
echarts.registerTheme("gestion", reportChartTheme);

/**
 * Grafico ECharts con el tema del sistema. Se importa con React.lazy para que
 * ECharts se descargue solo al abrir Reportes. `onSelect` recibe el clic sobre un
 * dato (filtros cruzados y drill-down).
 */
export default function ReportChart({
  option,
  label,
  height = 260,
  onSelect,
}: {
  option: EChartsCoreOption;
  /** Descripcion accesible del grafico. */
  label: string;
  height?: number;
  onSelect?: (event: ECElementEvent) => void;
}): ReactElement {
  const container = useRef<HTMLDivElement>(null);
  const chart = useRef<echarts.ECharts | null>(null);

  useEffect(() => {
    if (!container.current) return;
    const instance = echarts.init(container.current, "gestion", {
      renderer: "svg",
    });
    chart.current = instance;
    const observer = new ResizeObserver(() => instance.resize());
    observer.observe(container.current);
    return () => {
      observer.disconnect();
      instance.dispose();
      chart.current = null;
    };
  }, []);

  useEffect(() => {
    chart.current?.setOption(option, { notMerge: true });
  }, [option]);

  useEffect(() => {
    const instance = chart.current;
    if (!instance || !onSelect) return;
    instance.on("click", onSelect);
    return () => {
      instance.off("click", onSelect);
    };
  }, [onSelect]);

  return (
    <div
      ref={container}
      role="img"
      aria-label={label}
      style={{ height }}
      className="w-full"
    />
  );
}
