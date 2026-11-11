import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cerrarOtrasSesiones,
  cerrarSesionDeUsuario,
  cerrarSesionPropia,
  refreshSession,
  type SesionAbierta,
} from "./lib/api";
import { marcarEnLinea } from "./lib/conectividad";
import { haceCuanto, sesionesParaMostrar } from "./lib/sesiones-abiertas";
import { ListaDeSesiones } from "./sesiones-abiertas-dialog";

const AHORA = Date.parse("2026-11-11T15:00:00Z");
const sesion = (extra: Partial<SesionAbierta>): SesionAbierta => ({
  id: "s1",
  navegador: "Edge · Windows",
  ip: "190.1.2.3",
  deviceId: null,
  iniciada: "2026-11-01T12:00:00Z",
  ultimoUso: "2026-11-11T14:55:00Z",
  actual: false,
  ...extra,
});

afterEach(() => vi.unstubAllGlobals());

describe("sesiones abiertas", () => {
  it("dice hace cuánto se usó cada una", () => {
    expect(haceCuanto("2026-11-11T14:59:50Z", AHORA)).toBe("recién");
    expect(haceCuanto("2026-11-11T14:55:00Z", AHORA)).toBe("hace 5 minutos");
    expect(haceCuanto("2026-11-11T12:00:00Z", AHORA)).toBe("hace 3 horas");
    expect(haceCuanto("2026-11-09T15:00:00Z", AHORA)).toBe("hace 2 días");
  });

  it("marca esta PC por la pestaña o por el id de la PC", () => {
    const filas = sesionesParaMostrar(
      [
        sesion({ id: "a", actual: true }),
        sesion({ id: "b", deviceId: "pc-1" }),
        sesion({ id: "c", deviceId: "pc-2", navegador: null }),
      ],
      "pc-1",
      AHORA,
    );
    expect(filas.map(({ estaPc }) => estaPc)).toEqual([true, true, false]);
    expect(filas[2]!.titulo).toBe("Navegador desconocido");
    expect(filas[0]!.detalle).toContain("Último uso hace 5 minutos");
    expect(filas[0]!.detalle).toContain("IP 190.1.2.3");
  });

  it("lista cada sesión con Cerrar, salvo la de esta pestaña", () => {
    const html = renderToStaticMarkup(
      <ListaDeSesiones
        sesiones={[
          sesion({ id: "a", actual: true }),
          sesion({ id: "b", navegador: "Chrome · Android" }),
        ]}
        ahora={AHORA}
        onCerrar={() => undefined}
      />,
    );
    expect(html).toContain("Esta PC");
    expect(html).toContain("Chrome · Android");
    expect(html.match(/Cerrar la sesión de/g)).toHaveLength(1);
    expect(html).toContain('aria-label="Cerrar la sesión de Chrome · Android"');
  });

  it("sin sesiones lo dice", () => {
    expect(
      renderToStaticMarkup(
        <ListaDeSesiones sesiones={[]} ahora={AHORA} onCerrar={() => {}} />,
      ),
    ).toContain("No hay sesiones abiertas.");
  });

  it("cierra una, todas las demás o las de un usuario con la ruta correcta", async () => {
    marcarEnLinea();
    const red = vi
      .fn()
      .mockImplementation(
        async () => new Response(JSON.stringify({ cerradas: 1 })),
      );
    vi.stubGlobal("fetch", red);
    await cerrarSesionPropia("t", "s1");
    await cerrarOtrasSesiones("t");
    await cerrarSesionDeUsuario("t", "org", "u1");
    await cerrarSesionDeUsuario("t", "org", "u1", "s2");
    const llamadas = (red.mock.calls as [string, RequestInit][]).map(
      ([url, init]) => `${init.method} ${url}`,
    );
    expect(llamadas).toEqual([
      expect.stringMatching(/^DELETE .*\/auth\/sessions\/s1$/),
      expect.stringMatching(/^POST .*\/auth\/sessions\/close-others$/),
      expect.stringMatching(
        /^POST .*\/organizations\/org\/users\/u1\/sessions\/close-all$/,
      ),
      expect.stringMatching(
        /^DELETE .*\/organizations\/org\/users\/u1\/sessions\/s2$/,
      ),
    ]);
  });

  it("la renovación manda el id de la PC y anda aunque no venga cookie nueva", async () => {
    const red = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ accessToken: "nuevo" }), { status: 200 }),
      );
    vi.stubGlobal("fetch", red);
    await expect(refreshSession("u1")).resolves.toEqual({
      accessToken: "nuevo",
    });
    const body = JSON.parse(String(red.mock.calls[0]![1].body)) as {
      deviceId?: string;
    };
    expect(body.deviceId).toMatch(/^[0-9a-f-]{36}$/);
  });
});
