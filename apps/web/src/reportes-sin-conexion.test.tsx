import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ReportCopiaGuardada } from "./report-overview";

const api = vi.hoisted(() => ({ fetch: vi.fn() }));
vi.mock("./lib/api-fetch", async (original) => ({
  ...(await original<typeof import("./lib/api-fetch")>()),
  apiFetch: api.fetch,
}));

import { PERIODOS_GUARDADOS, precargarReportes } from "./lib/reports-api";

describe("reportes sin conexión (SISTEMA-80)", () => {
  it("avisa de cuándo son los datos guardados", () => {
    const html = renderToStaticMarkup(
      <ReportCopiaGuardada guardadaEl={Date.parse("2026-11-10T18:30:00Z")} />,
    );
    expect(html).toContain('role="status"');
    expect(html).toContain("Sin conexión: datos al 10/11");
    expect(html).toContain("15:30");
    expect(html).toContain("No incluye lo hecho sin conexión");
  });

  it("la precarga guarda los períodos habituales de todas las sucursales y de la actual", async () => {
    api.fetch.mockImplementation(async (url: string) =>
      url.includes("filter-options")
        ? new Response(
            JSON.stringify({
              branches: [
                { id: "b1", name: "Central" },
                { id: "b2", name: "Norte" },
              ],
            }),
          )
        : new Response("{}"),
    );
    await precargarReportes("t", "o1", "b1", "2026-11-10");
    const pedidos = api.fetch.mock.calls
      .map(([url]) => String(url))
      .filter((url) => url.includes("/overview?"));
    expect(pedidos).toHaveLength(PERIODOS_GUARDADOS.length * 2);
    expect(pedidos.some((url) => url.includes("branchId=all"))).toBe(true);
    expect(pedidos.some((url) => url.includes("branchId=b1"))).toBe(true);
    expect(pedidos.some((url) => url.includes("branchId=b2"))).toBe(false);
    expect(pedidos[0]).toContain("from=2026-11-10&to=2026-11-10");
  });
});
