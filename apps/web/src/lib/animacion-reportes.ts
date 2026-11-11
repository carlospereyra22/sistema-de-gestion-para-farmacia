import type { EChartsCoreOption } from "echarts/core";

// Animación de Reportes (SISTEMA-87, pedido del usuario; afinada en SISTEMA-90):
// la primera vez que se abre Reportes en la sesión los números suben, las
// tarjetas aparecen de a una y los gráficos se dibujan. Después no se repite:
// entrar otra vez muestra todo directo, y cambiar un filtro sólo hace una
// transición corta desde lo que se ve hacia lo nuevo. Nunca anima sin conexión
// ni con "reducir movimiento". Es sólo presentación: no toca ningún dato.

const CLAVE = "gestion:reportes-animados";

/**
 * Tiempos del movimiento de Reportes, en milisegundos. Un único lugar para que
 * todos los widgets se muevan con el mismo ritmo.
 */
export const MOVIMIENTO = {
  /** Números principales (KPI): entrada completa. Nunca más de 2,5 s. */
  contadorEntrada: 2300,
  /** Totales de cierres de caja: entrada un poco más corta. */
  contadorCaja: 2100,
  /** Un número que ya se ve y cambia por un filtro. */
  contadorActualizacion: 700,
  /** Espera antes de que cuente la primera tarjeta y desfase entre tarjetas. */
  contadorRetraso: 120,
  contadorDesfase: 65,
  /** Línea del período actual y la del período comparado (empieza después). */
  lineaPrincipal: 1750,
  lineaComparativa: 1400,
  lineaRetraso: 300,
  lineaComparativaRetraso: 550,
  /** Barras horizontales: espera inicial. Duración y desfase según cantidad. */
  barrasRetraso: 300,
  /** Gráfico que ya se ve y cambia por un filtro. */
  graficoActualizacion: 500,
  /** Elementos nuevos que aparecen en un gráfico ya dibujado. */
  graficoAgregado: 400,
  /** Tooltip de los gráficos (ECharts lo pide en segundos). */
  tooltipSegundos: 0.15,
  /** Panel en "entrando" hasta que terminan su aparición y la de sus filas. */
  entradaPanel: 1100,
} as const;

/**
 * Curva de los números que suben: `1 - (1 - t)^p`. Con p = 3,2 al 35 % del
 * tiempo ya recorrió cerca del 75 % y el resto lo hace cada vez más despacio,
 * sin saltos de velocidad. Es relativa al recorrido: sirve igual para 42
 * unidades, montos millonarios o negativos.
 */
export function easeOutPower(t: number, potencia = 3.2) {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  return 1 - (1 - t) ** potencia;
}

/**
 * Valor que se muestra a los `transcurrido` ms de una animación de `desde` a
 * `hasta`. Antes del `retraso` queda en `desde`; al terminar es exactamente
 * `hasta` (sin restos de punto flotante).
 */
export function valorAnimado(
  desde: number,
  hasta: number,
  transcurrido: number,
  duracion: number,
  retraso = 0,
) {
  const t = duracion > 0 ? (transcurrido - retraso) / duracion : 1;
  if (t >= 1) return hasta;
  if (t <= 0) return desde;
  return desde + (hasta - desde) * easeOutPower(t);
}

/** Duración y desfase de las barras: más corto cuanto más larga la lista. */
export function ritmoBarras(cantidad: number) {
  if (cantidad <= 3) return { duracion: 1150, desfase: 85 };
  if (cantidad <= 8) return { duracion: 1100, desfase: 70 };
  return { duracion: 1000, desfase: 50 };
}

type Entorno = {
  almacen?: Pick<Storage, "getItem" | "setItem">;
  reducirMovimiento?: boolean;
  enLinea?: boolean;
};

/** ¿El usuario pidió "reducir movimiento" en su sistema? */
export function prefiereMenosMovimiento() {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false
  );
}

function entornoDelNavegador(): Entorno {
  if (typeof window === "undefined") return {};
  let almacen: Entorno["almacen"];
  try {
    almacen = window.sessionStorage;
  } catch {
    almacen = undefined;
  }
  return {
    almacen,
    reducirMovimiento: prefiereMenosMovimiento(),
    enLinea: typeof navigator === "undefined" ? true : navigator.onLine,
  };
}

/**
 * ¿Toca la animación de entrada? Sólo la primera vez de la sesión (y la marca
 * como vista).
 */
export function tocaAnimarReportes(entorno: Entorno = entornoDelNavegador()) {
  const { almacen, reducirMovimiento, enLinea } = entorno;
  if (!almacen || reducirMovimiento || enLinea === false) return false;
  try {
    if (almacen.getItem(CLAVE)) return false;
    almacen.setItem(CLAVE, "1");
    return true;
  } catch {
    return false;
  }
}

export type TipoAnimacionGrafico = "linea" | "barras";
/**
 * - `entrada`: la primera vez que se dibuja (línea de izquierda a derecha,
 *   barras que crecen desde el eje de a una).
 * - `actualizacion`: ya se ve y cambian los datos; interpola desde lo anterior.
 * - `sin`: aparece directo (sesión ya animada o "reducir movimiento").
 */
export type FaseAnimacionGrafico = "entrada" | "actualizacion" | "sin";

type Serie = Record<string, unknown>;

/**
 * Opción de ECharts con la animación de la fase. Sólo agrega claves de
 * animación y del tooltip: los datos, ejes y escalas quedan como vienen.
 */
export function opcionAnimada(
  option: EChartsCoreOption,
  tipo: TipoAnimacionGrafico,
  fase: FaseAnimacionGrafico,
): EChartsCoreOption {
  const tooltip =
    option.tooltip && typeof option.tooltip === "object"
      ? {
          ...(option.tooltip as Record<string, unknown>),
          transitionDuration: MOVIMIENTO.tooltipSegundos,
        }
      : option.tooltip;
  if (fase === "sin")
    return {
      ...option,
      tooltip,
      animation: false,
    };
  const series = Array.isArray(option.series) ? (option.series as Serie[]) : [];
  const comun = {
    ...option,
    tooltip,
    animation: true,
    animationDurationUpdate: MOVIMIENTO.graficoActualizacion,
    animationEasingUpdate: "cubicInOut" as const,
  };
  if (fase === "actualizacion")
    return {
      ...comun,
      series: series.map((serie) => ({
        ...serie,
        animationDuration: MOVIMIENTO.graficoAgregado,
        animationDelay: 0,
        animationEasing: "cubicOut" as const,
      })),
    };
  if (tipo === "linea")
    return {
      ...comun,
      // Avance constante: ECharts hace aparecer cada punto según su posición en
      // X, así el punto aparece justo cuando el trazo llega.
      series: series.map((serie, indice) => ({
        ...serie,
        animationDuration:
          indice === 0
            ? MOVIMIENTO.lineaPrincipal
            : MOVIMIENTO.lineaComparativa,
        animationDelay:
          indice === 0
            ? MOVIMIENTO.lineaRetraso
            : MOVIMIENTO.lineaComparativaRetraso,
        animationEasing: "linear" as const,
      })),
    };
  return {
    ...comun,
    series: series.map((serie) => {
      const cantidad = Array.isArray(serie.data) ? serie.data.length : 0;
      const { duracion, desfase } = ritmoBarras(cantidad);
      return {
        ...serie,
        animationDuration: duracion,
        animationEasing: "cubicOut" as const,
        // Los rankings se cargan al revés (el primero arriba): la de arriba
        // crece primero.
        animationDelay: (indice: number) =>
          MOVIMIENTO.barrasRetraso +
          Math.max(0, cantidad - 1 - indice) * desfase,
      };
    }),
  };
}
