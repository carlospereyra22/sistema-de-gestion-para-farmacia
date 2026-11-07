import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ForcedPasswordChange } from "./forced-password-change";

describe("ForcedPasswordChange", () => {
  const html = renderToStaticMarkup(
    <ForcedPasswordChange
      token="token"
      email="duena@farmacia.com"
      onDone={() => {}}
      onLogout={() => {}}
    />,
  );

  it("muestra la cuenta y explica por qué hay que cambiarla", () => {
    expect(html).toContain("Elegí tu contraseña");
    expect(html).toContain("duena@farmacia.com");
    expect(html).toContain("la contraseña que te pasaron");
  });

  it("pide la actual y la nueva dos veces", () => {
    expect(html).toContain("Contraseña actual");
    expect(html).toContain("Contraseña nueva");
    expect(html).toContain("Repetir contraseña nueva");
    expect(html).toContain('autoComplete="current-password"');
  });

  it("deja salir sin cambiarla, pero no entrar al sistema", () => {
    expect(html).toContain("Cerrar sesión");
    expect(html).toContain("Guardar y entrar");
    expect(html).not.toContain("Cancelar");
  });
});
