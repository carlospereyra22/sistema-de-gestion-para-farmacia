import { beforeEach, describe, expect, it } from "vitest";
import { almacenEnMemoria, almacenLocal, usarAlmacen } from "./almacen-local";
import {
  CLAVE_INCORRECTA,
  SIN_ACCESO_GUARDADO,
  entrarSinConexion,
  guardarAcceso,
  reiniciarIntentos,
} from "./acceso-sin-conexion";
import { VIGENCIA_SIN_CONEXION_MS } from "./cache-local";
import type { CurrentUserProfile } from "./api";

const ahora = Date.parse("2026-11-08T12:00:00.000Z");
const ana: CurrentUserProfile = {
  email: "Ana@Farmacia.com",
  organizations: [{ organizationId: "o1" }],
};
// Pocas iteraciones: el test no mide la seguridad, sólo el comportamiento.
const guardar = (cuando = ahora) =>
  guardarAcceso("clave-de-ana-123", ana, cuando, 1000);

describe("entrar sin conexión", () => {
  beforeEach(() => {
    usarAlmacen(almacenEnMemoria());
    reiniciarIntentos();
  });

  it("entra con la contraseña de quien usó la PC hace menos de 24 horas", async () => {
    await guardar();
    const resultado = await entrarSinConexion(
      "ana@farmacia.com",
      "clave-de-ana-123",
      ahora + 60_000,
    );
    expect(resultado).toMatchObject({
      ok: true,
      sesion: { alcance: "ana@farmacia.com", perfil: ana },
    });
  });

  it("nunca guarda la contraseña", async () => {
    await guardar();
    const guardado = await almacenLocal().leer("acceso|ana@farmacia.com");
    expect(JSON.stringify(guardado)).not.toContain("clave-de-ana-123");
  });

  it("rechaza una contraseña equivocada", async () => {
    await guardar();
    expect(
      await entrarSinConexion(
        "ana@farmacia.com",
        "otra-clave-cualquiera",
        ahora,
      ),
    ).toEqual({ ok: false, motivo: CLAVE_INCORRECTA });
  });

  it("alguien que no usó la PC, o hace más de 24 horas, no entra", async () => {
    expect(
      await entrarSinConexion("beto@farmacia.com", "clave-de-beto-123", ahora),
    ).toEqual({ ok: false, motivo: SIN_ACCESO_GUARDADO });
    await guardar(ahora - VIGENCIA_SIN_CONEXION_MS - 1);
    expect(
      await entrarSinConexion("ana@farmacia.com", "clave-de-ana-123", ahora),
    ).toEqual({ ok: false, motivo: SIN_ACCESO_GUARDADO });
  });

  it("después de 5 intentos fallidos hace esperar", async () => {
    await guardar();
    for (let i = 0; i < 5; i++)
      await entrarSinConexion("ana@farmacia.com", "equivocada-123", ahora);
    const bloqueado = await entrarSinConexion(
      "ana@farmacia.com",
      "clave-de-ana-123",
      ahora + 1000,
    );
    expect(bloqueado).toMatchObject({ ok: false });
    expect(
      await entrarSinConexion(
        "ana@farmacia.com",
        "clave-de-ana-123",
        ahora + 31_000,
      ),
    ).toMatchObject({ ok: true });
  });
});
