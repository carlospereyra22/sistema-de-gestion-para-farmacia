import { describe, expect, it } from "vitest";
import type { ReportKpi } from "@gestion/contracts";
import { formatKpiValue, formatMoneyMinor, kpiTrend } from "./report-format";

const kpi = (patch: Partial<ReportKpi>): ReportKpi => ({
  unit: "money",
  available: true,
  value: "198000",
  previous: "100000",
  changePct: 98,
  ...patch,
});
const plain = (text: string) => text.replace(/\s/g, " ");

describe("report format", () => {
  it("muestra pesos argentinos desde centavos", () => {
    expect(plain(formatMoneyMinor("198000"))).toBe("$ 1.980,00");
  });

  it("formatea cantidades y porcentajes con coma decimal", () => {
    expect(formatKpiValue(kpi({ unit: "count", value: "3499" }))).toBe("3.499");
    expect(formatKpiValue(kpi({ unit: "percent", value: "31.94" }))).toBe(
      "31,9 %",
    );
  });

  it("no inventa ceros cuando no hay dato", () => {
    expect(
      formatKpiValue(
        kpi({
          available: false,
          value: null,
          unavailableReason: "NOT_RECORDED",
        }),
      ),
    ).toBe("No disponible");
    expect(
      formatKpiValue(
        kpi({ available: false, value: null, unavailableReason: "NO_DATA" }),
      ),
    ).toBe("—");
  });

  it("sin base de comparacion no muestra variacion", () => {
    expect(kpiTrend(kpi({ changePct: null }))).toMatchObject({
      text: "Sin base de comparación",
      direction: "none",
    });
  });

  it("subir es bueno en ventas y malo en costos", () => {
    expect(kpiTrend(kpi({ changePct: 12.6 }))).toEqual({
      text: "+12,6 %",
      direction: "up",
      tone: "good",
    });
    expect(kpiTrend(kpi({ changePct: 12.6 }), false).tone).toBe("bad");
    expect(kpiTrend(kpi({ changePct: -9.8 }), false)).toMatchObject({
      text: "−9,8 %",
      tone: "good",
    });
  });

  it("los porcentajes varian en puntos porcentuales", () => {
    expect(
      kpiTrend(kpi({ unit: "percent", changePct: 9.6, changePp: 2.8 })).text,
    ).toBe("+2,8 pp");
  });
});
