import { beforeEach, describe, expect, it } from "vitest";
import { almacenEnMemoria, usarAlmacen } from "./almacen-local";
import {
  VIGENCIA_SIN_CONEXION_MS,
  borrarCopiaLocal,
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

  it("sólo guarda consultas de lo necesario para abrir y consultar", () => {
    expect(seGuarda(stock, "GET")).toBe(true);
    expect(
      seGuarda(`${base}/organizations/o1/catalog/effective-prices?x=1`, "GET"),
    ).toBe(true);
    expect(seGuarda(stock, "POST")).toBe(false);
    expect(seGuarda(`${base}/organizations/o1/reports/overview`, "GET")).toBe(
      false,
    );
    expect(seGuarda(`${base}/auth/me`, "GET")).toBe(false);
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

  it("si entra otra persona en la PC, se borra la copia del anterior", async () => {
    await guardarSesion(perfil("ana@farmacia.com"));
    usarAlcance("ana@farmacia.com");
    await guardarRespuesta(stock, json([1]));
    await guardarSesion(perfil("beto@farmacia.com"));
    expect((await leerSesion())?.alcance).toBe("beto@farmacia.com");
    usarAlcance("ana@farmacia.com");
    expect(await respuestaGuardada(stock)).toBeUndefined();
  });
});
