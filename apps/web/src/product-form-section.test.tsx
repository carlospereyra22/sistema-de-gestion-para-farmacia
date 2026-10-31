import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ProductFormSection } from "./product-form-section";

describe("product form sections", () => {
  it("starts optional sections collapsed without unmounting their fields", () => {
    const html = renderToStaticMarkup(
      <ProductFormSection title="Detalles farmacéuticos">
        <input defaultValue="Ibuprofeno" />
      </ProductFormSection>,
    );
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain('hidden=""');
    expect(html).toContain('value="Ibuprofeno"');
    expect(html).toContain('type="button"');
  });
  it("can start linking expanded for a new product", () => {
    const html = renderToStaticMarkup(
      <ProductFormSection title="Vincular medicamento" defaultOpen>
        <input aria-label="Buscar" />
      </ProductFormSection>,
    );
    expect(html).toContain('aria-expanded="true"');
    expect(html).not.toContain('hidden=""');
  });
  it("keeps linking status visible when collapsed", () => {
    const html = renderToStaticMarkup(
      <ProductFormSection
        title="Cambiar vinculación"
        status={<span>Vinculado · Padrón oficial</span>}
      >
        <input />
      </ProductFormSection>,
    );
    expect(html.indexOf("Vinculado")).toBeLessThan(html.indexOf('hidden=""'));
  });
});
