import { describe, expect, it } from "vitest";
import {
  accountStatementPeriod,
  estadoDesdeMovimientos,
} from "./account-statement";
import { juntarCostos, type CustomerAccountMovement } from "./api";

const mov = (
  id: string,
  type: "DEBIT" | "CREDIT",
  amountMinor: string,
  createdAt: string,
  branchId = "b1",
): CustomerAccountMovement => ({
  id,
  type,
  amountMinor,
  createdAt,
  note: null,
  saleId: type === "DEBIT" ? `venta-${id}` : null,
  branchId,
  showInStatement: true,
});

const juana = {
  id: "c1",
  name: "Juana",
  document: "123",
  billingTaxId: null,
  billingPhone: null,
};

describe("estado de cuenta armado en la PC (SISTEMA-78)", () => {
  it("acumula el saldo de la sucursal como el servidor", () => {
    const [estado] = estadoDesdeMovimientos(
      [
        {
          cuenta: juana,
          movimientos: [
            mov("2", "CREDIT", "300", "2026-02-10T15:00:00.000Z"),
            mov("1", "DEBIT", "1000", "2026-01-10T15:00:00.000Z"),
            mov("x", "DEBIT", "9999", "2026-01-05T15:00:00.000Z", "otra"),
          ],
        },
      ],
      "b1",
    );
    expect(estado).toMatchObject({ id: "c1", openingBalanceMinor: "0" });
    expect(estado!.movements.map((m) => [m.id, m.balanceMinor])).toEqual([
      ["1", "1000"],
      ["2", "700"],
    ]);
  });

  it("desde un día: saldo anterior y sólo lo de ese día en adelante (Argentina)", () => {
    const [estado] = estadoDesdeMovimientos(
      [
        {
          cuenta: juana,
          movimientos: [
            mov("1", "DEBIT", "1000", "2026-01-10T15:00:00.000Z"),
            // 10/02 a las 00:30 de Argentina: ya es el día pedido.
            mov("2", "CREDIT", "300", "2026-02-10T03:30:00.000Z"),
            mov("3", "DEBIT", "500", "2026-03-10T15:00:00.000Z"),
          ],
        },
      ],
      "b1",
      "2026-02-10",
    );
    expect(estado!.openingBalanceMinor).toBe("1000");
    expect(estado!.movements.map((m) => m.id)).toEqual(["2", "3"]);
    // El período usa ese saldo anterior.
    expect(
      accountStatementPeriod(estado!, {
        customerId: "c1",
        from: "2026-02-10",
        to: "",
      }),
    ).toMatchObject({ opening: "1000", closing: "1200" });
  });

  it("junta los costos de las partes sin repetir proveedores", () => {
    const proveedor = { id: "s1", name: "Droguería" };
    const costos = juntarCostos([
      [
        {
          parte: "0a",
          costos: {
            products: [
              { productId: "0a1", unitCostMinor: "100", receivedAt: "x" },
            ],
            lots: [{ lotId: "l1", receipts: [] }],
            adjustments: [],
            suppliers: [proveedor],
          },
        },
      ],
      [
        {
          parte: "1f",
          costos: {
            products: [
              { productId: "1f1", unitCostMinor: "200", receivedAt: "y" },
            ],
            lots: [],
            suppliers: [proveedor],
          },
        },
      ],
    ]);
    expect(costos.products.map((p) => p.productId)).toEqual(["0a1", "1f1"]);
    expect(costos.lots).toHaveLength(1);
    expect(costos.adjustments).toEqual([]);
    expect(costos.suppliers).toEqual([proveedor]);
  });
});
