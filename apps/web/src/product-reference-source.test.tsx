import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ProductReferenceSource } from "./product-reference-source";

describe("product reference source selection", () => {
  it("offers official first and AlfaBeta as an alternative", () => {
    const html = renderToStaticMarkup(
      <ProductReferenceSource value="official" onChange={() => undefined} />,
    );
    expect(html.indexOf("Padrón oficial")).toBeLessThan(
      html.indexOf("AlfaBeta"),
    );
  });
  it.each([
    { value: "official", label: "Padrón oficial" },
    { value: "alfabeta", label: "AlfaBeta" },
    { value: "preciosderemedios", label: "Remedios" },
  ] as const)("marks only $label as selected", ({ value, label }) => {
    const html = renderToStaticMarkup(
      <ProductReferenceSource value={value} onChange={() => undefined} />,
    );
    expect(html).toContain('aria-label="Fuente para vincular el medicamento"');
    expect(html).toContain("<select");
    const options = html.match(/<option[^>]*>.*?<\/option>/g) ?? [];
    expect(options).toHaveLength(3);
    const selected = options.filter((option) => option.includes('selected=""'));
    expect(selected).toHaveLength(1);
    expect(selected[0]).toContain(label);
    expect(selected[0]).toContain(`value="${value}"`);
    expect(html).not.toContain("<button");
  });
});
