import { expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ProspectoPastilla } from "./prospecto-venta";

it("muestra la pastilla del prospecto con el diálogo cerrado", () => {
  const html = renderToStaticMarkup(
    <ProspectoPastilla
      token="t"
      organizationId="o"
      producto={{
        id: "p1",
        name: "NOVALGINA",
        presentation: "comp.x 10",
        laboratory: { name: "Opella" },
        description: "Tomar con comida.",
        barcodes: [{ code: "7795345001234" }],
      }}
    />,
  );
  expect(html).toContain("Prospecto");
  expect(html).toContain('aria-label="Prospecto de NOVALGINA"');
  expect(html).toContain("Indicaciones de la farmacia");
  expect(html).toContain("Buscar prospecto completo");
  expect(html).toContain("prospecto+NOVALGINA+Opella");
});
