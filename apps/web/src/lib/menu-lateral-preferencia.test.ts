import { afterEach, describe, expect, it, vi } from "vitest";
import {
  guardarPreferenciaMenu,
  leerPreferenciaMenu,
  menuAbiertoAlEntrar,
} from "./menu-lateral-preferencia";

describe("preferencia del menú lateral", () => {
  afterEach(() => vi.unstubAllGlobals());

  const almacen = () => {
    const datos = new Map<string, string>();
    vi.stubGlobal("window", {
      localStorage: {
        getItem: (k: string) => datos.get(k) ?? null,
        setItem: (k: string, v: string) => void datos.set(k, v),
      },
    });
  };

  it("recuerda lo que eligió cada usuario", () => {
    almacen();
    guardarPreferenciaMenu("Ana@Farmacia.com", "cerrado");
    guardarPreferenciaMenu("luis@farmacia.com", "abierto");
    expect(leerPreferenciaMenu("ana@farmacia.com")).toBe("cerrado");
    expect(leerPreferenciaMenu("luis@farmacia.com")).toBe("abierto");
    expect(leerPreferenciaMenu("otra@farmacia.com")).toBeUndefined();
  });

  it("si el navegador no deja guardar, no rompe", () => {
    vi.stubGlobal("window", {
      localStorage: {
        getItem: () => {
          throw new Error("bloqueado");
        },
        setItem: () => {
          throw new Error("bloqueado");
        },
      },
    });
    expect(() => guardarPreferenciaMenu("ana", "abierto")).not.toThrow();
    expect(leerPreferenciaMenu("ana")).toBeUndefined();
  });

  it("arranca como lo dejó; en el celular siempre cerrado", () => {
    const grande = { grande: true, celular: false };
    const notebook = { grande: false, celular: false };
    const celular = { grande: false, celular: true };
    expect(menuAbiertoAlEntrar(undefined, grande)).toBe(true);
    expect(menuAbiertoAlEntrar(undefined, notebook)).toBe(false);
    expect(menuAbiertoAlEntrar("cerrado", grande)).toBe(false);
    expect(menuAbiertoAlEntrar("abierto", notebook)).toBe(true);
    expect(menuAbiertoAlEntrar("abierto", celular)).toBe(false);
  });
});
