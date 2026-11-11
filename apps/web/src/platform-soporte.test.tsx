import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { BotonEntrarComo } from "./platform-soporte";
import {
  SoporteContext,
  eleccionDeSoporte,
  iniciales,
  opcionesDeFarmacias,
  opcionesDeSucursales,
  valorDeSoporte,
} from "./lib/soporte-panel";

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

  it("un buscador elige la farmacia y otro, la sucursal", () => {
    const farmacias = [
      {
        id: "o1",
        name: "Farmacia Centro",
        branches: [
          { id: "b1", name: "Casa Central" },
          { id: "b2", name: "Sucursal Norte" },
        ],
      },
      { id: "o2", name: "Botica Sur" },
    ];
    expect(opcionesDeFarmacias(farmacias)).toEqual([
      { value: "o2", label: "Botica Sur" },
      { value: "o1", label: "Farmacia Centro" },
    ]);
    expect(opcionesDeSucursales(farmacias[0])).toEqual([
      { value: "", label: "Todas las sucursales" },
      { value: "b1", label: "Casa Central" },
      { value: "b2", label: "Sucursal Norte" },
    ]);
    expect(opcionesDeSucursales(undefined)).toEqual([
      { value: "", label: "Todas las sucursales" },
    ]);
    expect(eleccionDeSoporte(valorDeSoporte("o1", "b2"))).toEqual({
      organizationId: "o1",
      branchId: "b2",
    });
    expect(eleccionDeSoporte(valorDeSoporte("o2"))).toEqual({
      organizationId: "o2",
      branchId: undefined,
    });
  });

  it("arma las iniciales del usuario", () => {
    expect(iniciales("Ana Pérez")).toBe("AP");
    expect(iniciales("cajero.a@demo.com")).toBe("CA");
    expect(iniciales("ana@x.com")).toBe("AN");
    expect(iniciales("Cajero A (mostrador)")).toBe("CM");
  });
});
