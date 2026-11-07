import { describe, expect, it } from "vitest";
import {
  platformActionLabel,
  platformActorLabel,
  platformDateLabel,
} from "./platform-audit";

describe("auditoría de plataforma", () => {
  it("traduce las acciones conocidas", () => {
    expect(platformActionLabel("PLATFORM_TOTP_ENROLLED")).toBe(
      "Código configurado",
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
