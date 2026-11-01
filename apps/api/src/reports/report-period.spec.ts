import { BadRequestException } from "@nestjs/common";
import { argentineDate, parseReportPeriod } from "./report-period";

// 31/10/2026 01:30 UTC = 30/10/2026 22:30 en Argentina.
const now = new Date("2026-10-31T01:30:00Z");

describe("parseReportPeriod", () => {
  it("usa la fecha civil de Argentina, no la UTC", () => {
    expect(argentineDate(now)).toBe("2026-10-30");
  });

  it("sin fechas toma los ultimos 30 dias hasta hoy", () => {
    const period = parseReportPeriod({}, now);
    expect(period).toMatchObject({
      from: "2026-10-01",
      to: "2026-10-30",
      comparison: "previous",
    });
  });

  it("incluye todo el ultimo dia hasta la medianoche local", () => {
    const period = parseReportPeriod(
      { from: "2026-10-01", to: "2026-10-31", comparison: "none" },
      new Date("2026-11-05T12:00:00Z"),
    );
    expect(period.start.toISOString()).toBe("2026-10-01T03:00:00.000Z");
    // Una venta a las 23:59 del 31/10 (02:59Z del 01/11) entra; 00:00 local no.
    expect(period.end.toISOString()).toBe("2026-11-01T03:00:00.000Z");
    expect(period.previous).toBeNull();
  });

  it("compara con el periodo anterior de igual duracion", () => {
    const period = parseReportPeriod(
      { from: "2026-10-01", to: "2026-10-10" },
      now,
    );
    expect(period.previous).toMatchObject({
      from: "2026-09-21",
      to: "2026-09-30",
    });
  });

  it("compara con el ano anterior y ajusta el 29 de febrero", () => {
    const period = parseReportPeriod(
      { from: "2024-02-01", to: "2024-02-29", comparison: "yearAgo" },
      now,
    );
    expect(period.previous).toMatchObject({
      from: "2023-02-01",
      to: "2023-02-28",
    });
  });

  it.each([
    [{ from: "2026-10-10", to: "2026-10-01" }, "posterior a Hasta"],
    [{ to: "2026-11-01" }, "no puede ser futura"],
    [{ from: "2025-01-01", to: "2026-10-30" }, "superar 366"],
    [{ from: "2026-02-30" }, "no es válida"],
    [{ to: "30/10/2026" }, "no es válida"],
  ])("rechaza %o", (input, message) => {
    expect(() => parseReportPeriod(input, now)).toThrow(BadRequestException);
    expect(() => parseReportPeriod(input, now)).toThrow(message);
  });
});
