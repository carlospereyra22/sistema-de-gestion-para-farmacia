import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { GuiaPrimeraVez } from "./guia-certificado";
import { ResultadoConexionArca } from "./resultado-conexion-arca";
import { CONECTADO } from "./lib/errores-arca";

describe("guía de primera vez y resultado de la conexión (SISTEMA-97)", () => {
  it("cada paso tiene casilla de ayuda, resumen y Ver más", () => {
    const html = renderToStaticMarkup(
      <GuiaPrimeraVez
        pasos={[
          {
            titulo: "Descargá el pedido de certificado",
            resumen: "Es un archivo que le dice a ARCA quién va a facturar.",
            verMas: <p>El pedido (CSR) sale de una clave del sistema.</p>,
            accion: <button type="button">Descargar</button>,
          },
          {
            titulo: "Volvé acá y subí el certificado",
            resumen: "Después probá la conexión.",
          },
        ]}
      />,
    );
    expect(html.match(/type="checkbox"/g)).toHaveLength(2);
    expect(html).toContain(
      'aria-label="Marcar como hecho: Descargá el pedido de certificado"',
    );
    expect(html).toContain("1. Descargá el pedido de certificado");
    expect(html).toContain("2. Volvé acá y subí el certificado");
    expect(html.match(/<details/g)).toHaveLength(1);
    expect(html).toContain("Ver más");
    expect(html).toContain("Descargar</button>");
  });

  it("conectado: mensaje simple sin detalle técnico", () => {
    const html = renderToStaticMarkup(
      <ResultadoConexionArca resultado={CONECTADO} />,
    );
    expect(html).toContain("Conectado");
    expect(html).toContain("ARCA reconoce tu certificado");
    expect(html).not.toContain("<details");
  });

  it("con problema: qué hacer y el detalle técnico plegado", () => {
    const html = renderToStaticMarkup(
      <ResultadoConexionArca
        resultado={{
          tipo: "no-autorizado",
          titulo: "Falta autorizar la factura electrónica",
          queHacer: "En ARCA, entrá a «Crear autorización a servicio»…",
          detalle: "Código de ARCA: ns1:coe.notAuthorized",
        }}
      />,
    );
    expect(html).toContain("Falta autorizar la factura electrónica");
    expect(html).toContain("<details");
    expect(html).toContain("Ver detalle técnico");
    expect(html).toContain("ns1:coe.notAuthorized");
  });
});
