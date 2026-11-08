import { beforeEach, describe, expect, it } from "vitest";
import { almacenEnMemoria, almacenLocal, usarAlmacen } from "./almacen-local";
import {
  PREFIJO_ACCESO,
  VIGENCIA_SIN_CONEXION_MS,
  borrarCopiaLocal,
  cerrarSesionLocal,
  guardarRespuesta,
  guardarSesion,
  leerSesion,
  respuestaGuardada,
  rutaApi,
  seGuarda,
  sesionVigente,
  usarAlcance,
} from "./cache-local";
import type { CurrentUserProfile } from "./api";

const base = "http://localhost:3000/api/v1";
const stock = `${base}/organizations/o1/branches/b1/inventory/stock`;
const json = (body: unknown) =>
  new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json; charset=utf-8" },
  });
const perfil = (email: string): CurrentUserProfile => ({
  email,
  organizations: [{ organizationId: "o1" }],
});

describe("copia local", () => {
  beforeEach(() => {
    usarAlmacen(almacenEnMemoria());
    usarAlcance(undefined);
  });

  it("reconoce la ruta de la API con dominio o relativa (Netlify)", () => {
    expect(rutaApi(stock).ruta).toBe(
      "/organizations/o1/branches/b1/inventory/stock",
    );
    expect(rutaApi("/api/v1/organizations/o1/branches").ruta).toBe(
      "/organizations/o1/branches",
    );
    expect(
      rutaApi(`${base}/organizations/o1/catalog/products?branchId=b1`),
    ).toEqual({
      ruta: "/organizations/o1/catalog/products",
      consulta: "?branchId=b1",
    });
  });

  it("guarda las consultas de la farmacia, nunca las de sesión", () => {
    expect(seGuarda(stock, "GET")).toBe(true);
    expect(
      seGuarda(`${base}/organizations/o1/catalog/effective-prices?x=1`, "GET"),
    ).toBe(true);
    expect(seGuarda(stock, "POST")).toBe(false);
    expect(seGuarda(`${base}/organizations/o1/reports/overview`, "GET")).toBe(
      true,
    );
    expect(seGuarda(`${base}/organizations/o1/catalog/categories`, "GET")).toBe(
      true,
    );
    expect(seGuarda(`${base}/platform/organizations`, "GET")).toBe(false);
    expect(seGuarda(`${base}/auth/me`, "GET")).toBe(false);
  });

  it("guarda lo que muestra la pantalla de Caja, no sus operaciones", () => {
    const caja = `${base}/organizations/o1/branches/b1/cash`;
    for (const ruta of [
      "/management",
      "/settings",
      "/closures?from=2026-11-01",
      "/pending-collections",
      "/registers/r1/recent-activity",
    ])
      expect(seGuarda(`${caja}${ruta}`, "GET")).toBe(true);
    expect(seGuarda(`${caja}/sessions`, "POST")).toBe(false);
    // El historial de ventas también se consulta sin conexión.
    const ventas = `${base}/organizations/o1/branches/b1/sales`;
    expect(seGuarda(ventas, "GET")).toBe(true);
  });

  it("devuelve lo guardado para el mismo usuario y nunca para otro", async () => {
    usarAlcance("Ana@Farmacia.com");
    await guardarRespuesta(stock, json([{ id: "lote" }]));
    const guardada = await respuestaGuardada(stock);
    expect(await guardada?.json()).toEqual([{ id: "lote" }]);
    usarAlcance("otro@farmacia.com");
    expect(await respuestaGuardada(stock)).toBeUndefined();
  });

  it("sin usuario no guarda nada", async () => {
    await guardarRespuesta(stock, json([1]));
    usarAlcance("ana@farmacia.com");
    expect(await respuestaGuardada(stock)).toBeUndefined();
  });

  it("separa por parámetros (sucursal)", async () => {
    usarAlcance("ana@farmacia.com");
    const productos = `${base}/organizations/o1/catalog/products`;
    await guardarRespuesta(`${productos}?branchId=b1`, json(["b1"]));
    expect(await respuestaGuardada(`${productos}?branchId=b2`)).toBeUndefined();
  });

  it("vale 24 horas desde la última sincronización", () => {
    const ahora = Date.now();
    const sesion = {
      alcance: "ana@farmacia.com",
      perfil: perfil("ana@farmacia.com"),
      ultimaSincronizacion: ahora - VIGENCIA_SIN_CONEXION_MS,
    };
    expect(sesionVigente(sesion, ahora)).toBe(true);
    expect(sesionVigente(sesion, ahora + 1)).toBe(false);
    expect(sesionVigente(undefined, ahora)).toBe(false);
    // Un reloj atrasado no extiende la vigencia.
    expect(
      sesionVigente(
        { ...sesion, ultimaSincronizacion: ahora + 3600_000 },
        ahora,
      ),
    ).toBe(false);
  });

  it("cerrar sesión borra la copia y la sesión", async () => {
    await guardarSesion(perfil("ana@farmacia.com"));
    usarAlcance("ana@farmacia.com");
    await guardarRespuesta(stock, json([1]));
    await borrarCopiaLocal();
    expect(await leerSesion()).toBeUndefined();
    usarAlcance("ana@farmacia.com");
    expect(await respuestaGuardada(stock)).toBeUndefined();
  });

  it("cambio de turno: la copia del anterior queda si puede volver a entrar", async () => {
    await guardarSesion(perfil("ana@farmacia.com"));
    usarAlcance("ana@farmacia.com");
    await guardarRespuesta(stock, json([1]));
    await almacenLocal().guardar(`${PREFIJO_ACCESO}ana@farmacia.com`, {
      ultimaSincronizacion: Date.now(),
    });
    await guardarSesion(perfil("beto@farmacia.com"));
    expect((await leerSesion())?.alcance).toBe("beto@farmacia.com");
    usarAlcance("ana@farmacia.com");
    expect(await respuestaGuardada(stock)).toBeDefined();
  });

  it("borra la copia de quien ya no puede entrar sin conexión, nunca sus ventas", async () => {
    usarAlcance("ana@farmacia.com");
    await guardarRespuesta(stock, json([1]));
    await almacenLocal().guardar("bandeja|ana@farmacia.com|v1", { id: "v1" });
    await almacenLocal().guardar(`${PREFIJO_ACCESO}ana@farmacia.com`, {
      ultimaSincronizacion: Date.now() - VIGENCIA_SIN_CONEXION_MS - 1,
    });
    await guardarSesion(perfil("beto@farmacia.com"));
    usarAlcance("ana@farmacia.com");
    expect(await respuestaGuardada(stock)).toBeUndefined();
    expect(
      await almacenLocal().leer(`${PREFIJO_ACCESO}ana@farmacia.com`),
    ).toBeUndefined();
    expect(await almacenLocal().leer("bandeja|ana@farmacia.com|v1")).toEqual({
      id: "v1",
    });
  });

  it("cerrar sesión deja la copia para volver a entrar con la contraseña", async () => {
    await guardarSesion(perfil("ana@farmacia.com"));
    usarAlcance("ana@farmacia.com");
    await guardarRespuesta(stock, json([1]));
    await cerrarSesionLocal();
    expect(await leerSesion()).toBeUndefined();
    usarAlcance("ana@farmacia.com");
    expect(await respuestaGuardada(stock)).toBeDefined();
  });
});
