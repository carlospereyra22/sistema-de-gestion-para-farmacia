import { describe, expect, it } from "vitest";
import type { PlatformOrganization } from "./platform-api";
import { etiquetaDeMes, farmaciasPorEstado } from "./platform-resumen";

function farmacia(
  id: string,
  sub: Partial<NonNullable<PlatformOrganization["subscription"]>> | null,
  balanceMinor = "0",
): PlatformOrganization {
  return {
    id,
    name: `Farmacia ${id}`,
    createdAt: "2026-01-01T00:00:00.000Z",
    balanceMinor,
    activeBranches: 1,
    activeUsers: 1,
    subscription:
      sub &&
      ({
        stage: "ACTIVE",
        access: "FULL",
        daysOverdue: 0,
        nextCut: null,
        exempt: false,
        trialEndsAt: null,
        paidThrough: null,
        extendedUntil: null,
        extendedReason: null,
        extraUsers: 0,
        extraBranches: 0,
        agreedPriceMinor: null,
        contactName: null,
        contactPhone: null,
        contactEmail: null,
        feeMinor: "0",
        quota: { users: 1, branches: 1 },
        ...sub,
      } as NonNullable<PlatformOrganization["subscription"]>),
  };
}

describe("resúmenes del panel de plataforma", () => {
  it("cuenta las farmacias por grupo de estado", () => {
    const grupos = farmaciasPorEstado([
      farmacia("a", { stage: "ACTIVE" }),
      farmacia("b", { stage: "TRIAL" }),
      farmacia("c", { stage: "GRACE" }),
      farmacia("d", { stage: "BLOCKED" }),
      farmacia("e", { stage: "EXEMPT", exempt: true }),
      farmacia("f", null),
    ]);
    expect(grupos.map(({ grupo, cantidad }) => [grupo, cantidad])).toEqual([
      ["al-dia", 2],
      ["aviso", 1],
      ["cortadas", 1],
      ["sin-cobro", 1],
    ]);
  });

  it("nombra los meses del gráfico y marca el cambio de año", () => {
    expect(etiquetaDeMes("2026-11")).toBe("nov");
    expect(etiquetaDeMes("2026-01")).toBe("ene 26");
  });
});
