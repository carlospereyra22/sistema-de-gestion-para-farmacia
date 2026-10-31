import { expect, it } from "vitest";
import { cashResponsibleLabel } from "./cash-responsible";

it("prefers the historical configured responsible and leaves the actual actor untouched", () => {
  const closure = { registerResponsibleName: "Ana Pérez", closedBy: "Carlo" };
  expect(cashResponsibleLabel(closure)).toBe("Ana Pérez");
  expect(closure.closedBy).toBe("Carlo");
});
it("handles old closures without inventing a responsible", () => {
  expect(cashResponsibleLabel({ closedBy: "Usuario 19344e6e" })).toBe(
    "Usuario sin nombre configurado",
  );
  expect(cashResponsibleLabel({ closedBy: "Carlo" })).toBe("Carlo");
  expect(cashResponsibleLabel({ closedBy: null })).toBe("No registrado");
});
