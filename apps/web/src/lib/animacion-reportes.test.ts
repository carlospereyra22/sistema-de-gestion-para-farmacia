import { describe, expect, it } from "vitest";
import {
  conAnimacion,
  DURACION_ENTRADA,
  easeOutCubic,
  tocaAnimarReportes,
} from "./animacion-reportes";

const almacen = () => {
  const datos = new Map<string, string>();
  return {
    getItem: (clave: string) => datos.get(clave) ?? null,
    setItem: (clave: string, valor: string) => void datos.set(clave, valor),
  };
};

describe("animación de Reportes (SISTEMA-87)", () => {
  it("anima sólo la primera vez de la sesión", () => {
    const sesion = almacen();
    expect(tocaAnimarReportes({ almacen: sesion, enLinea: true })).toBe(true);
    expect(tocaAnimarReportes({ almacen: sesion, enLinea: true })).toBe(false);
    // Otra sesión (otra pestaña o al volver a entrar): otra vez.
    expect(tocaAnimarReportes({ almacen: almacen(), enLinea: true })).toBe(
      true,
    );
  });

  it("nunca con reducir movimiento, sin conexión ni sin almacén", () => {
    expect(
      tocaAnimarReportes({ almacen: almacen(), reducirMovimiento: true }),
    ).toBe(false);
    expect(tocaAnimarReportes({ almacen: almacen(), enLinea: false })).toBe(
      false,
    );
    expect(tocaAnimarReportes({})).toBe(false);
    // Sin conexión no gasta la vez: al volver internet, la primera entrada anima.
    const sesion = almacen();
    tocaAnimarReportes({ almacen: sesion, enLinea: false });
    expect(tocaAnimarReportes({ almacen: sesion, enLinea: true })).toBe(true);
  });

  it("los gráficos se dibujan en la entrada; después sólo una transición corta", () => {
    const entrada = conAnimacion({ series: [] }, true) as Record<
      string,
      unknown
    >;
    expect(entrada).toMatchObject({
      animation: true,
      animationDuration: DURACION_ENTRADA,
      series: [],
    });
    expect((entrada.animationDelay as (i: number) => number)(2)).toBe(290);
    expect(conAnimacion({}, false)).toMatchObject({
      animationDuration: 0,
      animationDelay: 0,
      animationDurationUpdate: 350,
    });
    expect(easeOutCubic(0)).toBe(0);
    expect(easeOutCubic(1)).toBe(1);
    expect(easeOutCubic(0.5)).toBeGreaterThan(0.5);
  });
});
