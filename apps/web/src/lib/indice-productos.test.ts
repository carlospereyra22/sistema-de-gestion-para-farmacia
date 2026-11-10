import { describe, expect, it } from "vitest";
import {
  productoPorCodigo,
  productoPorId,
  textoDeBusqueda,
} from "./indice-productos";

const catalogo = [
  { id: "a", name: "Ibuprofeno 400", barcodes: [{ code: "779001" }] },
  { id: "b", name: "Paracetamol 500", barcodes: [{ code: "779002" }] },
];

describe("índice de productos", () => {
  it("encuentra por id y por código sin recorrer la lista", () => {
    expect(productoPorId(catalogo, "b")?.name).toBe("Paracetamol 500");
    expect(productoPorId(catalogo, "z")).toBeUndefined();
    expect(productoPorId(catalogo, undefined)).toBeUndefined();
    expect(productoPorCodigo(catalogo, " 779001 ")?.id).toBe("a");
  });

  it("una lista nueva tiene su propio índice", () => {
    const otra = [{ id: "a", name: "Otro", barcodes: [] }];
    expect(productoPorId(otra, "a")?.name).toBe("Otro");
    expect(productoPorId(catalogo, "a")?.name).toBe("Ibuprofeno 400");
  });

  it("arma el texto de búsqueda con nombre y códigos en minúsculas", () => {
    expect(textoDeBusqueda(catalogo[0]!)).toBe("ibuprofeno 400 779001");
  });
});
