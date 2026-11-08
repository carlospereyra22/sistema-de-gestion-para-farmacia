import { describe, expect, it, vi } from "vitest";
import {
  conectividad,
  esFallaDeConexion,
  marcarEnLinea,
  marcarSinConexion,
  suscribirConectividad,
} from "./conectividad";

const respuesta = (status: number, tipo = "application/json") =>
  new Response(status === 204 ? null : "x", {
    status,
    headers: { "content-type": tipo },
  });

describe("conectividad", () => {
  it("sin respuesta (error de red) es falla de conexión", () => {
    expect(esFallaDeConexion(undefined)).toBe(true);
  });

  it("el proxy sin servidor (502/503/504) es falla de conexión", () => {
    for (const status of [502, 503, 504])
      expect(esFallaDeConexion(respuesta(status))).toBe(true);
  });

  it("una página de error HTML de un proxy es falla de conexión", () => {
    expect(esFallaDeConexion(respuesta(500, "text/html"))).toBe(true);
  });

  it("los errores propios de la API no son falla de conexión", () => {
    for (const status of [200, 400, 401, 402, 403, 404, 409])
      expect(esFallaDeConexion(respuesta(status))).toBe(false);
    expect(esFallaDeConexion(respuesta(500))).toBe(false);
  });

  it("avisa sólo cuando cambia el estado", () => {
    marcarEnLinea(1);
    const oyente = vi.fn();
    const dejar = suscribirConectividad(oyente);
    marcarEnLinea(2);
    expect(oyente).not.toHaveBeenCalled();
    marcarSinConexion(3);
    marcarSinConexion(4);
    expect(oyente).toHaveBeenCalledTimes(1);
    expect(conectividad()).toEqual({ enLinea: false, desde: 3 });
    marcarEnLinea(5);
    expect(conectividad()).toEqual({ enLinea: true, desde: 5 });
    dejar();
  });
});
