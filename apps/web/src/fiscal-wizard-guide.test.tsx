import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  FiscalArcaGuide,
  FiscalConnectionStatus,
  FiscalWizardSteps,
} from "./fiscal-wizard-guide";
import { FiscalSettingsPanel } from "./fiscal-settings";

describe("fiscal onboarding", () => {
  it.each([0, 1, 2, 3] as const)(
    "marks just step %s as current, not authorized",
    (step) => {
      const html = renderToStaticMarkup(
        <FiscalWizardSteps step={step} onChange={() => {}} disabled={false} />,
      );
      expect(html.match(/aria-current="step"/g)).toHaveLength(1);
      expect(html.match(/<button/g)).toHaveLength(4);
      expect(html).toContain("Conexión ARCA");
      expect(html).not.toContain("Completado");
    },
  );
  it("disables step navigation during save", () => {
    const html = renderToStaticMarkup(
      <FiscalWizardSteps step={0} onChange={() => {}} disabled />,
    );
    expect(html.match(/disabled=""/g)).toHaveLength(4);
  });
  it("provides official guidance without collecting secrets or faking connection", () => {
    const html = renderToStaticMarkup(
      <FiscalArcaGuide
        token="test"
        organizationId="org"
        onLoaded={() => {}}
        onEditProfile={() => {}}
      />,
    );
    expect(html).toContain(
      "https://www.arca.gob.ar/ws/documentacion/certificados.asp",
    );
    expect(html).toContain("Revisando configuración guardada");
    expect(html).toContain("Probar conexión con ARCA");
    expect(html).toContain("<details");
    expect(html).not.toContain("<input");
    expect(html).not.toContain("Conectado");
  });
  it("does not ask the user to fix a missing connector or declare the connection complete", () => {
    const html = renderToStaticMarkup(
      <FiscalConnectionStatus
        checks={[{ code: "PROFILE", ready: true, label: "Perfil", detail: "" }]}
      />,
    );
    expect(html).toContain("Tus datos básicos ya están cargados");
    expect(html).toContain("Probá tu certificado con ARCA");
    expect(html).toContain("factura ficticia a homologación");
    expect(html).not.toContain("<input");
  });
  it("shows missing fields without confusing them with authorization", () => {
    const html = renderToStaticMarkup(
      <FiscalConnectionStatus
        checks={[
          {
            code: "PROFILE",
            ready: false,
            label: "Perfil",
            detail: "Falta completar: CUIT.",
          },
        ]}
      />,
    );
    expect(html).toContain("Falta completar: CUIT.");
    expect(html).not.toContain("Tus datos básicos ya están cargados");
    expect(html).toContain("facturación real en Ventas");
  });
  it("starts with a preparation entry point and no ready-to-invoice claim", () => {
    const html = renderToStaticMarkup(
      <FiscalSettingsPanel token="test" organizationId="org" />,
    );
    expect(html).toContain("Configurar facturación");
    expect(html).toContain("Modo homologación");
    expect(html).toContain("La activación real se gestiona por separado");
    expect(html).toContain("Cargando configuración");
    expect(html).not.toContain("Facturación habilitada");
  });
});
