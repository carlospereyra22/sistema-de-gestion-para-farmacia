import { describe, expect, it } from "vitest";

import {
  actualizarPrecios,
  agregarAlCarrito,
  cambiarCantidad,
  guardarCarrito,
  iniciales,
  leerCarrito,
  totalEstimado,
  unidadesEnCarrito,
  type RenglonCarrito,
} from "./carrito";

const agua = {
  productId: "a",
  name: "Agua 2 L",
  priceMinor: "55600",
  hasImage: false,
  presentation: null,
};

describe("catálogo online: carrito", () => {
  it("agrega un producto y suma si ya estaba", () => {
    const uno = agregarAlCarrito([], agua);
    expect(uno).toEqual([{ ...agua, quantity: 1 }]);
    expect(agregarAlCarrito(uno, agua, 2)[0]?.quantity).toBe(3);
  });

  it("en cero el producto sale del carrito y no pasa del máximo", () => {
    const carrito = agregarAlCarrito([], agua, 2);
    expect(cambiarCantidad(carrito, "a", 0)).toEqual([]);
    expect(cambiarCantidad(carrito, "a", 5000)[0]?.quantity).toBe(999);
  });

  it("calcula unidades y total estimado en centavos", () => {
    const carrito = agregarAlCarrito(agregarAlCarrito([], agua, 2), {
      ...agua,
      productId: "b",
      priceMinor: "100",
    });
    expect(unidadesEnCarrito(carrito)).toBe(3);
    expect(totalEstimado(carrito)).toBe("111300");
  });

  it("sin precio visible no hay total estimado", () => {
    expect(totalEstimado([{ ...agua, priceMinor: null, quantity: 1 }])).toBe(
      null,
    );
  });

  it("actualiza los precios con los de la API", () => {
    const carrito = agregarAlCarrito([], agua);
    expect(
      actualizarPrecios(carrito, new Map([["a", "60000"]]))[0]?.priceMinor,
    ).toBe("60000");
  });

  it("guarda y lee el carrito por catálogo, descartando datos rotos", () => {
    const datos = new Map<string, string>();
    const almacen = {
      getItem: (k: string) => datos.get(k) ?? null,
      setItem: (k: string, v: string) => void datos.set(k, v),
      removeItem: (k: string) => void datos.delete(k),
    };
    const carrito: RenglonCarrito[] = [{ ...agua, quantity: 2 }];
    guardarCarrito("farmacia-uno", carrito, almacen);
    expect(leerCarrito("farmacia-uno", almacen)).toEqual(carrito);
    expect(leerCarrito("farmacia-dos", almacen)).toEqual([]);
    datos.set("catalogo-carrito:farmacia-uno", "{roto");
    expect(leerCarrito("farmacia-uno", almacen)).toEqual([]);
    guardarCarrito("farmacia-uno", [], almacen);
    expect(datos.size).toBe(0);
  });

  it("arma las iniciales de un producto sin foto", () => {
    expect(iniciales("Alcohol en gel 500 ml")).toBe("AE");
    expect(iniciales("Óleo calcáreo")).toBe("OC");
    expect(iniciales("x 1")).toBe("?");
  });
});
