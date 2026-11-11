import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { FiscalProfile } from "./lib/api";
import { DatosDeLaFarmacia } from "./fiscal-datos-farmacia";

const HOY = new Date("2026-11-11T12:00:00Z");
const vacio: FiscalProfile = {
  legalName: "",
  cuit: "",
  vatCondition: "",
  address: "",
  city: "",
  province: "",
  postalCode: "",
  grossIncomeId: "",
  activityStart: "",
};

const render = (
  profile: FiscalProfile,
  extra: Partial<Parameters<typeof DatosDeLaFarmacia>[0]> = {},
) =>
  renderToStaticMarkup(
    <DatosDeLaFarmacia
      token="t"
      organizationId="o"
      profile={profile}
      busy={false}
      buscarEnArca
      onChange={() => undefined}
      onGuardar={() => undefined}
      hoy={HOY}
      {...extra}
    />,
  );

describe("paso Datos de la farmacia (SISTEMA-96)", () => {
  it("vacío: CUIT primero, tres bloques con ayuda y sin select nativo", () => {
    const html = render(vacio);
    expect(html.indexOf("CUIT de la farmacia")).toBeLessThan(
      html.indexOf("Razón social"),
    );
    for (const bloque of [
      "Identificación",
      "Domicilio fiscal",
      "Datos impositivos",
    ])
      expect(html).toContain(bloque);
    expect(html).toContain("constancia de inscripción");
    expect(html).toContain("Lo tiene tu contador");
    expect(html).toContain("Buscar en ARCA");
    expect(html).not.toContain("<select");
    expect(html).toContain("Guardar y continuar");
    expect(html).toContain("Guardar borrador");
  });

  it("sin el interruptor no ofrece buscar en ARCA", () => {
    expect(render(vacio, { buscarEnArca: false })).not.toContain(
      "Buscar en ARCA",
    );
  });

  it("autocompletado: muestra ¿Estos son tus datos? con Confirmar y Corregir a mano", () => {
    const html = render(
      { ...vacio, cuit: "20247237837" },
      {
        busquedaInicial: {
          estado: "encontrado",
          datos: {
            cuit: "20247237837",
            nombre: "FARMACIA JUNCOS SRL",
            condicionIva: "Monotributista",
            domicilio: "SAN MARTIN 123",
            localidad: "POSADAS",
            provincia: "MISIONES",
            codigoPostal: "3300",
            estado: "ACTIVO",
            environment: "HOMOLOGATION",
          },
        },
      },
    );
    expect(html).toContain("¿Estos son tus datos?");
    expect(html).toContain("FARMACIA JUNCOS SRL");
    expect(html).toContain("SAN MARTIN 123, POSADAS, MISIONES, 3300");
    expect(html).toContain("Confirmar");
    expect(html).toContain("Corregir a mano");
  });

  it("si el padrón falla, lo dice y deja cargar a mano", () => {
    const html = render(
      { ...vacio, cuit: "20247237837" },
      {
        busquedaInicial: {
          estado: "error",
          mensaje:
            "Sin conexión no se puede buscar en ARCA. Cargá los datos a mano.",
        },
      },
    );
    expect(html).toContain("Cargá los datos a mano");
    expect(html).not.toContain('disabled="" aria-label="Razón social"');
  });

  it("responsable inscripto: avisa y no deja continuar", () => {
    const html = render({
      ...vacio,
      cuit: "20247237837",
      vatCondition: "REGISTERED",
    });
    expect(html).toContain("sólo emite factura C");
    expect(html).toMatch(/<button type="submit" value="continue" disabled=""/);
  });

  it("CUIT con dígito incorrecto: avisa en el campo y no deja continuar", () => {
    const html = render({ ...vacio, cuit: "20247237836" });
    expect(html).toContain("dígito verificador");
    expect(html).toMatch(/value="continue" disabled=""/);
  });
});
