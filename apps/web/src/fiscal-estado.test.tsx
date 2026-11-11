import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { FiscalSetup } from "./lib/api";
import { EstadoFacturacion, ModoPrueba } from "./fiscal-estado";
import { PasoFacturacionReal } from "./fiscal-settings";

const setup = (listos: string[]): FiscalSetup => ({
  environment: "HOMOLOGATION",
  issuanceEnabled: false,
  branches: [{ id: "b1", name: "Centro" }],
  points: listos.includes("POINT")
    ? [{ id: "p1", branchId: "b1", number: 1, active: true }]
    : [],
  checks: ["PROFILE", "AUTH", "POINT", "TRIAL", "PRODUCTION"].map((code) => ({
    code,
    ready: listos.includes(code),
    label: code,
    detail: `detalle ${code}`,
  })),
  trial: null,
  production: { available: true, branches: [] },
});

describe("entrada de Facturación (SISTEMA-95)", () => {
  it("muestra título, los 5 pasos con su estado y un único botón Continuar", () => {
    const html = renderToStaticMarkup(
      <EstadoFacturacion
        setup={setup(["PROFILE", "AUTH"])}
        onAbrir={() => undefined}
      />,
    );
    expect(html).toContain(
      "Te faltan 2 pasos para hacer tu primera factura de prueba",
    );
    for (const paso of [
      "1. Datos de la farmacia: completo",
      "2. Conexión con ARCA: completo",
      "3. Punto de venta: pendiente",
      "4. Factura de prueba: pendiente",
      "5. Facturación real: bloqueado",
    ])
      expect(html).toContain(`aria-label="${paso}"`);
    expect(html.match(/Continuar:/g)).toHaveLength(1);
    expect(html).toContain("Continuar: Punto de venta");
    expect(html).toContain('aria-valuenow="40"');
    expect(html).toContain("Se habilita cuando termines");
  });

  it("mientras carga mantiene la misma grilla", () => {
    const html = renderToStaticMarkup(
      <EstadoFacturacion onAbrir={() => undefined} />,
    );
    expect(html).toContain("Revisando el estado de la facturación");
    expect(html).toContain("sm:grid-cols-5");
  });

  it("facturando en real ya no pide continuar", () => {
    const html = renderToStaticMarkup(
      <EstadoFacturacion
        setup={setup(["PROFILE", "AUTH", "POINT", "TRIAL", "PRODUCTION"])}
        onAbrir={() => undefined}
      />,
    );
    expect(html).toContain("Facturando en real");
    expect(html).toContain("Ya podés vender con Factura desde Ventas");
    expect(html).not.toContain("Continuar:");
  });

  it("el modo prueba es una etiqueta corta con el detalle desplegable", () => {
    const html = renderToStaticMarkup(<ModoPrueba />);
    expect(html).toContain("<details");
    expect(html).toContain(
      "Modo prueba: las facturas no tienen validez fiscal",
    );
    expect(html).toContain("¿Qué significa?");
  });

  it("la facturación real queda bloqueada diciendo qué falta", () => {
    const html = renderToStaticMarkup(
      <PasoFacturacionReal
        token="t"
        organizationId="o"
        bloqueo="Se habilita cuando termines: Factura de prueba."
        disponible
      />,
    );
    expect(html).toContain("Se habilita cuando termines: Factura de prueba.");
    expect(html).not.toContain("Preparar producción");
  });

  it("sin permiso del servidor avisa que lo habilita el administrador", () => {
    const html = renderToStaticMarkup(
      <PasoFacturacionReal token="t" organizationId="o" disponible={false} />,
    );
    expect(html).toContain("Lo habilita el administrador del sistema");
    expect(html).toContain("Preparar producción");
  });
});
