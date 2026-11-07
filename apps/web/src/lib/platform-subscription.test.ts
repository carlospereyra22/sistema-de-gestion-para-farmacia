import { describe, expect, it } from "vitest";
import {
  coveredUntilLabel,
  filterOrganizations,
  nextCutLabel,
  quotaFull,
  stageFilterOptions,
  stageLabel,
  stageTone,
  summarizeOrganizations,
  usageLabel,
  type SubscriptionStage,
} from "./platform-subscription";

const row = (name: string, stage: SubscriptionStage, feeMinor = "6500000") => ({
  name,
  subscription: { stage, feeMinor },
});

describe("próximo corte", () => {
  it("dice qué pasa y cuándo", () => {
    expect(nextCutLabel({ access: "READ_ONLY", on: "2026-11-12" })).toBe(
      "Solo lectura el 12/11/2026",
    );
    expect(nextCutLabel({ access: "BLOCKED", on: "2026-12-01" })).toBe(
      "Se bloquea el 01/12/2026",
    );
  });

  it("sin corte próximo no muestra nada", () => {
    expect(nextCutLabel(null)).toBe("—");
  });
});

describe("cupo completo", () => {
  it("se llena al llegar al límite, y también si lo supera", () => {
    expect(quotaFull(1, 2, false)).toBe(false);
    expect(quotaFull(2, 2, false)).toBe(true);
    expect(quotaFull(3, 2, false)).toBe(true);
  });

  it("una exenta nunca se llena", () => {
    expect(quotaFull(9, 1, true)).toBe(false);
  });
});

describe("estado de una farmacia", () => {
  it("traduce cada etapa", () => {
    expect(stageLabel("READ_ONLY")).toBe("Solo lectura");
    expect(stageTone("BLOCKED")).toBe("danger");
    expect(stageTone("ACTIVE")).toBe("ok");
  });

  it("ofrece todas las etapas para filtrar", () => {
    expect(stageFilterOptions[0]).toEqual({
      value: "ALL",
      label: "Todos los estados",
    });
    expect(stageFilterOptions).toHaveLength(10);
  });
});

describe("summarizeOrganizations", () => {
  it("cuenta las atrasadas y suma lo que se cobra por mes", () => {
    expect(
      summarizeOrganizations([
        row("Juncos", "EXEMPT", "0"),
        row("Una", "ACTIVE"),
        row("Dos", "TRIAL"),
        row("Tres", "GRACE"),
        row("Cuatro", "BLOCKED"),
      ]),
    ).toEqual({
      total: 5,
      trial: 1,
      late: 2,
      monthlyMinor: "26000000",
    });
  });

  it("una farmacia dada de baja no suma al abono", () => {
    expect(summarizeOrganizations([row("Una", "CANCELLED")]).monthlyMinor).toBe(
      "0",
    );
  });

  it("no se rompe con una farmacia sin suscripción", () => {
    expect(
      summarizeOrganizations([{ name: "Vieja", subscription: null }]),
    ).toEqual({ total: 1, trial: 0, late: 0, monthlyMinor: "0" });
  });
});

describe("filterOrganizations", () => {
  const rows = [row("Farmacia Juncos", "EXEMPT"), row("Del Sol", "TRIAL")];

  it("busca por nombre sin distinguir mayúsculas", () => {
    expect(filterOrganizations(rows, "JUNCOS", "ALL")).toEqual([rows[0]]);
  });

  it("filtra por estado", () => {
    expect(filterOrganizations(rows, "", "TRIAL")).toEqual([rows[1]]);
  });
});

describe("usageLabel", () => {
  it("muestra lo usado contra lo contratado", () => {
    expect(usageLabel(2, 3, false)).toBe("2 / 3");
    expect(usageLabel(2, 3, false, " de ")).toBe("2 de 3");
  });

  it("una exenta no tiene cupo: solo muestra lo usado", () => {
    expect(usageLabel(3, 1, true)).toBe("3");
  });
});

describe("coveredUntilLabel", () => {
  const empty = {
    exempt: false,
    trialEndsAt: null,
    paidThrough: null,
    extendedUntil: null,
  };

  it("una exenta no vence", () => {
    expect(coveredUntilLabel({ ...empty, exempt: true })).toBe(
      "Sin vencimiento",
    );
  });

  it("toma la fecha más lejana", () => {
    expect(
      coveredUntilLabel({
        ...empty,
        paidThrough: "2026-11-01",
        extendedUntil: "2026-12-15",
      }),
    ).toBe("15/12/2026");
  });
});
