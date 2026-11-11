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
import {
  MOVIMIENTO,
  opcionAnimada,
  prefiereMenosMovimiento,
  type TipoAnimacionGrafico,
} from "./lib/animacion-reportes";

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
 *
 * Con `animacion` (Reportes, SISTEMA-90) el primer dibujo hace la entrada si
 * `animarEntrada`, y cada cambio de datos interpola desde lo anterior sin
 * desmontar el gráfico. Sin `animacion` usa la opción tal cual.
 */
export default function ReportChart({
  option,
  label,
  height = 260,
  onSelect,
  animacion,
  animarEntrada = false,
}: {
  option: EChartsCoreOption;
  /** Descripcion accesible del grafico. */
  label: string;
  height?: number;
  onSelect?: (event: ECElementEvent) => void;
  animacion?: TipoAnimacionGrafico;
  animarEntrada?: boolean;
}): ReactElement {
  const container = useRef<HTMLDivElement>(null);
  const chart = useRef<echarts.ECharts | null>(null);
  const dibujado = useRef(false);
  // Sólo cuenta para el primer dibujo: cambiarla después no redibuja.
  const entrada = useRef(animarEntrada);
  const conTransicion = useRef(Boolean(animacion));
  conTransicion.current = Boolean(animacion) && !prefiereMenosMovimiento();

  useEffect(() => {
    if (!container.current) return;
    const instance = echarts.init(container.current, "gestion", {
      renderer: "svg",
    });
    chart.current = instance;
    // ECharts corta cualquier animación en curso al hacer resize(), y el
    // ResizeObserver avisa una vez apenas empieza a observar: sin este control
    // la línea y las barras saltaban directo al final (SISTEMA-90). Sólo se
    // redimensiona si el tamaño cambió de verdad, y en Reportes con transición.
    const elemento = container.current;
    let ancho = elemento.clientWidth;
    let alto = elemento.clientHeight;
    const observer = new ResizeObserver(() => {
      if (elemento.clientWidth === ancho && elemento.clientHeight === alto)
        return;
      ancho = elemento.clientWidth;
      alto = elemento.clientHeight;
      instance.resize(
        conTransicion.current
          ? {
              animation: {
                duration: MOVIMIENTO.graficoActualizacion,
                easing: "cubicInOut",
              },
            }
          : undefined,
      );
    });
    observer.observe(elemento);
    return () => {
      observer.disconnect();
      instance.dispose();
      chart.current = null;
      dibujado.current = false;
    };
  }, []);

  useEffect(() => {
    const instance = chart.current;
    if (!instance) return;
    const fase = prefiereMenosMovimiento()
      ? "sin"
      : dibujado.current
        ? "actualizacion"
        : entrada.current
          ? "entrada"
          : "sin";
    instance.setOption(
      animacion ? opcionAnimada(option, animacion, fase) : option,
      { notMerge: true },
    );
    dibujado.current = true;
  }, [option, animacion]);

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
