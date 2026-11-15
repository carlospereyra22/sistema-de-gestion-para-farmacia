import { describe, expect, it } from "vitest";
import {
  ajusteDeTamano,
  easeOutPower,
  MOVIMIENTO,
  opcionAnimada,
  ritmoBarras,
  tiempoParaLlegar,
  tocaAnimarReportes,
  valorAnimado,
} from "./animacion-reportes";
import { rankingOption, trendOption } from "./report-charts";

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
});

describe("contador de los KPI (SISTEMA-90)", () => {
  const ventas = 268305867; // $ 2.683.058,67 en centavos
  const duracion = MOVIMIENTO.contadorEntrada;

  it("dura 2,3 s, nunca más de 2,5 s", () => {
    expect(duracion).toBe(2300);
    expect(duracion).toBeLessThanOrEqual(2500);
  });

  it("al 35 % del tiempo ya recorrió cerca del 75 %; el resto, cada vez más lento", () => {
    const a35 = valorAnimado(0, ventas, duracion * 0.35, duracion);
    expect(a35 / ventas).toBeGreaterThan(0.72);
    expect(a35 / ventas).toBeLessThan(0.78);
    // Muestra muchos valores intermedios y nunca retrocede.
    let anterior = -1;
    const distintos = new Set<number>();
    for (let ms = 0; ms <= duracion; ms += 16) {
      const valor = Math.round(valorAnimado(0, ventas, ms, duracion));
      expect(valor).toBeGreaterThanOrEqual(anterior);
      anterior = valor;
      distintos.add(valor);
    }
    expect(distintos.size).toBeGreaterThan(100);
    // Velocidad continua: sin saltos bruscos entre cuadros vecinos.
    const velocidad = (t: number) =>
      (easeOutPower(t + 0.001) - easeOutPower(t)) / 0.001;
    for (let t = 0.05; t < 0.95; t += 0.05)
      expect(Math.abs(velocidad(t + 0.01) - velocidad(t))).toBeLessThan(0.15);
  });

  it("termina exacto en el valor del sistema, también con 0, 1, 42 y negativos", () => {
    for (const destino of [ventas, 16769117, 42, 1, 0, -4992400])
      expect(valorAnimado(0, destino, duracion, duracion)).toBe(destino);
    // Un negativo conserva el signo en todo el recorrido.
    for (let ms = 16; ms < duracion; ms += 100)
      expect(valorAnimado(0, -4992400, ms, duracion)).toBeLessThan(0);
  });

  it("al cambiar un filtro va desde lo que se ve, también hacia abajo", () => {
    const desde = 268305867;
    const hasta = 16769117;
    const corta = MOVIMIENTO.contadorActualizacion;
    expect(corta).toBeGreaterThanOrEqual(500);
    expect(corta).toBeLessThanOrEqual(900);
    expect(valorAnimado(desde, hasta, 0, corta)).toBe(desde);
    const medio = valorAnimado(desde, hasta, corta / 2, corta);
    expect(medio).toBeLessThan(desde);
    expect(medio).toBeGreaterThan(hasta);
    expect(valorAnimado(desde, hasta, corta, corta)).toBe(hasta);
  });

  it("espera el desfase de su tarjeta antes de contar", () => {
    expect(valorAnimado(0, 100, 100, duracion, 185)).toBe(0);
    expect(valorAnimado(0, 100, 185 + duracion, duracion, 185)).toBe(100);
  });
});

describe("gráficos de Reportes (SISTEMA-90)", () => {
  const tendencia = trendOption(
    [
      { bucket: "2026-10-11", value: "1000", previous: "500" },
      { bucket: "2026-10-12", value: "230000000", previous: "0" },
    ],
    "day",
    "Período anterior",
  );
  const series = (opcion: ReturnType<typeof opcionAnimada>) =>
    opcion.series as Record<string, unknown>[];

  it("la línea se dibuja con la comparativa un poco después, sin tocar los datos", () => {
    const entrada = opcionAnimada(tendencia, "linea", "entrada");
    const [actual, anterior] = series(entrada);
    expect(actual).toMatchObject({
      animationDuration: MOVIMIENTO.lineaPrincipal,
      data: [1000, 230000000],
    });
    expect(anterior).toMatchObject({ lineStyle: { type: "dashed" } });
    const retraso = (serie: Record<string, unknown> | undefined) =>
      serie!.animationDelay as (punto?: number | null) => number;
    // Sin índice es el retraso del trazo; la comparativa empieza después.
    expect(retraso(actual)(null)).toBe(MOVIMIENTO.lineaRetraso);
    expect(retraso(anterior)(null)).toBe(MOVIMIENTO.lineaComparativaRetraso);
    // Los ejes no se tocan: el pico conserva su escala real.
    expect(entrada.yAxis).toEqual(tendencia.yAxis);
    // Entre la espera y el dibujo, nunca más de 2,5 s (como los números).
    expect(
      MOVIMIENTO.lineaRetraso + MOVIMIENTO.lineaPrincipal,
    ).toBeLessThanOrEqual(2500);
  });

  it("las barras crecen de a una, la de arriba primero, en una secuencia compacta", () => {
    const productos = rankingOption(
      Array.from({ length: 10 }, (_, i) => ({
        name: `Producto ${i}`,
        value: 10 - i,
      })),
      "units",
    );
    const [barras] = series(opcionAnimada(productos, "barras", "entrada"));
    const retraso = barras!.animationDelay as (indice: number) => number;
    // El primero del ranking está al final de los datos (se dibuja arriba).
    expect(retraso(9)).toBeLessThan(retraso(0));
    const { duracion, desfase } = ritmoBarras(10);
    expect(desfase).toBeGreaterThanOrEqual(40);
    expect(desfase).toBeLessThanOrEqual(60);
    // Las diez terminan en menos de 2,5 s, no una detrás de otra.
    expect(retraso(0) + duracion).toBeLessThan(2500);
    expect(barras!.data).toEqual(productos.series[0]!.data);
  });

  it("al cambiar filtros interpola corto; con la sesión ya animada aparece directo", () => {
    const pagos = rankingOption(
      [
        { name: "Cuenta corriente", value: 255000000, share: 95 },
        { name: "Efectivo", value: 13000000, share: 4.9 },
      ],
      "money",
    );
    const actualizacion = opcionAnimada(pagos, "barras", "actualizacion");
    expect(actualizacion).toMatchObject({
      animation: true,
      animationDurationUpdate: MOVIMIENTO.graficoActualizacion,
    });
    expect(series(actualizacion)[0]).toMatchObject({ animationDelay: 0 });
    expect(opcionAnimada(pagos, "barras", "sin")).toMatchObject({
      animation: false,
      tooltip: { transitionDuration: MOVIMIENTO.tooltipSegundos },
    });
  });

  it("cada barra lleva su nombre para no mezclar productos al reordenar", () => {
    const opcion = rankingOption(
      [
        { name: "A", value: 5 },
        { name: "B", value: 3 },
      ],
      "units",
    );
    expect(opcion.series[0]!.data).toEqual([
      { name: "B", value: 3, share: undefined },
      { name: "A", value: 5, share: undefined },
    ]);
  });
});

describe("curva de los gráficos (SISTEMA-105)", () => {
  it("barras y línea usan la curva de los números: rápido al principio, lento al final", () => {
    const pagos = rankingOption([{ name: "Efectivo", value: 100 }], "money");
    const [barras] = opcionAnimada(pagos, "barras", "entrada").series as Record<
      string,
      unknown
    >[];
    const curva = barras!.animationEasing as (t: number) => number;
    expect(curva(0.35)).toBeCloseTo(easeOutPower(0.35));
    expect(curva(0.35)).toBeGreaterThan(0.7);
    expect(curva(1)).toBe(1);
  });

  it("cada punto de la línea aparece cuando el trazo llega a él", () => {
    const puntos = Array.from({ length: 11 }, (_, i) => ({
      bucket: `2026-10-${String(i + 1).padStart(2, "0")}`,
      value: "100",
      previous: null,
    }));
    const [actual] = opcionAnimada(
      trendOption(puntos, "day", null),
      "linea",
      "entrada",
    ).series as Record<string, unknown>[];
    const retraso = actual!.animationDelay as (punto?: number | null) => number;
    const curva = actual!.animationEasing as (t: number) => number;
    for (const punto of [0, 3, 5, 10]) {
      const t =
        (retraso(punto) - MOVIMIENTO.lineaRetraso) / MOVIMIENTO.lineaPrincipal;
      expect(curva(t)).toBeCloseTo(punto / 10, 5);
    }
    expect(tiempoParaLlegar(0.75)).toBeLessThan(0.4);
  });
});

describe("tamaño del gráfico con Reportes oculto (SISTEMA-105)", () => {
  const visible = { ancho: 800, alto: 260, oculto: false };

  it("oculto (mide 0) no se toca y al volver igual no se mueve", () => {
    const oculto = ajusteDeTamano(visible, 0, 0);
    expect(oculto).toEqual({
      accion: "nada",
      medida: { ...visible, oculto: true },
    });
    expect(ajusteDeTamano(oculto.medida, 800, 260).accion).toBe("nada");
  });

  it("si cambió el tamaño mientras estaba oculto, se ajusta sin animación", () => {
    const oculto = ajusteDeTamano(visible, 0, 0).medida;
    expect(ajusteDeTamano(oculto, 900, 260)).toEqual({
      accion: "directo",
      medida: { ancho: 900, alto: 260, oculto: false },
    });
  });

  it("visible y con otro tamaño, ajusta con la transición de siempre", () => {
    expect(ajusteDeTamano(visible, 700, 260).accion).toBe("animado");
  });
});
