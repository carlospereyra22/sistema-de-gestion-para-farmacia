import { describe, expect, it } from "vitest";
import {
  consultaEquivalentes,
  mejorPorUnidad,
  parametrosEquivalentes,
  precioAlternativa,
  type Alternativa,
} from "./equivalentes";

const fila = (datos: Partial<Alternativa>): Alternativa => ({
  itemId: "a",
  nombre: "DIOXADOL",
  presentacion: "comp.x 10",
  laboratorio: "Montpellier",
  forma: "Comprimidos",
  concentracion: "",
  unidades: 10,
  dosisConfirmada: true,
  aviso: null,
  precioMinor: "957600",
  precioPorUnidadMinor: "95760",
  producto: null,
  ...datos,
});

describe("equivalentes", () => {
  it("arma la consulta con códigos válidos y datos del producto", () => {
    const search = parametrosEquivalentes(
      consultaEquivalentes({
        name: "NOVALGINA",
        presentation: "comp.x 10",
        activeIngredient: "dipirona",
        barcodes: [{ code: "7795312108782" }, { code: "INT-1" }],
      }),
    );
    expect(search.get("codigos")).toBe("7795312108782");
    expect(search.get("principioActivo")).toBe("dipirona");
    expect(search.get("nombre")).toBe("NOVALGINA");
    expect(search.has("forma")).toBe(false);
  });

  it("usa el precio de la farmacia si lo tiene y marca el mejor por unidad", () => {
    expect(
      precioAlternativa(
        fila({
          producto: { id: "p", nombre: "X", precioMinor: "1000", stock: 1 },
        }),
      ),
    ).toBe("1000");
    expect(
      mejorPorUnidad([
        fila({ itemId: "a" }),
        fila({ itemId: "b", precioPorUnidadMinor: "71965" }),
        fila({ itemId: "c", precioPorUnidadMinor: null }),
      ]),
    ).toBe("b");
  });
});

describe("comparación por unidad", () => {
  it("cuenta unidades y calcula la diferencia contra el producto elegido", async () => {
    const { unidadesDe, precioPorUnidad, diferenciaPorUnidad } =
      await import("./equivalentes");
    expect(unidadesDe("comp.x 10")).toBe(10);
    expect(unidadesDe("jbe.x 120 ml")).toBeNull();
    expect(precioPorUnidad("1120000", "comp.x 10")).toBe("112000");
    expect(
      diferenciaPorUnidad(fila({ precioPorUnidadMinor: "71965" }), "112000"),
    ).toBe(-36);
    expect(
      diferenciaPorUnidad(fila({ precioPorUnidadMinor: null }), "112000"),
    ).toBeNull();
  });
});
