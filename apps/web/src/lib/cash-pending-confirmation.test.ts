import { describe, expect, it } from "vitest";
import { pendingConfirmationCopy } from "./cash-pending-confirmation";

describe("pendingConfirmationCopy", () => {
  it("pregunta por la caja y aclara que asignar no mueve dinero", () => {
    const copy = pendingConfirmationCopy("destination", "Caja demo", "4425000");
    expect(copy.question).toBe("¿Querés asignar este cobro a Caja demo?");
    expect(copy.detail).toContain("Todavía no ingresa dinero");
  });
  it("muestra el efectivo que ingresa y que no se puede deshacer", () => {
    const { question, detail } = pendingConfirmationCopy(
      "incorporate",
      "Caja demo",
      "4425000",
    );
    expect(question).toBe("¿Querés incorporar este cobro a Caja demo?");
    expect(detail).toContain("44.250,00");
    expect(detail).toContain("no se puede deshacer");
  });
  it("no promete efectivo en un cobro con tarjeta o transferencia", () => {
    const { detail } = pendingConfirmationCopy("incorporate", "Caja demo", "0");
    expect(detail).toContain("No ingresa efectivo");
  });
  it("aclara que quitar la caja no mueve dinero", () => {
    const copy = pendingConfirmationCopy("clear", "Caja demo", "4425000");
    expect(copy.question).toBe("¿Querés quitar Caja demo de este cobro?");
    expect(copy.detail).toContain("No mueve dinero");
  });
});
