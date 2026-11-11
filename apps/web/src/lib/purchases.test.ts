import { describe, expect, it } from "vitest";
import {
  preparePurchaseLines,
  prepareReceiptLines,
  purchasePending,
  receiptLotChange,
  receiptLotMax,
  purchaseStatus,
  purchaseLineMinor,
} from "./purchases";

const item = {
  id: "item",
  productId: "product",
  orderedQuantity: 200,
  receivedQuantity: 100,
  cancelledQuantity: 0,
  unitCostMinor: "70000",
};
const row = (quantity: string, lotNumber = "A") => ({
  key: lotNumber,
  itemId: "item",
  quantity,
  lotNumber,
  expiresAt: "",
});
describe("purchase editor validation", () => {
  it("accepts 50 products and converts costs to minor units", () => {
    const lines = preparePurchaseLines(
      Array.from({ length: 50 }, (_, i) => ({
        productId: String(i),
        quantity: "200",
        cost: "700.25",
      })),
    );
    expect(lines).toHaveLength(50);
    expect(lines[0]).toEqual({
      productId: "0",
      quantity: 200,
      unitCostMinor: 70025,
    });
  });
  it("rejects repeated products, empty costs, fractional and negative quantities", () => {
    const line = { productId: "p", quantity: "1", cost: "1" };
    expect(() => preparePurchaseLines([line, line])).toThrow();
    for (const quantity of ["", "-1", "1.5", "Infinity"])
      expect(() => preparePurchaseLines([{ ...line, quantity }])).toThrow();
    expect(() => preparePurchaseLines([{ ...line, cost: "" }])).toThrow();
  });
  it("receives several lots with one aggregate limit and ignores unreceived lines", () => {
    expect(
      prepareReceiptLines([row("60"), row("40", "B"), row("")], [item]),
    ).toHaveLength(2);
    expect(() =>
      prepareReceiptLines([row("60"), row("41", "B")], [item]),
    ).toThrow();
    expect(() => prepareReceiptLines([row("1", "")], [item])).toThrow();
    expect(() => prepareReceiptLines([row("")], [item])).toThrow();
  });
  it("deducts closed balance without changing received quantities and translates statuses", () => {
    expect(purchasePending({ ...item, cancelledQuantity: 100 })).toBe(0);
    expect(
      purchaseStatus({ status: "CANCELLED", closedAt: "2026-10-19" }),
    ).toBe("Saldo cerrado");
    expect(purchaseStatus({ status: "PARTIALLY_RECEIVED" })).toBe(
      "Recibida parcialmente",
    );
  });
});

describe("máximo de un lote en la recepción", () => {
  const linea = {
    id: "linea-1",
    productId: "producto-1",
    orderedQuantity: 20,
    receivedQuantity: 5,
    cancelledQuantity: 3,
    unitCostMinor: "1000",
  };
  const lote = (key: string, itemId: string, quantity: string) => ({
    key,
    itemId,
    quantity,
    lotNumber: "",
    expiresAt: "",
  });

  it("con un solo lote es todo lo pendiente", () => {
    expect(receiptLotMax(linea, [lote("a", "linea-1", "")], "a")).toBe(12);
  });

  it("descuenta lo cargado en los otros lotes del mismo producto", () => {
    const lotes = [
      lote("a", "linea-1", "2"),
      lote("b", "linea-1", "7"),
      lote("c", "linea-2", "9"),
    ];
    expect(receiptLotMax(linea, lotes, "a")).toBe(5);
  });

  it("no baja de cero si los otros lotes ya cubren el pendiente", () => {
    const lotes = [lote("a", "linea-1", ""), lote("b", "linea-1", "30")];
    expect(receiptLotMax(linea, lotes, "a")).toBe(0);
  });
});

describe("exhibidor en la compra", () => {
  it("manda el factor solo si la línea vino en exhibidor", () => {
    const line = { productId: "p", quantity: "20", cost: "6036.27" };
    expect(preparePurchaseLines([line])[0]).not.toHaveProperty("packFactor");
    expect(
      preparePurchaseLines([{ ...line, packFactor: 20 }])[0]?.packFactor,
    ).toBe(20);
  });
});

describe("receiptLotChange", () => {
  const row = {
    key: "fila",
    itemId: "linea",
    quantity: "1",
    lotNumber: "",
    expiresAt: "",
  };
  const lots = [
    { number: "A1", expiresAt: "2027-05-18T00:00:00.000Z" },
    { number: "SIN", expiresAt: null },
  ];

  it("trae el vencimiento de un lote existente, aunque ya hubiera otra fecha", () => {
    expect(
      receiptLotChange({ ...row, expiresAt: "2030-01-01" }, " A1 ", lots)
        .expiresAt,
    ).toBe("2027-05-18");
    expect(receiptLotChange(row, "SIN", lots).expiresAt).toBe("");
  });

  it("conserva la fecha escrita para un lote nuevo", () => {
    expect(
      receiptLotChange({ ...row, expiresAt: "2030-01-01" }, "NUEVO", lots)
        .expiresAt,
    ).toBe("2030-01-01");
  });

  it("limpia la fecha traída al pasar de un lote existente a uno nuevo", () => {
    const picked = receiptLotChange(row, "A1", lots);
    expect(receiptLotChange(picked, "A12", lots).expiresAt).toBe("");
  });
});

describe("importe estimado de la compra", () => {
  it("redondea el costo al centavo antes de multiplicar, igual que al guardar", () => {
    // Costo de factura con 4 decimales: se guarda 953276 centavos por unidad (antes la vista previa mostraba un centavo de más).
    const line = { productId: "p", quantity: "3", cost: "9532.7649" };
    const [guardada] = preparePurchaseLines([line]);
    expect(purchaseLineMinor(line)).toBe(
      guardada!.quantity * guardada!.unitCostMinor,
    );
    expect(purchaseLineMinor(line)).toBe(2859828);
  });

  it("una línea incompleta no suma", () => {
    expect(purchaseLineMinor({ quantity: "", cost: "10" })).toBe(0);
    expect(purchaseLineMinor({ quantity: "1.5", cost: "10" })).toBe(0);
  });
});
