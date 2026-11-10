import type { EChartsCoreOption } from "echarts/core";

// Animación de Reportes (SISTEMA-87, pedido del usuario): la primera vez que se
// abre Reportes en la sesión los números suben, las tarjetas aparecen de a una
// y los gráficos se dibujan. Después no se repite: entrar otra vez muestra todo
// directo, y cambiar un filtro sólo hace una transición corta en los gráficos.
// Nunca anima sin conexión ni con "reducir movimiento".

const CLAVE = "gestion:reportes-animados";

type Entorno = {
  almacen?: Pick<Storage, "getItem" | "setItem">;
  reducirMovimiento?: boolean;
  enLinea?: boolean;
};

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
    reducirMovimiento:
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false,
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

/** Duración de la entrada de los gráficos y de los números, en milisegundos. */
export const DURACION_ENTRADA = 1100;

/**
 * Opción del gráfico con la animación que corresponde: la entrada completa (la
 * línea se dibuja, las barras crecen de a una) o sólo la transición corta al
 * cambiar los datos.
 */
export function conAnimacion(
  option: EChartsCoreOption,
  animar: boolean,
): EChartsCoreOption {
  return {
    ...option,
    animation: true,
    animationDuration: animar ? DURACION_ENTRADA : 0,
    animationEasing: "cubicOut",
    animationDelay: animar ? (indice: number) => 200 + indice * 45 : 0,
    animationDurationUpdate: 350,
    animationEasingUpdate: "cubicInOut",
  };
}

/** Curva de los números que suben: rápida al principio, suave al final. */
export const easeOutCubic = (t: number) => 1 - (1 - t) ** 3;
