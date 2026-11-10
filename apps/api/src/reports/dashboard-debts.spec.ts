import {
  averageTicketMinor,
  customerReceivables,
  supplierDebt,
} from "./dashboard-debts";

describe("indicadores de deudas de Inicio", () => {
  it("calcula el ticket promedio en centavos enteros y sin ventas devuelve cero", () => {
    expect(averageTicketMinor(10000n, 3)).toBe("3333");
    expect(averageTicketMinor(0n, 0)).toBe("0");
  });

  it("suma solo los clientes con deuda e ignora saldos a favor o en cero", () => {
    expect(
      customerReceivables([{ saldo: 1500n }, { saldo: 0n }, { saldo: -200n }]),
    ).toEqual({ count: 1, totalMinor: "1500" });
    expect(customerReceivables([])).toEqual({ count: 0, totalMinor: "0" });
  });

  it("separa lo vencido de lo que vence en 7 días y cuenta facturas, no cuotas", () => {
    const result = supplierDebt(
      [
        { invoiceId: "a", dueOn: new Date("2026-11-05"), saldo: 1000n },
        { invoiceId: "a", dueOn: new Date("2026-11-14"), saldo: 500n },
        { invoiceId: "b", dueOn: new Date("2026-12-30"), saldo: 300n },
        { invoiceId: "c", dueOn: new Date("2026-11-12"), saldo: 0n },
      ],
      "2026-11-10",
    );
    expect(result).toEqual({
      count: 2,
      totalMinor: "1800",
      overdueMinor: "1000",
      todayMinor: "0",
      next7Minor: "500",
      nextDueOn: "2026-11-05",
    });
  });

  it("sin cuotas pendientes informa cero", () => {
    expect(supplierDebt([], "2026-11-10")).toMatchObject({
      count: 0,
      totalMinor: "0",
      nextDueOn: null,
    });
  });
});
