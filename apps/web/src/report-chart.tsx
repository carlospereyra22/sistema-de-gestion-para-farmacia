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
import {
  adaptarOpcionAlTema,
  reportChartTheme,
  reportChartThemeOscuro,
} from "./lib/report-chart-theme";
import { useTema } from "./use-tema";
import {
  ajusteDeTamano,
  MOVIMIENTO,
  opcionAnimada,
  type MedidaGrafico,
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
echarts.registerTheme("gestion-oscuro", reportChartThemeOscuro);

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
  // ECharts fija el tema al crear el gráfico: al cambiarlo se vuelve a crear.
  const tema = useTema();

  useEffect(() => {
    if (!container.current) return;
    const instance = echarts.init(
      container.current,
      tema === "oscuro" ? "gestion-oscuro" : "gestion",
      {
        renderer: "svg",
      },
    );
    chart.current = instance;
    // ECharts corta cualquier animación en curso al hacer resize(), y el
    // ResizeObserver avisa una vez apenas empieza a observar: sin este control
    // la línea y las barras saltaban directo al final (SISTEMA-90). Sólo se
    // redimensiona si el tamaño cambió de verdad, y en Reportes con transición.
    const elemento = container.current;
    let medida: MedidaGrafico = {
      ancho: elemento.clientWidth,
      alto: elemento.clientHeight,
      oculto: elemento.clientWidth === 0 || elemento.clientHeight === 0,
    };
    const observer = new ResizeObserver(() => {
      const ajuste = ajusteDeTamano(
        medida,
        elemento.clientWidth,
        elemento.clientHeight,
      );
      medida = ajuste.medida;
      if (ajuste.accion === "nada") return;
      instance.resize(
        conTransicion.current && ajuste.accion === "animado"
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
  }, [tema]);

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
    const opcion = adaptarOpcionAlTema(option, tema);
    instance.setOption(
      animacion ? opcionAnimada(opcion, animacion, fase) : opcion,
      { notMerge: true },
    );
    dibujado.current = true;
  }, [option, animacion, tema]);

  useEffect(() => {
    const instance = chart.current;
    if (!instance || !onSelect) return;
    instance.on("click", onSelect);
    return () => {
      instance.off("click", onSelect);
    };
  }, [onSelect, tema]);

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
