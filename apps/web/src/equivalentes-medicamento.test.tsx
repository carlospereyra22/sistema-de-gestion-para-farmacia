import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ListaEquivalentes } from "./equivalentes-medicamento";

describe("lista de equivalentes", () => {
  it("muestra los grupos, el stock propio y el mejor precio por unidad", () => {
    const html = renderToStaticMarkup(
      <ListaEquivalentes
        onElegir={() => undefined}
        datos={{
          principioActivo: "dipirona",
          composicionAbierta: false,
          equivalentes: [
            {
              itemId: "a",
              nombre: "NOVEMINA",
              presentacion: "comp.x 40",
              laboratorio: "Lazar",
              forma: "Comprimidos",
              concentracion: "",
              unidades: 40,
              dosisConfirmada: true,
              aviso: null,
              precioMinor: "2878600",
              precioPorUnidadMinor: "71965",
              producto: {
                id: "p",
                nombre: "NOVEMINA",
                precioMinor: null,
                stock: 3,
              },
            },
          ],
          mismaDroga: [],
        }}
      />,
    );
    expect(html).toContain("Equivalentes");
    expect(html).toContain("NOVEMINA");
    expect(html).toContain("3 en stock");
    expect(html).toContain("Mejor $/u");
    expect(html).toContain("Elegir");
    expect(html).not.toContain("Otros con dipirona");
  });

  it("separa lo que falta confirmar y no compara precios con otras dosis", () => {
    const fila = {
      itemId: "a",
      nombre: "",
      presentacion: "comp.x 10",
      laboratorio: "Lab",
      forma: "Comprimidos",
      concentracion: "",
      dosisConfirmada: true,
      aviso: null,
      unidades: 10,
      precioMinor: "100000",
      precioPorUnidadMinor: "10000",
      producto: null,
    };
    const html = renderToStaticMarkup(
      <ListaEquivalentes
        referenciaPorUnidad="20000"
        datos={{
          principioActivo: "dipirona",
          composicionAbierta: false,
          equivalentes: [
            {
              ...fila,
              itemId: "b",
              nombre: "SIN DOSIS",
              dosisConfirmada: false,
              aviso: "Dosis no informada: confirmá la concentración.",
            },
          ],
          mismaDroga: [{ ...fila, itemId: "c", nombre: "JARABE" }],
        }}
      />,
    );
    // "Para confirmar" arranca plegado: se ve el título, no la fila.
    expect(html).toContain("Para confirmar");
    expect(html).not.toContain("SIN DOSIS");
    expect(html).toContain("Otros con dipirona");
    expect(html).toContain("JARABE");
    expect(html).not.toContain("Mejor $/u");
    expect(html).not.toContain("−50%");
  });

  it("en fórmulas abiertas titula productos relacionados", () => {
    const html = renderToStaticMarkup(
      <ListaEquivalentes
        datos={{
          principioActivo: "vit.+minerales",
          composicionAbierta: true,
          equivalentes: [],
          mismaDroga: [
            {
              itemId: "c",
              nombre: "CENTRUM",
              presentacion: "comp.x 30",
              laboratorio: "Haleon",
              forma: "Comprimidos",
              concentracion: "",
              dosisConfirmada: true,
              aviso: null,
              unidades: 30,
              precioMinor: "100000",
              precioPorUnidadMinor: "3333",
              producto: null,
            },
          ],
        }}
      />,
    );
    expect(html).toContain("Productos relacionados");
    expect(html).not.toContain("Otros con vit.");
  });
});
