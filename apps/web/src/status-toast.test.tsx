import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { StatusToast } from "./status-toast";

describe("status notification", () => {
  it("shows errors as a floating alert with an optional action, without executing it", () => {
    let clicked = false;
    const html = renderToStaticMarkup(
      <StatusToast
        variant="error"
        title="Abrí una caja para cobrar"
        message="Primero abrí una sesión en Caja."
        onClose={() => undefined}
        action={{
          label: "Ir a Caja",
          onClick: () => {
            clicked = true;
          },
        }}
      />,
    );
    expect(html).toContain('role="alert"');
    expect(html).toContain('aria-live="assertive"');
    expect(html).toContain("fixed bottom-6 right-4");
    expect(html).not.toContain("top-24");
    expect(html).toContain("Abrí una caja para cobrar");
    expect(html).toContain("Ir a Caja");
    expect(html.match(/type="button"/g)).toHaveLength(2);
    expect(clicked).toBe(false);
  });
  it("announces the result and offers a non-submitting dismiss control", () => {
    const html = renderToStaticMarkup(
      <StatusToast
        message="Actualización completada."
        onClose={() => undefined}
      />,
    );
    expect(html).toContain('role="status"');
    expect(html).toContain('aria-label="Cerrar notificación"');
    expect(html).toContain('type="button"');
    expect(html).toContain("Actualización completada.");
    expect(html).toContain("fixed bottom-6");
  });
});
