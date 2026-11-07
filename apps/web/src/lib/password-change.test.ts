import { describe, expect, it } from "vitest";
import { passwordChangeError, passwordChangedMessage } from "./password-change";

const valid = {
  currentPassword: "clave-temporal-1",
  newPassword: "clave-elegida-12",
  repeat: "clave-elegida-12",
};

describe("passwordChangeError", () => {
  it("acepta un cambio válido", () => {
    expect(passwordChangeError(valid)).toBeUndefined();
  });

  it("pide la contraseña actual", () => {
    expect(passwordChangeError({ ...valid, currentPassword: "" })).toBe(
      "Ingresá tu contraseña actual.",
    );
  });

  it("exige 12 caracteres", () => {
    expect(
      passwordChangeError({ ...valid, newPassword: "corta", repeat: "corta" }),
    ).toBe("Usá al menos 12 caracteres.");
  });

  it("exige que las dos coincidan", () => {
    expect(passwordChangeError({ ...valid, repeat: "otra-clave-123" })).toBe(
      "Las contraseñas no coinciden.",
    );
  });

  it("no acepta repetir la actual", () => {
    expect(
      passwordChangeError({
        currentPassword: valid.newPassword,
        newPassword: valid.newPassword,
        repeat: valid.newPassword,
      }),
    ).toBe("La contraseña nueva tiene que ser distinta de la actual.");
  });
});

describe("passwordChangedMessage", () => {
  it.each([
    [0, "Contraseña cambiada."],
    [1, "Contraseña cambiada. Se cerró tu otra sesión abierta."],
    [3, "Contraseña cambiada. Se cerraron tus otras 3 sesiones abiertas."],
  ])("con %i sesiones cerradas", (revokedSessions, message) => {
    expect(passwordChangedMessage(revokedSessions)).toBe(message);
  });
});
