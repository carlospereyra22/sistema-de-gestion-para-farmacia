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
  /**
   * Línea del período actual y la del período comparado (empieza después).
   * Con la misma curva que los números: rápido al principio y frena al final.
   */
  lineaPrincipal: 2100,
  lineaComparativa: 1800,
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
 * Inversa de `easeOutPower`: en qué fracción del tiempo la animación llega a
 * `avance` (0 a 1) del recorrido. La línea la usa para que cada punto aparezca
 * justo cuando el trazo pasa por él.
 */
export function tiempoParaLlegar(avance: number, potencia = 3.2) {
  if (avance <= 0) return 0;
  if (avance >= 1) return 1;
  return 1 - (1 - avance) ** (1 / potencia);
}

/** Curva de entrada de los gráficos: la misma de los números que suben. */
const curvaEntrada = (t: number) => easeOutPower(t);

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
  if (cantidad <= 3) return { duracion: 1900, desfase: 90 };
  if (cantidad <= 8) return { duracion: 1750, desfase: 70 };
  return { duracion: 1600, desfase: 50 };
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
      // Misma curva que los números: el trazo avanza rápido y frena al final.
      // ECharts hace aparecer cada punto con el retraso de su índice (sin
      // índice, el del trazo): se calcula cuándo llega el trazo a ese punto.
      series: series.map((serie, indice) => {
        const duracion =
          indice === 0
            ? MOVIMIENTO.lineaPrincipal
            : MOVIMIENTO.lineaComparativa;
        const retraso =
          indice === 0
            ? MOVIMIENTO.lineaRetraso
            : MOVIMIENTO.lineaComparativaRetraso;
        const puntos = Array.isArray(serie.data) ? serie.data.length : 0;
        return {
          ...serie,
          animationDuration: duracion,
          animationEasing: curvaEntrada,
          animationDelay: (punto?: number | null) =>
            punto == null || puntos < 2
              ? retraso
              : retraso + duracion * tiempoParaLlegar(punto / (puntos - 1)),
        };
      }),
    };
  return {
    ...comun,
    series: series.map((serie) => {
      const cantidad = Array.isArray(serie.data) ? serie.data.length : 0;
      const { duracion, desfase } = ritmoBarras(cantidad);
      return {
        ...serie,
        animationDuration: duracion,
        animationEasing: curvaEntrada,
        // Los rankings se cargan al revés (el primero arriba): la de arriba
        // crece primero.
        animationDelay: (indice: number) =>
          MOVIMIENTO.barrasRetraso +
          Math.max(0, cantidad - 1 - indice) * desfase,
      };
    }),
  };
}

export type MedidaGrafico = { ancho: number; alto: number; oculto: boolean };

/**
 * Qué hacer cuando cambia el tamaño del lugar del gráfico. Reportes queda
 * montado pero oculto al ir a otra página y ahí mide 0: no se toca (achicarlo y
 * agrandarlo al volver se veía como gráficos que iban para atrás y volvían).
 * Al volver sólo se ajusta si el tamaño cambió mientras tanto, y sin animación.
 */
export function ajusteDeTamano(
  previa: MedidaGrafico,
  ancho: number,
  alto: number,
): { accion: "nada" | "directo" | "animado"; medida: MedidaGrafico } {
  if (ancho === 0 || alto === 0)
    return { accion: "nada", medida: { ...previa, oculto: true } };
  const medida = { ancho, alto, oculto: false };
  if (ancho === previa.ancho && alto === previa.alto)
    return { accion: "nada", medida };
  return { accion: previa.oculto ? "directo" : "animado", medida };
}
