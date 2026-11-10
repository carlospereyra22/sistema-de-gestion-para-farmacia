import { esLaMismaDeuda, pagoHastaElSaldo } from "./pagar-sin-conexion";

const dia = (texto: string) => new Date(`${texto}T00:00:00.000Z`);
const deuda = {
  issuedOn: dia("2026-11-01"),
  amountMinor: 10000n,
  dues: [
    { dueOn: dia("2026-11-15"), amountMinor: 4000n },
    { dueOn: dia("2026-11-30"), amountMinor: 6000n },
  ],
};

describe("esLaMismaDeuda", () => {
  it("reconoce la misma factura cargada dos veces", () => {
    expect(
      esLaMismaDeuda(deuda, { ...deuda, dues: [...deuda.dues].reverse() }),
    ).toBe(true);
  });
  it("no es la misma si cambia el importe", () => {
    expect(
      esLaMismaDeuda(deuda, {
        ...deuda,
        amountMinor: 10001n,
        dues: [{ dueOn: null, amountMinor: 10001n }],
      }),
    ).toBe(false);
  });
  it("no es la misma si cambia la emisión", () => {
    expect(
      esLaMismaDeuda(deuda, { ...deuda, issuedOn: dia("2026-11-02") }),
    ).toBe(false);
  });
  it("no es la misma si cambian los vencimientos", () => {
    expect(
      esLaMismaDeuda(deuda, {
        ...deuda,
        dues: [{ dueOn: dia("2026-11-15"), amountMinor: 10000n }],
      }),
    ).toBe(false);
  });
});

describe("pagoHastaElSaldo", () => {
  it("registra todo si alcanza el saldo", () => {
    expect(pagoHastaElSaldo(3000n, 5000n)).toEqual({
      registrar: 3000n,
      sobra: 0n,
    });
  });
  it("registra hasta el saldo y avisa lo que sobra", () => {
    expect(pagoHastaElSaldo(5000n, 2000n)).toEqual({
      registrar: 2000n,
      sobra: 3000n,
    });
  });
  it("no registra nada si la deuda ya estaba saldada", () => {
    expect(pagoHastaElSaldo(5000n, 0n)).toEqual({
      registrar: 0n,
      sobra: 5000n,
    });
  });
});
