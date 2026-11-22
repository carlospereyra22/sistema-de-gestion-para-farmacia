import { ageBalance, agingBucket } from "./report-customers.service";
import { bucketEnds, coverageDays } from "./report-inventory.service";
import { abcClasses, paretoCount } from "./report-products.service";
import { dueBucket, weightedCostChange } from "./report-purchases.service";
import { marginPct } from "./report-tab-helpers";

describe("reglas de las pestañas de Reportes (SISTEMA-116)", () => {
  it("margen ponderado por importe, nunca promedio de porcentajes", () => {
    // Dos productos: 100 con 50 de ganancia y 900 con 90: 140 / 1000 = 14 %.
    expect(marginPct(140n, 1000n)).toBe(14);
    expect(marginPct(0n, 0n)).toBeNull();
  });

  it("Pareto: cuántos productos hacen el 80 % de la venta", () => {
    expect(paretoCount([500n, 300n, 100n, 50n, 50n])).toBe(2);
    expect(paretoCount([100n])).toBe(1);
    expect(paretoCount([])).toBe(0);
  });

  it("días de cobertura con la venta diaria", () => {
    expect(coverageDays(30, 2)).toBe(15);
    expect(coverageDays(5, 0.3)).toBe(16);
    expect(coverageDays(10, null)).toBeNull();
  });

  it("el último tramo termina ahora si el período no terminó", () => {
    const now = new Date("2026-11-22T15:00:00Z");
    const ends = bucketEnds(
      ["2026-11-20", "2026-11-21", "2026-11-22"],
      new Date("2026-11-23T03:00:00Z"),
      now,
    );
    expect(ends[0]?.toISOString()).toBe("2026-11-21T03:00:00.000Z");
    expect(ends.at(-1)?.toISOString()).toBe(now.toISOString());
  });

  it("variación de costos ponderada por lo comprado", () => {
    // +10 % en 9 unidades y −50 % en 1: pesa más lo que más se compra.
    expect(
      weightedCostChange([
        { previous: 1000n, current: 1100n, quantity: 9 },
        { previous: 1000n, current: 500n, quantity: 1 },
      ]),
    ).toBe(4);
    expect(weightedCostChange([])).toBeNull();
  });

  it("antigüedad por vencimiento real, imputando lo cobrado a lo más viejo", () => {
    const today = "2026-11-22";
    expect(agingBucket(null, today)).toBe("undated");
    expect(agingBucket("2026-11-22", today)).toBe("current");
    expect(agingBucket("2026-11-21", today)).toBe("1-30");
    expect(agingBucket("2026-07-01", today)).toBe("120+");
    // Debe 1500 de tres ventas de 1000: lo pendiente es la más nueva y media
    // de la del medio; la más vieja ya está cobrada.
    const parts = ageBalance(
      1500n,
      [
        { amount: 1000n, dueOn: "2026-09-01" },
        { amount: 1000n, dueOn: "2026-10-15" },
        { amount: 1000n, dueOn: "2026-12-01" },
      ],
      today,
    );
    expect(parts).toEqual([
      { bucket: "current", amount: 1000n, daysLate: 0 },
      { bucket: "31-60", amount: 500n, daysLate: 38 },
    ]);
    // Un saldo sin ventas que lo expliquen queda sin vencimiento.
    expect(ageBalance(200n, [], today)).toEqual([
      { bucket: "undated", amount: 200n, daysLate: 0 },
    ]);
  });

  it("ABC: A hasta el 80 %, B hasta el 95 %, C el resto", () => {
    expect(abcClasses([600n, 200n, 100n, 60n, 40n])).toEqual([
      { id: "A", products: 2, sharePct: 80 },
      { id: "B", products: 2, sharePct: 16 },
      { id: "C", products: 1, sharePct: 4 },
    ]);
    expect(abcClasses([])).toEqual([
      { id: "A", products: 0, sharePct: null },
      { id: "B", products: 0, sharePct: null },
      { id: "C", products: 0, sharePct: null },
    ]);
  });

  it("calendario de pagos: vence hoy cuenta como esta semana", () => {
    expect(dueBucket(-1)).toBe("overdue");
    expect(dueBucket(0)).toBe("week");
    expect(dueBucket(10)).toBe("2weeks");
    expect(dueBucket(25)).toBe("month");
    expect(dueBucket(45)).toBe("2months");
    expect(dueBucket(90)).toBe("later");
    expect(dueBucket(null)).toBe("undated");
  });
});
