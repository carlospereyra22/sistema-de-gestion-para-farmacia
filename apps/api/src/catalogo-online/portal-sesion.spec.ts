import {
  leerCookiePortal,
  nuevoSecreto,
  secretoCoincide,
} from "./portal-sesion";

describe("catálogo online: sesión del portal", () => {
  const id = "0b7c6f2e-8a51-4c3e-9d0f-1e2a3b4c5d6e";

  it("lee la cookie con id de sesión y secreto", () => {
    expect(leerCookiePortal(`${id}.${"x".repeat(30)}`)).toEqual({
      sessionId: id,
      secreto: "x".repeat(30),
    });
  });

  it("descarta cookies con otra forma", () => {
    expect(leerCookiePortal(undefined)).toBeNull();
    expect(leerCookiePortal("sin-punto")).toBeNull();
    expect(leerCookiePortal(`no-es-uuid.${"x".repeat(30)}`)).toBeNull();
    expect(leerCookiePortal(`${id}.corto`)).toBeNull();
  });

  it("el secreto sólo coincide con su propio hash", () => {
    const { secreto, hash } = nuevoSecreto();
    expect(secretoCoincide(hash, secreto)).toBe(true);
    expect(secretoCoincide(hash, `${secreto}x`)).toBe(false);
    expect(secretoCoincide("corto", secreto)).toBe(false);
  });
});
