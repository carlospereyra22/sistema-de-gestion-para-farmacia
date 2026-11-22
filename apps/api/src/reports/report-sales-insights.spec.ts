import {
  byWeekday,
  highlight,
  strongest,
  unitsPerTicket,
} from "./report-sales-insights";

describe("lectura rápida de Ventas", () => {
  it("elige el tramo más fuerte y su participación", () => {
    const rows = [
      { hour: 9, amount: 1000n },
      { hour: 18, amount: 3000n },
      { hour: 19, amount: 3000n },
    ];
    expect(strongest(rows)?.hour).toBe(18);
    expect(highlight(rows)).toEqual({
      row: { hour: 18, amount: 3000n },
      sharePct: 42.8,
    });
  });

  it("sin ventas no inventa un tramo", () => {
    expect(strongest([{ hour: 9, amount: 0n }])).toBeNull();
    expect(highlight([])).toBeNull();
  });

  it("suma el mapa de calor por día de la semana, de lunes a domingo", () => {
    const days = byWeekday([
      { weekday: 6, amount: 3000n },
      { weekday: 2, amount: 1000n },
      { weekday: 6, amount: 1000n },
    ]);
    expect(days).toHaveLength(7);
    expect(days[1]).toEqual({ weekday: 2, amount: 1000n });
    expect(days[5]).toEqual({ weekday: 6, amount: 4000n });
    expect(days[0]).toEqual({ weekday: 1, amount: 0n });
  });

  it("unidades por ticket con un decimal", () => {
    expect(unitsPerTicket(7, 3)).toBe(2.3);
    expect(unitsPerTicket(5, 0)).toBeNull();
  });
});
