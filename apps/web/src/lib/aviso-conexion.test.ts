import { describe, expect, it } from "vitest";
import { avisoConexion } from "./aviso-conexion";

describe("aviso de conexión", () => {
  it("no muestra nada con conexión y sesión normal", () => {
    expect(avisoConexion({ enLinea: true, sinSesion: false })).toBeNull();
  });

  it("sin conexión muestra la hora de los datos", () => {
    const aviso = avisoConexion({
      enLinea: false,
      sinSesion: true,
      ultimaSincronizacion: Date.parse("2026-11-07T12:05:00Z"),
    });
    expect(aviso?.etiqueta).toBe("Sin conexión · datos de las 09:05");
    expect(aviso?.texto).toContain("vender, cobrar y guardar cambios");
  });

  it("sin hora guardada no inventa una", () => {
    expect(avisoConexion({ enLinea: false, sinSesion: false })?.etiqueta).toBe(
      "Sin conexión",
    );
  });

  it("al volver el servidor avisa que se está reconectando", () => {
    expect(avisoConexion({ enLinea: true, sinSesion: true })?.etiqueta).toBe(
      "Reconectando…",
    );
  });
});
