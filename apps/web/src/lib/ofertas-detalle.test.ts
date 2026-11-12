import { describe, expect, it } from "vitest";
import {
  agruparDestinosOferta,
  describirCambiosOferta,
} from "./ofertas-detalle";

describe("historial de la oferta", () => {
  it("nombra los cambios en palabras del usuario, no los campos técnicos", () => {
    const texto = describirCambiosOferta(
      { targets: [{ id: "a" }], version: 1, name: "Combo" },
      { targets: [{ id: "b" }], version: 2, name: "Combo" },
    );
    expect(texto).toBe("cambió productos");
    expect(texto).not.toContain("targets");
  });

  it("no repite el horario si cambian inicio y fin", () => {
    expect(
      describirCambiosOferta(
        { dayStartMinute: 600, dayEndMinute: 720 },
        { dayStartMinute: 540, dayEndMinute: 780 },
      ),
    ).toBe("cambió horario");
  });

  it("sin diferencias devuelve vacío", () => {
    expect(describirCambiosOferta({ name: "A" }, { name: "A" })).toBe("");
  });
});

describe("productos de la oferta", () => {
  it("junta el mismo producto cargado dos veces en el combo", () => {
    const { incluidos, excluidos } = agruparDestinosOferta([
      {
        kind: "PRODUCT",
        id: "acond",
        name: "Acondicionador",
        exclude: false,
        quantity: 1,
      },
      {
        kind: "PRODUCT",
        id: "sham",
        name: "Shampoo",
        exclude: false,
        quantity: 1,
      },
      {
        kind: "PRODUCT",
        id: "acond",
        name: "Acondicionador",
        exclude: false,
        quantity: 1,
      },
      {
        kind: "LABORATORY",
        id: "lab",
        name: "Lab X",
        exclude: true,
        quantity: null,
      },
    ]);
    expect(incluidos.map((d) => [d.name, d.quantity])).toEqual([
      ["Acondicionador", 2],
      ["Shampoo", 1],
    ]);
    expect(excluidos.map((d) => d.name)).toEqual(["Lab X"]);
  });
});
