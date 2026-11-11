import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PestanaPausada } from "./pestana-pausada";

describe("pantalla de pestaña pausada", () => {
  const render = (otroEmail?: string) =>
    renderToStaticMarkup(
      <PestanaPausada
        propioEmail="cajero@example.com"
        otroEmail={otroEmail}
        onSeguirComoOtro={() => undefined}
        onEntrar={async () => undefined}
      />,
    );

  it("explica qué pasó y ofrece seguir como el otro o volver a entrar", () => {
    const html = render("duena@example.com");
    expect(html).toContain('role="alertdialog"');
    expect(html).toContain("Esta pestaña se pausó");
    expect(html).toContain(
      "En este navegador se inició sesión con otro usuario (duena@example.com).",
    );
    expect(html).toContain("para que nada quede a su nombre");
    expect(html).toContain("Seguir como duena@example.com");
    expect(html).toContain("Iniciar sesión como cajero@example.com");
    expect(html).toContain('value="cajero@example.com"');
    expect(html).toContain('type="password"');
  });

  it("sin el email del otro usuario igual se entiende", () => {
    expect(render()).toContain("Seguir como otro usuario");
  });
});
