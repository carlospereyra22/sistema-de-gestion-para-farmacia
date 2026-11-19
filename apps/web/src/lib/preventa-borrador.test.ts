import { describe, expect, it } from "vitest";

import {
  borrarBorrador,
  borradorVacio,
  clienteCoincide,
  guardarBorrador,
  guardarClienteActual,
  leerBorrador,
  leerClienteActual,
  type Almacen,
} from "./preventa-borrador";

function memoria(): Almacen & { datos: Map<string, string> } {
  const datos = new Map<string, string>();
  return {
    datos,
    getItem: (k) => datos.get(k) ?? null,
    setItem: (k, v) => void datos.set(k, v),
    removeItem: (k) => void datos.delete(k),
  };
}

const conProductos = {
  ...borradorVacio(),
  renglones: [{ productId: "agua", quantity: 12 }],
  productos: {},
};

describe("borrador del pedido, uno por cliente", () => {
  it("cada cliente tiene su carrito: cambiar de cliente no arrastra productos", () => {
    const m = memoria();
    guardarBorrador("o", "u", "geriatrico", conProductos, m);
    expect(leerBorrador("o", "u", "geriatrico", m)?.renglones).toHaveLength(1);
    expect(leerBorrador("o", "u", "caetano", m)).toBeNull();
  });

  it("es de cada usuario y cada farmacia", () => {
    const m = memoria();
    guardarBorrador("o", "u", "c", conProductos, m);
    expect(leerBorrador("o", "otro", "c", m)).toBeNull();
    expect(leerBorrador("otra", "u", "c", m)).toBeNull();
  });

  it("sin productos no queda nada guardado", () => {
    const m = memoria();
    guardarBorrador("o", "u", "c", conProductos, m);
    guardarBorrador("o", "u", "c", borradorVacio(), m);
    expect(m.datos.size).toBe(0);
    guardarBorrador("o", "u", "c", conProductos, m);
    borrarBorrador("o", "u", "c", m);
    expect(leerBorrador("o", "u", "c", m)).toBeNull();
  });

  it("descarta renglones rotos y datos inválidos", () => {
    const m = memoria();
    m.setItem(
      "preventa:borrador:v2:o:u:c",
      JSON.stringify({
        renglones: [
          { productId: "a", quantity: 2 },
          { productId: "b", quantity: -1 },
          { productId: "c", quantity: 1.5 },
          { productId: "d", quantity: 1, unitPriceMinor: "1,5" },
        ],
      }),
    );
    expect(leerBorrador("o", "u", "c", m)?.renglones).toEqual([
      { productId: "a", quantity: 2 },
    ]);
    m.setItem("preventa:borrador:v2:o:u:x", "{roto");
    expect(leerBorrador("o", "u", "x", m)).toBeNull();
  });

  it("recuerda el cliente en armado para volver al recargar", () => {
    const m = memoria();
    guardarClienteActual(
      "o",
      "u",
      { id: "c", name: "Kiosco", address: null },
      m,
    );
    expect(leerClienteActual("o", "u", m)?.name).toBe("Kiosco");
    guardarClienteActual("o", "u", null, m);
    expect(leerClienteActual("o", "u", m)).toBeNull();
  });
});

describe("búsqueda de clientes", () => {
  const cliente = {
    name: "Kiosco San Martín",
    address: "Bv. Illia 820",
    document: "20-12345678-9",
    phone: "351 600-1111",
  };

  it("no le importan las tildes ni las mayúsculas", () => {
    expect(clienteCoincide(cliente, "martin")).toBe(true);
    expect(clienteCoincide(cliente, "KIOSCO san")).toBe(true);
    expect(clienteCoincide(cliente, "illia")).toBe(true);
    expect(clienteCoincide(cliente, "almacén")).toBe(false);
  });

  it("encuentra por teléfono o documento", () => {
    expect(clienteCoincide(cliente, "6001111")).toBe(true);
    expect(clienteCoincide(cliente, "12345678")).toBe(true);
  });
});
