import { enTandas } from "./en-tandas";

describe("enTandas", () => {
  it("parte la lista, saca repetidos y junta los resultados en orden", async () => {
    const pedidas: string[][] = [];
    const resultado = await enTandas(
      ["a", "b", "c", "a", "d", "e"],
      async (tanda) => {
        pedidas.push(tanda);
        return tanda.map((id) => id.toUpperCase());
      },
      2,
    );
    expect(pedidas).toEqual([["a", "b"], ["c", "d"], ["e"]]);
    expect(resultado).toEqual(["A", "B", "C", "D", "E"]);
  });
  it("no consulta nada con la lista vacía", async () => {
    const consulta = jest.fn(async () => []);
    expect(await enTandas([], consulta)).toEqual([]);
    expect(consulta).not.toHaveBeenCalled();
  });
});
