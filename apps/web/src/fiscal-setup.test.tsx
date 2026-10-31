import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { FiscalChecklist, FiscalSetupPanel } from "./fiscal-setup";

it("distinguishes local configuration from pending ARCA authentication", () => {
  const html = renderToStaticMarkup(
    <FiscalChecklist
      checks={[
        {
          code: "POINT",
          ready: true,
          label: "Punto",
          detail: "Sin verificar en ARCA",
        },
        {
          code: "AUTH",
          ready: false,
          label: "Autenticación",
          detail: "Pendiente",
        },
      ]}
    />,
  );
  expect(html).toContain("Configurado localmente");
  expect(html).toContain("Sin verificar en ARCA");
  expect(html).toContain("Pendiente");
});
it("keeps production disabled on initial load", () => {
  const html = renderToStaticMarkup(
    <FiscalSetupPanel token="test" organizationId="org" revision={0} />,
  );
  expect(html).toContain("Estos puntos son sólo de prueba");
  expect(html).toContain("Cargando preparación fiscal");
});

it("does not present unfinished product development as a user configuration task", () => {
  const html = renderToStaticMarkup(
    <FiscalChecklist
      checks={[
        {
          code: "PROFILE",
          ready: true,
          label: "Datos del emisor",
          detail: "Completos",
        },
        {
          code: "POINT",
          ready: true,
          label: "Punto de prueba",
          detail: "Configurado",
        },
        {
          code: "AUTH",
          ready: true,
          label: "Autenticación con ARCA",
          detail: "Comprobada",
        },
        {
          code: "ISSUANCE",
          ready: false,
          label: "Emisión y conciliación",
          detail: "Pendiente de implementación",
        },
      ]}
    />,
  );
  expect(html).toContain("Datos del emisor");
  expect(html).toContain("Punto de prueba");
  expect(html).toContain("Autenticación con ARCA");
  expect(html).not.toContain("Emisión y conciliación");
  expect(html).not.toContain("Pendiente");
});
