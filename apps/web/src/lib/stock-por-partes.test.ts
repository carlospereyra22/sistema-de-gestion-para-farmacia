import { beforeEach, describe, expect, it, vi } from "vitest";
import { almacenEnMemoria, usarAlmacen } from "./almacen-local";
import { SinConexionError } from "./api-fetch";
import { armarStock, type StockLot } from "./api";
import { copiaAlDia, olvidarCopiasEnMemoria } from "./copia-por-partes";

type Lote = Omit<
  StockLot,
  "sellableQuantity" | "expiredQuantity" | "expiryStatus"
>;

const lote = (id: string, productId: string, extra: Partial<Lote> = {}) => ({
  metadataVersion: 0,
  id,
  productId,
  productName: "Ibuprofeno",
  number: "L1",
  quantity: 5,
  expiresAt: "2099-01-01T00:00:00.000Z",
  createdAt: "2026-01-01T00:00:00.000Z",
  ...extra,
});

describe("stock por partes en la PC (SISTEMA-77)", () => {
  beforeEach(() => {
    usarAlmacen(almacenEnMemoria());
    olvidarCopiasEnMemoria();
  });

  it("arma el stock como el pedido completo: primero lo que vence antes, sin vencimiento al final", () => {
    const stock = armarStock([
      [lote("c", "0a", { expiresAt: null })],
      [
        lote("b", "1f", { expiresAt: "2099-01-01T00:00:00.000Z" }),
        lote("a", "1f", { expiresAt: "2000-01-01T00:00:00.000Z" }),
      ],
    ]);
    expect(stock.map((l) => l.id)).toEqual(["a", "b", "c"]);
    // Lo que depende del día se calcula al armar.
    expect(stock[0]).toMatchObject({
      expiryStatus: "EXPIRED",
      sellableQuantity: 0,
      expiredQuantity: 5,
    });
    expect(stock[1]).toMatchObject({
      expiryStatus: "AVAILABLE",
      sellableQuantity: 5,
    });
  });

  it("baja sólo las partes que cambiaron, devuelve la misma lista si nada cambió y anda sin conexión", async () => {
    const versiones = { "0a": "v1", "1f": "v1" };
    const lotes: Record<string, Lote[]> = {
      "0a": [lote("a", "0a")],
      "1f": [lote("b", "1f")],
    };
    let dia = "lunes";
    let conectado = true;
    const partes = vi.fn(async (pedidas: string[]) => ({
      versiones: Object.fromEntries(
        pedidas.map((p) => [p, versiones[p as "0a"]]),
      ),
      elementos: pedidas.flatMap((p) => lotes[p] ?? []),
    }));
    const lista = () => ({
      base: "ana|stock|o1|b1|",
      versiones: async () => {
        if (!conectado) throw new SinConexionError();
        return { partes: { ...versiones } };
      },
      partes,
      parteDe: (l: Lote) => l.productId.slice(0, 2),
      armar: (p: Iterable<Lote[]>) => armarStock(p),
      vigencia: () => dia,
    });
    const primera = await copiaAlDia(lista());
    expect(primera.map((l) => l.id)).toEqual(["a", "b"]);
    expect(partes).toHaveBeenCalledWith(["0a", "1f"]);

    // Nada cambió: la misma lista, sin pedir partes.
    expect(await copiaAlDia(lista())).toBe(primera);
    expect(partes).toHaveBeenCalledTimes(1);

    // Cambia el día: se vuelve a armar (vencimientos) sin pedir nada.
    dia = "martes";
    const otroDia = await copiaAlDia(lista());
    expect(otroDia).not.toBe(primera);
    expect(otroDia).toEqual(primera);
    expect(partes).toHaveBeenCalledTimes(1);

    // Una venta cambia un lote: se pide sólo su parte.
    versiones["1f"] = "v2";
    lotes["1f"] = [lote("b", "1f", { quantity: 3 })];
    const despues = await copiaAlDia(lista());
    expect(partes).toHaveBeenLastCalledWith(["1f"]);
    expect(despues.find((l) => l.id === "b")?.quantity).toBe(3);

    // Sin conexión: lo guardado en la PC, aunque se haya perdido la memoria.
    olvidarCopiasEnMemoria();
    conectado = false;
    const sinConexion = await copiaAlDia(lista());
    expect(sinConexion.map((l) => [l.id, l.quantity])).toEqual([
      ["a", 5],
      ["b", 3],
    ]);
  });
});
