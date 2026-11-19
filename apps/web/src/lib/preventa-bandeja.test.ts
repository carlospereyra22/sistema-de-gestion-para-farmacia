import { describe, expect, it } from "vitest";

import { SinConexionError } from "./api-fetch";
import type { PedidoPreventa } from "./preventa-api";
import {
  agregarABandeja,
  enviarBandeja,
  leerBandeja,
  reintentarDeBandeja,
  type Almacen,
  type PedidoEnBandeja,
} from "./preventa-bandeja";

function memoria(): Almacen {
  const datos = new Map<string, string>();
  return {
    getItem: (k) => datos.get(k) ?? null,
    setItem: (k, v) => void datos.set(k, v),
  };
}

const pedido = (requestId: string): PedidoEnBandeja => ({
  requestId,
  customerId: "c",
  customerName: "Kiosco",
  items: [{ productId: "p", quantity: 1, productName: "Agua" }],
  notes: null,
  totalEstimadoMinor: "1000",
  tomadoEl: "2026-11-17T10:00:00Z",
});

const ok = (requestId: string) =>
  ({ id: requestId, number: 1 }) as unknown as PedidoPreventa;

describe("bandeja de pedidos sin señal", () => {
  it("guarda por usuario y organización, sin repetir el mismo pedido", () => {
    const almacen = memoria();
    agregarABandeja("u1", "o1", pedido("a"), almacen);
    agregarABandeja("u1", "o1", pedido("a"), almacen);
    agregarABandeja("u2", "o1", pedido("b"), almacen);
    expect(leerBandeja("u1", "o1", almacen).map((p) => p.requestId)).toEqual([
      "a",
    ]);
    expect(leerBandeja("u2", "o1", almacen)).toHaveLength(1);
  });

  it("manda en orden, se frena sin conexión y conserva lo que falta", async () => {
    const almacen = memoria();
    agregarABandeja("u", "o", pedido("a"), almacen);
    agregarABandeja("u", "o", pedido("b"), almacen);
    agregarABandeja("u", "o", pedido("c"), almacen);
    const vistos: string[] = [];
    const resultado = await enviarBandeja(
      "u",
      "o",
      async (p) => {
        vistos.push(p.requestId);
        if (p.requestId === "b") throw new SinConexionError();
        return ok(p.requestId);
      },
      almacen,
    );
    expect(vistos).toEqual(["a", "b"]);
    expect(resultado.enviados).toHaveLength(1);
    expect(leerBandeja("u", "o", almacen).map((p) => p.requestId)).toEqual([
      "b",
      "c",
    ]);
  });

  it("un rechazo del servidor queda para revisar y no frena al resto", async () => {
    const almacen = memoria();
    agregarABandeja("u", "o", pedido("a"), almacen);
    agregarABandeja("u", "o", pedido("b"), almacen);
    const resultado = await enviarBandeja(
      "u",
      "o",
      async (p) => {
        if (p.requestId === "a") throw new Error("Sin stock de Agua");
        return ok(p.requestId);
      },
      almacen,
    );
    expect(resultado).toMatchObject({ conError: 1, quedan: 1 });
    const [conError] = leerBandeja("u", "o", almacen);
    expect(conError?.error).toBe("Sin stock de Agua");
    // Al reintentar se vuelve a mandar.
    reintentarDeBandeja("u", "o", "a", almacen);
    expect(leerBandeja("u", "o", almacen)[0]?.error).toBeUndefined();
  });

  it("tolera datos rotos en el almacenamiento", () => {
    const almacen = memoria();
    almacen.setItem("preventa:bandeja:o:u", "{no es json");
    expect(leerBandeja("u", "o", almacen)).toEqual([]);
  });
});
