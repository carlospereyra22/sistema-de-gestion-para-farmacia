import { allocateSaleLots } from "./sale-lot-allocation";

const suelto = (quantity: number) => ({
  id: "suelto",
  quantity,
  packFactor: null,
  packCount: 0,
});
const exhibidor = (quantity: number, packCount = 1, id = "exhibidor") => ({
  id,
  quantity,
  packFactor: 10,
  packCount,
});
const reparto = (
  lots: ReturnType<typeof suelto | typeof exhibidor>[],
  quantity: number,
  packQuantity?: number,
) =>
  allocateSaleLots(lots, quantity, packQuantity).map((item) => [
    item.lot.id,
    item.quantity,
  ]);

describe("reparto de una venta entre lotes", () => {
  it("una venta común sale de lo que vence antes", () => {
    expect(reparto([suelto(26), exhibidor(10)], 5)).toEqual([["suelto", 5]]);
  });

  it("una venta común que no alcanza sigue con el lote siguiente", () => {
    expect(reparto([suelto(7), exhibidor(20, 1)], 8)).toEqual([
      ["suelto", 7],
      ["exhibidor", 1],
    ]);
  });

  it("vender un exhibidor descuenta de ese lote, aunque otro venza antes", () => {
    expect(reparto([suelto(26), exhibidor(10)], 10, 10)).toEqual([
      ["exhibidor", 10],
    ]);
  });

  it("un exhibidor y una caja suelta salen cada uno de su lote", () => {
    expect(reparto([suelto(26), exhibidor(10)], 11, 10)).toEqual([
      ["suelto", 1],
      ["exhibidor", 10],
    ]);
  });

  it("un exhibidor abierto no se toma como cerrado", () => {
    expect(reparto([suelto(26), exhibidor(9)], 10, 10)).toEqual([
      ["suelto", 10],
    ]);
  });

  it("sin exhibidores cerrados vende igual por vencimiento", () => {
    expect(reparto([suelto(26)], 10, 10)).toEqual([["suelto", 10]]);
  });

  it("toma de varios lotes con exhibidores", () => {
    expect(
      reparto([exhibidor(10, 1, "uno"), exhibidor(20, 2, "dos")], 30, 30),
    ).toEqual([
      ["uno", 10],
      ["dos", 20],
    ]);
  });

  it("no cuenta como cerradas las sueltas sumadas al mismo lote", () => {
    expect(reparto([exhibidor(25, 1), suelto(10)], 20, 20)).toEqual([
      ["exhibidor", 20],
    ]);
  });

  it("no vende más exhibidor que la cantidad de la línea", () => {
    expect(reparto([suelto(5), exhibidor(10)], 3, 10)).toEqual([
      ["exhibidor", 3],
    ]);
  });
});
