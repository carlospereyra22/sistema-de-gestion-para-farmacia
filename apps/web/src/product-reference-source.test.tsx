import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ProductReferenceSource } from "./product-reference-source";

describe("fuente para buscar por nombre", () => {
  it("usa el desplegable del sistema, no el select nativo", () => {
    const html = renderToStaticMarkup(
      <ProductReferenceSource value="official" onChange={() => undefined} />,
    );
    expect(html).not.toContain("<select");
    expect(html).toContain('role="combobox"');
    expect(html).toContain('aria-label="Fuente para buscar por nombre"');
  });

  it.each([
    { value: "official", label: "Medicamentos" },
    { value: "alfabeta", label: "AlfaBeta" },
    { value: "preciosderemedios", label: "Remedios" },
  ] as const)("muestra $label cuando está elegida", ({ value, label }) => {
    const html = renderToStaticMarkup(
      <ProductReferenceSource value={value} onChange={() => undefined} />,
    );
    expect(html).toContain(`>${label}</span>`);
  });
});
