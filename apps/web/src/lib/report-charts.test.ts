import { describe, expect, it } from "vitest";
import { bucketLabel, rankingOption, trendOption } from "./report-charts";

describe("report charts", () => {
  it("etiqueta dias y meses en formato argentino", () => {
    expect(bucketLabel("2026-10-05", "day")).toBe("05/10");
    expect(bucketLabel("2026-10-01", "month")).toMatch(/oct/);
  });

  it("la evolucion agrega la linea del periodo anterior solo si se compara", () => {
    const points = [
      { bucket: "2026-10-01", value: "1000", previous: "500" },
      { bucket: "2026-10-02", value: "-200", previous: null },
    ];
    const compared = trendOption(points, "day", "Período anterior");
    expect(compared.series).toHaveLength(2);
    expect(compared.series[1]).toMatchObject({ data: [500, 0] });
    expect(trendOption(points, "day", null).series).toHaveLength(1);
  });

  it("las barras de medios de pago muestran monto y porcentaje", () => {
    const option = rankingOption(
      [
        { name: "Efectivo", value: 150000, share: 60 },
        { name: "Tarjeta", value: 100000, share: 40 },
      ],
      "money",
    );
    expect(option.yAxis.data).toEqual(["Tarjeta", "Efectivo"]);
    const label = option.series[0]!.label.formatter({
      value: 150000,
      data: { share: 60 },
    });
    expect(label).toContain("60 %");
  });

  it("el ranking muestra el primero arriba", () => {
    const option = rankingOption(
      [
        { name: "A", value: 10 },
        { name: "B", value: 5 },
      ],
      "units",
    );
    expect(option.yAxis.data).toEqual(["B", "A"]);
  });
});
