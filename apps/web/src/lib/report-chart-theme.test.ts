import { expect, it } from "vitest";
import {
  adaptarOpcionAlTema,
  reportChartTheme,
  reportChartThemeOscuro,
  reportPalette,
} from "./report-chart-theme";

it("en modo claro deja la opción del gráfico tal cual", () => {
  const opcion = { color: reportPalette[0] };
  expect(adaptarOpcionAlTema(opcion, "claro")).toBe(opcion);
});

it("en modo oscuro cambia los colores conocidos sin tocar formatters ni datos", () => {
  const formatter = () => "texto";
  const opcion = {
    series: [
      {
        name: "Ventas",
        itemStyle: { color: reportPalette[1] },
        label: { color: "#475569", formatter },
        data: [1, 2, 3],
      },
    ],
    yAxis: { axisLabel: { color: "#334155" } },
  };
  const oscura = adaptarOpcionAlTema(opcion, "oscuro");
  expect(oscura.series[0]?.itemStyle.color).not.toBe(reportPalette[1]);
  expect(oscura.series[0]?.label.color).not.toBe("#475569");
  expect(oscura.yAxis.axisLabel.color).not.toBe("#334155");
  expect(oscura.series[0]?.label.formatter).toBe(formatter);
  expect(oscura.series[0]?.name).toBe("Ventas");
  expect(oscura.series[0]?.data).toEqual([1, 2, 3]);
  // La original no se modifica.
  expect(opcion.series[0]?.itemStyle.color).toBe(reportPalette[1]);
});

it("el tema oscuro de los gráficos usa tooltip y textos oscuros/claros", () => {
  expect(reportChartTheme.tooltip.backgroundColor).toBe("#ffffff");
  expect(reportChartThemeOscuro.tooltip.backgroundColor).not.toBe("#ffffff");
  expect(reportChartThemeOscuro.color).toHaveLength(reportPalette.length);
});
