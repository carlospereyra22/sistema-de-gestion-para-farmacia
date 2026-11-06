import {
  cashMovementCategory,
  formatCashMinor,
  saleChangeMinor,
} from "./cash-movement-category";

const id = "0f8fad5b-d9cb-469f-a165-70867728950e";

describe("categoría de movimientos de caja", () => {
  it.each([
    [`Vuelto de venta ${id}`, "SALE_CHANGE"],
    [`Change for sale ${id}`, "SALE_CHANGE"],
    [`Anulación de vuelto · Venta ${id}: Error`, "SALE_CHANGE_REVERSAL"],
    [
      `Cobro cuenta corriente · Ana · Pérez · Recibo ${id}`,
      "ACCOUNT_COLLECTION",
    ],
    [
      `Asignación de cobro sin caja · Venta ${id} · 2026-11-05T10:00:00.000Z`,
      "PENDING_ASSIGNMENT",
    ],
    [
      `Asignación de cobro sin caja · Recibo ${id} · 2026-11-05T10:00:00.000Z`,
      "PENDING_ASSIGNMENT",
    ],
    [`Anulación de cobro asignado · Venta ${id}: Error`, "PENDING_REVERSAL"],
    [`Nota de crédito ${id}: Devolución`, "CREDIT_NOTE"],
    ["Pago de limpieza", "MANUAL"],
    ["", "MANUAL"],
  ])("%s", (reason, category) => {
    expect(cashMovementCategory(reason)).toBe(category);
  });

  it("no confunde un motivo manual parecido con un vuelto", () => {
    expect(cashMovementCategory("Vuelto de venta del martes")).toBe("MANUAL");
    expect(cashMovementCategory("Nota de crédito pendiente: revisar")).toBe(
      "MANUAL",
    );
  });
});

it("descuenta del vuelto entregado el que se revirtió al anular", () => {
  expect(
    saleChangeMinor([
      { reason: `Vuelto de venta ${id}`, amountMinor: 200n },
      { reason: `Change for sale ${id}`, amountMinor: 50n },
      { reason: `Anulación de vuelto · Venta ${id}: Error`, amountMinor: 200n },
      { reason: "Pago de limpieza", amountMinor: 900n },
    ]),
  ).toBe(50n);
});

it("formatea importes en pesos sin pasar por float", () => {
  expect(formatCashMinor(123456n)).toBe("$ 1.234,56");
  expect(formatCashMinor(5n)).toBe("$ 0,05");
  expect(formatCashMinor(-100000n)).toBe("-$ 1.000,00");
  expect(formatCashMinor(900719925474099312n)).toBe(
    "$ 9.007.199.254.740.993,12",
  );
});
