import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { FichaMedicamento } from "./ficha-medicamento";

const props = {
  token: "t",
  organizationId: "org",
  nombre: "Ibupirac 400",
  laboratorio: "Pfizer",
  codigos: [],
  nota: "Tomar con comida",
  onNota: () => undefined,
};

describe("ficha del medicamento", () => {
  it("muestra para qué sirve y cada cuánto, sin leyenda de la fuente", () => {
    const html = renderToStaticMarkup(
      <FichaMedicamento
        {...props}
        estadoInicial={{
          tipo: "lista",
          resumen: {
            paraQueSirve: "Dolor, fiebre e inflamación.",
            accionTerapeutica: "Analgésico Antiinflam.",
            dosis: "400 mg cada 6-8 h con comida.",
            dosisGeneradaConIa: true,
            via: "oral",
            condicionVenta: "",
            principioActivo: "ibuprofeno",
            dosisPresentacion: "",
            dosisDeOtraForma: false,
            pediatrica: null,
          },
        }}
      />,
    );
    expect(html).toContain("Para qué sirve");
    expect(html).toContain("Dolor, fiebre e inflamación.");
    expect(html).toContain("Acción terapéutica: Analgésico Antiinflam.");
    expect(html).toContain("Cada cuánto se suele tomar");
    expect(html).toContain("400 mg cada 6-8 h con comida.");
    expect(html).not.toContain("generado con IA");
    expect(html).not.toContain("Condición de venta");
    expect(html).toContain('aria-label="Indicaciones de la farmacia"');
    expect(html).toContain("Tomar con comida");
    expect(html).toContain("Buscar prospecto");
  });

  it("avisa cuando no encuentra la ficha", () => {
    const html = renderToStaticMarkup(
      <FichaMedicamento
        {...props}
        estadoInicial={{ tipo: "lista", resumen: null }}
      />,
    );
    expect(html).toContain("No se encontró la ficha");
  });

  it("avisa que en chicos la dosis va por peso en presentaciones líquidas", () => {
    const html = renderToStaticMarkup(
      <FichaMedicamento
        {...props}
        nombre="IBUPIRAC 2%"
        presentacion="susp.x 90 ml"
        estadoInicial={{
          tipo: "lista",
          resumen: {
            paraQueSirve: "Dolor, fiebre e inflamación.",
            accionTerapeutica: "",
            dosis: "400 mg cada 6-8 h.",
            dosisGeneradaConIa: true,
            via: "oral",
            condicionVenta: "",
            principioActivo: "ibuprofeno",
            dosisPresentacion: "",
            dosisDeOtraForma: false,
            pediatrica: null,
          },
        }}
      />,
    );
    expect(html).toContain("(adultos)");
    expect(html).toContain("en niños la dosis va");
    // Ibupirac 2% = 20 mg/ml: 400 mg son 20 ml.
    expect(html).toContain("En esta presentación (20 mg/ml): 20 ml por toma.");
    expect(html).toContain("Concentración");
  });

  it("no muestra la dosis de los comprimidos para otra forma", () => {
    const html = renderToStaticMarkup(
      <FichaMedicamento
        {...props}
        nombre="NOVALGINA"
        presentacion="a.x 5 x 2 ml"
        estadoInicial={{
          tipo: "lista",
          resumen: {
            paraQueSirve: "Dolor y fiebre.",
            accionTerapeutica: "",
            dosis: "",
            dosisGeneradaConIa: true,
            via: "inyectable",
            condicionVenta: "",
            principioActivo: "dipirona",
            dosisPresentacion: "",
            dosisDeOtraForma: true,
            pediatrica: null,
          },
        }}
      />,
    );
    expect(html).toContain("Cada cuánto se suele usar (adultos)");
    expect(html).toContain(
      "La dosis de esta presentación está en el prospecto.",
    );
  });

  it("en jarabes con dosis infantil ofrece calcular por peso", () => {
    const html = renderToStaticMarkup(
      <FichaMedicamento
        {...props}
        nombre="NOVALGINA"
        presentacion="jbe.x 100 ml"
        concentracion="50 mg/ml"
        estadoInicial={{
          tipo: "lista",
          resumen: {
            paraQueSirve: "Dolor y fiebre.",
            accionTerapeutica: "",
            dosis: "500 mg-1 g cada 6-8 h (máx. 4 g/día).",
            dosisGeneradaConIa: true,
            via: "oral",
            condicionVenta: "",
            principioActivo: "dipirona",
            dosisPresentacion: "",
            dosisDeOtraForma: false,
            pediatrica: {
              mgKgToma: [8, 16],
              tomasPorDia: 4,
              cadaHoras: "6-8",
              maxMgToma: 500,
              desde: "3 meses y 5 kg",
            },
          },
        }}
      />,
    );
    expect(html).toContain("10-20 ml por toma");
    expect(html).toContain("Chicos: 8-16 mg/kg por toma, cada 6-8 h");
    expect(html).toContain('aria-label="Peso del chico en kg"');
    expect(html).not.toContain("Verificala en el prospecto");
  });
});
