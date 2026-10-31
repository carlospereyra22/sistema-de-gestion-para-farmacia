import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import {
  CertificateInstructions,
  FiscalCertificateSetup,
} from "./fiscal-certificate-setup";

it("explains the real certificate process with separate holder and represented CUIT", () => {
  const html = renderToStaticMarkup(
    <CertificateInstructions
      holderCuit="holder-cuit"
      representedCuit="pharmacy-cuit"
    />,
  );
  expect(html).toContain("holder-cuit");
  expect(html).toContain("pharmacy-cuit");
  expect(html).toContain("Nuevo Certificado");
  expect(html).toContain("Crear Autorización a Servicio");
  expect(html).toContain("certificado.pem");
  expect(html).toContain("https://www.arca.gob.ar/");
});
it("does not allow file operations before loading the secure configuration", () => {
  const html = renderToStaticMarkup(
    <FiscalCertificateSetup token="test" organizationId="org" />,
  );
  expect(html).toContain("Cargando configuración segura");
  expect(html).not.toContain('type="file"');
  expect(html).not.toContain("Conectado a ARCA");
});
it("guides production through the digital certificate administrator instead of WSASS", () => {
  const html = renderToStaticMarkup(
    <CertificateInstructions
      holderCuit="holder"
      representedCuit="issuer"
      environment="PRODUCTION"
    />,
  );
  expect(html).toContain("Administración de Certificados Digitales");
  expect(html).toContain("gestion-produccion");
  expect(html).toContain("WSFE");
  expect(html).not.toContain("En WSASS");
  expect(html).toContain("wsaa_obtener_certificado_produccion.pdf");
});
