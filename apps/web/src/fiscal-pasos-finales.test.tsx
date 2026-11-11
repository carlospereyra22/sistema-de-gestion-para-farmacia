import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import type { FiscalSetup } from "./lib/api";
import { PuntosPorSucursal } from "./fiscal-setup";
import { FiscalTesting } from "./fiscal-testing";
import { FacturacionLista } from "./fiscal-estado";
import { FiscalProductionSetup } from "./fiscal-production-setup";

const setup: FiscalSetup = {
  environment: "HOMOLOGATION",
  issuanceEnabled: false,
  branches: [
    { id: "b1", name: "Centro" },
    { id: "b2", name: "Norte" },
  ],
  points: [
    { id: "p1", branchId: "b1", number: 3, active: true },
    { id: "p2", branchId: "b2", number: 1, active: false },
  ],
  checks: [],
  trial: null,
  production: { available: true, branches: [] },
};
const sinAccion = () => undefined;
const puntos = (extra: Partial<Parameters<typeof PuntosPorSucursal>[0]>) =>
  renderToStaticMarkup(
    <PuntosPorSucursal
      setup={setup}
      busy={false}
      numero=""
      onAsignar={sinAccion}
      onCancelar={sinAccion}
      onNumero={sinAccion}
      onBuscarEnArca={sinAccion}
      onGuardar={sinAccion}
      onCambiarEstado={sinAccion}
      {...extra}
    />,
  );

describe("punto de venta (SISTEMA-98)", () => {
  it("cada sucursal con su punto o Sin asignar y Asignar", () => {
    const html = puntos({});
    expect(html).toContain("Centro");
    expect(html).toContain("Punto 0003");
    expect(html).toContain("Sin asignar");
    expect(html.match(/>Asignar</g)).toHaveLength(1);
    expect(html).toContain("Desactivar");
    expect(html).toContain("Punto 0001 · desactivado");
    expect(html).toContain("Reactivar");
  });

  it("al asignar, primero busca los puntos en ARCA", () => {
    const html = puntos({ asignando: "b2" });
    expect(html).toContain("Buscar mis puntos en ARCA");
  });

  it("con puntos de ARCA ofrece el selector sin select nativo", () => {
    const html = puntos({ asignando: "b2", deArca: [{ number: 5 }] });
    expect(html).toContain("Elegí un punto");
    expect(html).not.toContain("<select");
    expect(html).toContain("Asignar a Norte");
  });

  it("si ARCA no tiene puntos (602) explica y deja escribir el número", () => {
    const html = puntos({ asignando: "b2", deArca: [] });
    expect(html).toContain("ARCA todavía no tiene puntos de venta");
    expect(html).toContain("Factura electrónica - Web services");
    expect(html).toContain('type="number"');
  });
});

describe("factura de prueba (SISTEMA-98)", () => {
  it("sin punto asignado pide asignarlo primero", () => {
    const html = renderToStaticMarkup(
      <FiscalTesting token="t" organizationId="o" modo="prueba" />,
    );
    expect(html).toContain("Primero asigná un punto de venta");
    expect(html).not.toContain("Hacer factura de prueba");
  });

  it("con un punto ofrece la prueba de $100, sin enviar nada al cargar", () => {
    const html = renderToStaticMarkup(
      <FiscalTesting
        token="t"
        organizationId="o"
        modo="prueba"
        puntos={[3]}
        emisor={{ nombre: "Farmacia", cuit: "20247237837" }}
      />,
    );
    expect(html).toContain("Hacer factura de prueba de $100");
    expect(html).not.toContain("Probar conexión con ARCA");
    expect(html).not.toContain('role="dialog"');
  });
});

describe("facturación real y ¡Listo! (SISTEMA-98)", () => {
  it("el último paso abre la verificación sin activar nada", () => {
    const html = renderToStaticMarkup(
      <FiscalProductionSetup token="t" organizationId="o" siempreAbierto />,
    );
    expect(html).toContain("Verificar con ARCA");
    expect(html).toContain("usa otro certificado y otro punto de venta");
    expect(html).not.toContain("Activar facturación real</button>");
  });

  it("¡Listo! en prueba: ir a Ventas, seguir a la real o revisar", () => {
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <FacturacionLista
          real={false}
          onSeguir={sinAccion}
          onResumen={sinAccion}
        />
      </MemoryRouter>,
    );
    expect(html).toContain("¡Listo!");
    expect(html).toContain("Factura · prueba");
    expect(html).toContain('href="/?pagina=ventas"');
    expect(html).toContain("Seguir: Facturación real");
    expect(html).toContain("Revisar la configuración");
  });

  it("¡Listo! en real: sin seguir", () => {
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <FacturacionLista real onResumen={sinAccion} />
      </MemoryRouter>,
    );
    expect(html).toContain("ya factura en real");
    expect(html).not.toContain("Seguir: Facturación real");
  });
});
