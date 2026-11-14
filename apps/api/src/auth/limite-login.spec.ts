import { HttpException } from "@nestjs/common";

import { INTENTOS_MAXIMOS, LimiteDeLogin, VENTANA_MS } from "./limite-login";

describe("LimiteDeLogin", () => {
  const fallar = (limite: LimiteDeLogin, email: string, veces: number, t = 0) =>
    Array.from({ length: veces }).forEach(() =>
      limite.registrarFallo(email, t),
    );

  it("deja pasar mientras no se agoten los intentos", () => {
    const limite = new LimiteDeLogin();
    fallar(limite, "a@farmacia.com", INTENTOS_MAXIMOS - 1);
    expect(() => limite.comprobar("a@farmacia.com", 0)).not.toThrow();
  });

  it("bloquea con 429 al agotar los intentos, sin distinguir mayúsculas", () => {
    const limite = new LimiteDeLogin();
    fallar(limite, "A@Farmacia.com ", INTENTOS_MAXIMOS);
    try {
      limite.comprobar("a@farmacia.com", 60_000);
      throw new Error("debía bloquear");
    } catch (error) {
      expect(error).toBeInstanceOf(HttpException);
      expect((error as HttpException).getStatus()).toBe(429);
      expect((error as HttpException).message).toContain("4 min");
    }
  });

  it("no afecta a otros correos", () => {
    const limite = new LimiteDeLogin();
    fallar(limite, "a@farmacia.com", INTENTOS_MAXIMOS);
    expect(() => limite.comprobar("b@farmacia.com", 0)).not.toThrow();
  });

  it("libera al pasar la ventana y vuelve a contar desde cero", () => {
    const limite = new LimiteDeLogin();
    fallar(limite, "a@farmacia.com", INTENTOS_MAXIMOS);
    expect(() => limite.comprobar("a@farmacia.com", VENTANA_MS)).not.toThrow();
    limite.registrarFallo("a@farmacia.com", VENTANA_MS);
    expect(() =>
      limite.comprobar("a@farmacia.com", VENTANA_MS + 1),
    ).not.toThrow();
  });

  it("un inicio correcto borra los fallos anteriores", () => {
    const limite = new LimiteDeLogin();
    fallar(limite, "a@farmacia.com", INTENTOS_MAXIMOS - 1);
    limite.registrarExito("a@farmacia.com");
    limite.registrarFallo("a@farmacia.com", 0);
    expect(() => limite.comprobar("a@farmacia.com", 0)).not.toThrow();
  });
});
