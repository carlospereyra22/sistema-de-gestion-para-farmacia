import { describe, expect, it } from "vitest";
import {
  platformActionLabel,
  platformActorLabel,
  platformAuditDetail,
  platformAuditGroup,
  platformDateLabel,
} from "./platform-audit";

describe("auditoría de plataforma", () => {
  it("traduce las acciones conocidas", () => {
    expect(platformActionLabel("PLATFORM_TOTP_ENROLLED")).toBe(
      "Código configurado",
    );
    expect(platformActionLabel("SOPORTE_ENTRO")).toBe(
      "Entró como usuario (soporte)",
    );
  });

  it("muestra tal cual una acción nueva, sin perderla", () => {
    expect(platformActionLabel("OTRA_ACCION")).toBe("OTRA_ACCION");
  });

  it("identifica a quien actuó, o al comando del servidor", () => {
    expect(platformActorLabel("dani@example.com")).toBe("dani@example.com");
    expect(platformActorLabel(null)).toBe("Comando del servidor");
  });

  it("muestra la hora de Argentina", () => {
    expect(platformDateLabel("2026-11-07T02:30:00.000Z")).toContain("23:30");
  });
});

describe("filtro y detalle de la auditoría (SISTEMA-89)", () => {
  it("agrupa cada acción por tipo", () => {
    expect(platformAuditGroup("SOPORTE_ENTRO")).toBe("soporte");
    expect(platformAuditGroup("PLATFORM_PAYMENT_REGISTERED")).toBe("cobros");
    expect(platformAuditGroup("PLATFORM_PLAN_UPDATED")).toBe("cobros");
    expect(platformAuditGroup("PLATFORM_TOTP_VERIFIED")).toBe("accesos");
    expect(platformAuditGroup("PADRON_CERTIFICADO_CARGADO")).toBe("arca");
    expect(platformAuditGroup("PLATFORM_USER_CREATED")).toBe("farmacias");
  });

  it("en soporte muestra a qué usuario se entró", () => {
    expect(
      platformAuditDetail({
        action: "SOPORTE_ENTRO",
        after: { email: "ana@farmacia.com", sessionId: "s1" },
      }),
    ).toBe("Como ana@farmacia.com");
    expect(
      platformAuditDetail({ action: "PLATFORM_USER_CREATED", after: {} }),
    ).toBeUndefined();
    expect(
      platformAuditDetail({
        action: "PLATFORM_ORGANIZATION_SUSPENDED",
        after: { reason: "No paga hace meses" },
      }),
    ).toBe("Motivo: No paga hace meses");
    expect(platformAuditGroup("PLATFORM_ORGANIZATION_SUSPENDED")).toBe(
      "farmacias",
    );
  });
});
