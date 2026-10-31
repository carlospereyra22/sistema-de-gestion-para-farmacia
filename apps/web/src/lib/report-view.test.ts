import { describe, expect, it } from "vitest";
import {
  argentineToday,
  branchChoices,
  customRangeError,
  defaultReportView,
  presetRange,
  readReportView,
  resolveBranchId,
  writeReportView,
} from "./report-view";

const today = "2026-10-31";
const centro = { id: "b1", name: "Centro" };
const norte = { id: "b2", name: "Norte" };

describe("report view", () => {
  it("usa la fecha de Argentina aunque en UTC ya sea otro dia", () => {
    expect(argentineToday(new Date("2026-11-01T02:30:00Z"))).toBe(today);
  });

  it.each([
    ["today", "2026-10-31", "2026-10-31"],
    ["yesterday", "2026-10-30", "2026-10-30"],
    ["last7", "2026-10-25", "2026-10-31"],
    ["last30", "2026-10-02", "2026-10-31"],
    ["thisMonth", "2026-10-01", "2026-10-31"],
    ["lastMonth", "2026-09-01", "2026-09-30"],
    ["thisYear", "2026-01-01", "2026-10-31"],
  ] as const)("el periodo %s va de %s a %s", (preset, from, to) => {
    expect(presetRange(preset, today)).toEqual({ from, to });
  });

  it("mes anterior en enero es diciembre del ano pasado", () => {
    expect(presetRange("lastMonth", "2027-01-15")).toEqual({
      from: "2026-12-01",
      to: "2026-12-31",
    });
  });

  it.each([
    ["", today, "Completá"],
    ["2026-02-30", today, "Completá"],
    ["2026-10-10", "2026-10-01", "posterior"],
    ["2026-10-01", "2026-11-01", "futura"],
    ["2025-01-01", today, "366"],
  ])("rechaza el rango %s a %s", (from, to, message) => {
    expect(customRangeError(from, to, today)).toContain(message);
  });

  it("con una sucursal no ofrece Todas", () => {
    expect(branchChoices([centro])).toEqual([centro]);
    expect(resolveBranchId("all", [centro])).toBe("b1");
  });

  it("con dos o mas sucursales ofrece Todas primero", () => {
    expect(branchChoices([centro, norte]).map((item) => item.name)).toEqual([
      "Todas las sucursales",
      "Centro",
      "Norte",
    ]);
    expect(resolveBranchId("b2", [centro, norte])).toBe("b2");
    expect(resolveBranchId("vieja", [centro, norte])).toBe("all");
  });

  it("por defecto muestra Resumen de los ultimos 30 dias", () => {
    expect(
      readReportView(new URLSearchParams("pagina=reportes"), today),
    ).toEqual(defaultReportView(today));
  });

  it("guarda y recupera la vista en la URL sin tocar pagina", () => {
    const view = {
      tab: "sales" as const,
      preset: "custom" as const,
      from: "2026-09-01",
      to: "2026-09-15",
      branchId: "b2",
      comparison: "yearAgo" as const,
    };
    const params = writeReportView(
      new URLSearchParams("pagina=reportes"),
      view,
    );
    expect(params.get("pagina")).toBe("reportes");
    expect(params.get("seccion")).toBe("ventas");
    expect(readReportView(params, today)).toEqual(view);
  });

  it("ignora valores invalidos de la URL", () => {
    const view = readReportView(
      new URLSearchParams(
        "seccion=otra&periodo=custom&desde=2026-10-10&hasta=2026-10-01&comparar=x",
      ),
      today,
    );
    expect(view).toEqual(defaultReportView(today));
  });
});
