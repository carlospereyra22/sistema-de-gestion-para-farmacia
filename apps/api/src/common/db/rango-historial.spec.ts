import { rangoDeHistorial } from "./rango-historial";

describe("rangoDeHistorial", () => {
  // 10/11/2026 a las 23:30 de Argentina = 11/11 02:30 UTC.
  const ahora = new Date("2026-11-11T02:30:00.000Z");

  it("sin fechas trae los últimos 90 días de Argentina", () => {
    const { inicio, fin } = rangoDeHistorial({}, ahora);
    // 10/11 menos 90 días = 12/08, desde las 00:00 de Argentina.
    expect(inicio.toISOString()).toBe("2026-08-12T03:00:00.000Z");
    expect(fin).toBeUndefined();
  });

  it("con fechas va del inicio de desde al final de hasta", () => {
    const { inicio, fin } = rangoDeHistorial(
      { desde: "2025-01-01", hasta: "2025-01-31" },
      ahora,
    );
    expect(inicio.toISOString()).toBe("2025-01-01T03:00:00.000Z");
    expect(fin?.toISOString()).toBe("2025-02-01T02:59:59.999Z");
  });

  it("rechaza fechas inválidas o invertidas", () => {
    expect(() => rangoDeHistorial({ desde: "2025-02-30" }, ahora)).toThrow();
    expect(() =>
      rangoDeHistorial({ desde: "2025-02-01", hasta: "2025-01-01" }, ahora),
    ).toThrow();
  });
});
