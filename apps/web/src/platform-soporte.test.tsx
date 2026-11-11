import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { BotonEntrarComo } from "./platform-soporte";
import { SoporteContext, filtrarFarmacias } from "./lib/soporte-panel";

const usuario = (active: boolean) => ({
  id: "u1",
  email: "ana@farmacia.com",
  active,
  displayName: "Ana",
  mustChangePassword: false,
  roles: [],
});

describe("soporte en el panel", () => {
  it("el botón Entrar como sólo aparece en el panel y para usuarios activos", () => {
    const boton = (active: boolean, conPanel: boolean) =>
      renderToStaticMarkup(
        <SoporteContext.Provider
          value={conPanel ? () => Promise.resolve() : undefined}
        >
          <BotonEntrarComo
            organizationId="o1"
            organizationName="Farmacia Centro"
            usuario={usuario(active)}
          />
        </SoporteContext.Provider>,
      );
    expect(boton(true, true)).toContain(
      'aria-label="Entrar como ana@farmacia.com"',
    );
    expect(boton(false, true)).toBe("");
    expect(boton(true, false)).toBe("");
  });

  it("busca farmacias por nombre, sin importar mayúsculas", () => {
    const farmacias = [{ name: "Farmacia Centro" }, { name: "Botica Sur" }];
    expect(filtrarFarmacias(farmacias, "centro")).toEqual([
      { name: "Farmacia Centro" },
    ]);
    expect(filtrarFarmacias(farmacias, "")).toHaveLength(2);
  });
});
