import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ProductSaveErrorDialog } from "./product-save-error-dialog";

describe("product save error dialog", () => {
  it("supports stock adjustment errors without a product-save heading", () => {
    const html = renderToStaticMarkup(
      <ProductSaveErrorDialog
        title="No pudimos registrar el ajuste"
        message="La variación de cantidad no puede ser 0."
        onClose={() => undefined}
      />,
    );
    expect(html).toContain("No pudimos registrar el ajuste");
    expect(html).toContain("La variación de cantidad no puede ser 0.");
    expect(html).not.toContain("No pudimos guardar el producto");
    expect(html).toContain("Volver al formulario");
  });
  it("shows the cause and a non-destructive return action in an accessible dialog", () => {
    const html = renderToStaticMarkup(
      <ProductSaveErrorDialog
        message="El código 7793640992769 ya está asignado a ACTRON."
        onClose={() => undefined}
      />,
    );
    expect(html).toContain("<dialog");
    expect(html).toContain("aria-labelledby=");
    expect(html).toContain("aria-describedby=");
    expect(html).toContain("7793640992769");
    expect(html).toContain("ACTRON");
    expect(html).toContain("Volver al formulario");
    expect(html).toContain("Lo que completaste sigue en el formulario");
    expect(html).not.toContain('type="submit"');
  });
  it("escapes messages instead of executing external markup", () => {
    const html = renderToStaticMarkup(
      <ProductSaveErrorDialog
        message={'<script>alert("x")</script>'}
        onClose={() => undefined}
      />,
    );
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });
});
