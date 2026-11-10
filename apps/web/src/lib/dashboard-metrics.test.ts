import { describe, expect, it } from "vitest";
import { dashboardMetrics } from "./dashboard-metrics";

const base = {
  salesTodayCount: 0,
  salesTodayMinor: "0",
  stockLots: 0,
  stockUnits: 0,
  expiringLots: 0,
  pendingPurchases: 0,
  openCashSessions: 0,
};
const debt = {
  count: 1,
  totalMinor: "0",
  overdueMinor: "0",
  todayMinor: "0",
  next7Minor: "0",
  nextDueOn: null,
};
const byKey = (metrics: ReturnType<typeof dashboardMetrics>) =>
  Object.fromEntries(metrics.map((metric) => [metric.key, metric]));

describe("dashboardMetrics", () => {
  it("con una API anterior muestra «—» en lo que no informa", () => {
    const metrics = byKey(dashboardMetrics(base, undefined));
    expect(metrics.averageTicket?.value).toBe("—");
    expect(metrics.receivables?.value).toBe("—");
    expect(metrics.supplierDebt?.value).toBe("—");
    expect(metrics.purchases?.value).toBe("0");
  });

  it("la caja abierta muestra el efectivo esperado", () => {
    const metrics = byKey(
      dashboardMetrics(base, { expectedAmountMinor: "150000" }),
    );
    expect(metrics.cash?.value).toContain("1.500");
    expect(metrics.cash?.tone).toBe("emerald");
    expect(byKey(dashboardMetrics(base, undefined)).cash?.value).toBe(
      "Cerrada",
    );
  });

  it("la deuda muestra el total adeudado y en la nota lo vencido y lo próximo", () => {
    const metrics = byKey(
      dashboardMetrics(
        {
          ...base,
          supplierDebt: {
            ...debt,
            totalMinor: "61981608",
            overdueMinor: "10000",
            next7Minor: "5000",
          },
        },
        undefined,
      ),
    );
    expect(metrics.supplierDebt?.value).toContain("619.816,08");
    expect(metrics.supplierDebt?.note).toContain("100,00 vencido");
    expect(metrics.supplierDebt?.note).toContain("50,00 vence en 7 días");
    expect(metrics.supplierDebt?.tone).toBe("rose");
  });

  it("con todo a vencer más adelante muestra el total y el próximo vencimiento", () => {
    const metrics = byKey(
      dashboardMetrics(
        {
          ...base,
          supplierDebt: {
            ...debt,
            totalMinor: "61981608",
            nextDueOn: "2026-12-08",
          },
        },
        undefined,
      ),
    );
    expect(metrics.supplierDebt?.value).toContain("619.816,08");
    expect(metrics.supplierDebt?.note).toBe(
      "Al día · próximo vencimiento 08/12/26",
    );
    expect(metrics.supplierDebt?.tone).toBe("teal");
  });

  it("sin deudas lo dice", () => {
    expect(
      byKey(dashboardMetrics({ ...base, supplierDebt: debt }, undefined))
        .supplierDebt?.note,
    ).toBe("Sin deudas pendientes");
  });

  it("con varias cajas muestra cuántas están abiertas y una fila por caja", () => {
    const metrics = byKey(
      dashboardMetrics(
        {
          ...base,
          cashRegisters: [
            { id: "1", name: "Caja 1", open: false, expectedAmountMinor: null },
            {
              id: "2",
              name: "Caja 2",
              open: true,
              expectedAmountMinor: "20000",
            },
            {
              id: "3",
              name: "Caja 3",
              open: true,
              expectedAmountMinor: "5000",
            },
          ],
        },
        // La sesión de la caja elegida no pisa el detalle por caja.
        { expectedAmountMinor: "99999" },
      ),
    );
    expect(metrics.cash?.label).toBe("Cajas");
    expect(metrics.cash?.value).toBe("2 de 3 abiertas");
    expect(metrics.cash?.note).toContain("250,00 esperado en total");
    expect(metrics.cash?.note).toContain("1 caja más");
    expect(metrics.cash?.rows?.map((row) => row.label)).toEqual([
      "Caja 2",
      "Caja 3",
    ]);
  });

  it("con una sola caja usa su nombre y su efectivo esperado", () => {
    const metrics = byKey(
      dashboardMetrics(
        {
          ...base,
          cashRegisters: [
            {
              id: "1",
              name: "Mostrador",
              open: true,
              expectedAmountMinor: "7000",
            },
          ],
        },
        undefined,
      ),
    );
    expect(metrics.cash?.label).toBe("Mostrador");
    expect(metrics.cash?.value).toContain("70,00");
    expect(metrics.cash?.rows).toBeUndefined();
  });
});
