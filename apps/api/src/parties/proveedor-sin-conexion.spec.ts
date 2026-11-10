import {
  camposDelRegistro,
  camposPisados,
  horaDelRegistro,
} from "./proveedor-sin-conexion";

const a = new Date("2026-11-10T12:00:00.000Z");
const despues = new Date("2026-11-10T13:00:00.000Z");
const antes = new Date("2026-11-10T11:00:00.000Z");

describe("camposDelRegistro", () => {
  it("compara antes y después en una edición con conexión", () => {
    expect(
      camposDelRegistro({
        createdAt: a,
        before: { phone: "1", email: "x@y.com", accountTermDays: 30 },
        after: { phone: "2", email: "x@y.com", accountTermDays: 30 },
      }),
    ).toEqual(["phone"]);
  });
  it("usa los campos anotados en una edición sin conexión", () => {
    expect(
      camposDelRegistro({
        createdAt: a,
        before: null,
        after: { fields: ["notes", "accountEnabled"] },
      }),
    ).toEqual(["notes", "accountEnabled"]);
  });
});

describe("horaDelRegistro", () => {
  it("toma la hora real de lo hecho sin conexión", () => {
    expect(
      horaDelRegistro({
        createdAt: despues,
        before: null,
        after: { occurredAt: antes.toISOString() },
      }),
    ).toEqual(antes);
  });
});

describe("camposPisados", () => {
  const registros = [
    { createdAt: despues, before: { phone: "1" }, after: { phone: "2" } },
    { createdAt: antes, before: { notes: "a" }, after: { notes: "b" } },
  ];
  it("sólo pisa lo que otra PC cambió después", () => {
    expect(camposPisados(registros, a, ["phone", "notes"])).toEqual(["phone"]);
  });
  it("no pisa campos que no se pidieron", () => {
    expect(camposPisados(registros, a, ["email"])).toEqual([]);
  });
});
