import { describe, expect, it } from "vitest";
import {
  aTexto,
  desdeTexto,
  formatoCorto,
  nombreDelMes,
  semanasDelMes,
  sumarDias,
  sumarMeses,
} from "./calendario";

describe("calendario del selector de fecha", () => {
  it("lee y escribe el mismo texto que <input type=date>", () => {
    expect(desdeTexto("2026-11-19")).toEqual({ anio: 2026, mes: 11, dia: 19 });
    expect(aTexto({ anio: 2026, mes: 1, dia: 5 })).toBe("2026-01-05");
    expect(desdeTexto("")).toBeNull();
    // Fechas que no existen no se corren al mes siguiente.
    expect(desdeTexto("2026-02-31")).toBeNull();
    expect(desdeTexto("19/11/2026")).toBeNull();
  });

  it("suma días y meses cruzando meses y años", () => {
    expect(sumarDias({ anio: 2026, mes: 12, dia: 31 }, 1)).toEqual({
      anio: 2027,
      mes: 1,
      dia: 1,
    });
    expect(sumarMeses({ anio: 2026, mes: 1, dia: 31 }, 1)).toEqual({
      anio: 2026,
      mes: 2,
      dia: 28,
    });
    expect(sumarMeses({ anio: 2026, mes: 1, dia: 15 }, -1)).toEqual({
      anio: 2025,
      mes: 12,
      dia: 15,
    });
  });

  it("arma el mes en 6 semanas que empiezan el lunes", () => {
    // Noviembre 2026 empieza un domingo: la primera fila arranca el lunes 26/10.
    const semanas = semanasDelMes(2026, 11);
    expect(semanas).toHaveLength(6);
    expect(semanas[0]![0]).toEqual({ anio: 2026, mes: 10, dia: 26 });
    expect(semanas[0]![6]).toEqual({ anio: 2026, mes: 11, dia: 1 });
    expect(semanas.flat()).toHaveLength(42);
  });

  it("muestra las fechas como se leen acá", () => {
    expect(formatoCorto({ anio: 2026, mes: 3, dia: 7 })).toBe("07/03/2026");
    expect(nombreDelMes(2026, 11)).toBe("Noviembre 2026");
  });
});
