import { lotReturnableStock, lotSupplierBreakdown } from "./lot-suppliers";

const receipts = [
  { supplierId: "juan", quantity: 41 },
  { supplierId: "carlos", quantity: 1 },
];
const breakdown = (
  lotQuantity: number,
  history: Partial<Parameters<typeof lotSupplierBreakdown>[1]> = {},
) =>
  Object.fromEntries(
    lotSupplierBreakdown(lotQuantity, { receipts, returns: [], ...history }),
  );

describe("unidades de cada proveedor en un lote", () => {
  it("separa lo que entregó cada uno", () => {
    expect(breakdown(42)).toEqual({ juan: 41, carlos: 1 });
  });

  it("un ajuste que resta sale del proveedor elegido y el resto del más viejo", () => {
    expect(
      breakdown(12, { returns: [{ supplierId: "carlos", quantity: 1 }] }),
    ).toEqual({ juan: 12, carlos: 0 });
  });

  it("un ajuste que resta Sin proveedor no toca a los proveedores", () => {
    expect(
      Object.fromEntries(
        lotSupplierBreakdown(12, {
          receipts: [{ supplierId: "juan", quantity: 10 }],
          returns: [{ supplierId: null, quantity: 3 }],
        }),
      ),
    ).toEqual({ juan: 10, null: 2 });
  });

  it("las ventas gastan primero lo más viejo", () => {
    expect(breakdown(12)).toEqual({ juan: 11, carlos: 1 });
    expect(breakdown(1)).toEqual({ juan: 0, carlos: 1 });
  });

  it("una carga repetida respeta el orden en que entró", () => {
    expect(
      breakdown(3, {
        receipts: [
          { supplierId: "juan", quantity: 2 },
          { supplierId: "carlos", quantity: 2 },
          { supplierId: "juan", quantity: 2 },
        ],
      }),
    ).toEqual({ juan: 2, carlos: 1 });
  });

  it("una devolución sale del proveedor indicado", () => {
    expect(
      breakdown(41, { returns: [{ supplierId: "carlos", quantity: 1 }] }),
    ).toEqual({ juan: 41, carlos: 0 });
  });

  it("devolver a un proveedor sin cargas sale de lo que no tiene proveedor", () => {
    expect(
      Object.fromEntries(
        lotSupplierBreakdown(6, {
          receipts: [
            { supplierId: null, quantity: 5 },
            { supplierId: "juan", quantity: 5 },
          ],
          returns: [{ supplierId: "otro", quantity: 4 }],
        }),
      ),
    ).toEqual({ null: 1, juan: 5 });
  });

  it("el stock sin carga conocida queda sin proveedor y la suma cierra", () => {
    expect(breakdown(45)).toEqual({ juan: 41, carlos: 1, null: 3 });
    expect(
      lotSupplierBreakdown(8, { receipts: [], returns: [] }).get(null),
    ).toBe(8);
  });

  it("lo de un proveedor dado de baja pasa a sin proveedor", () => {
    const stock = lotReturnableStock(
      lotSupplierBreakdown(42, { receipts, returns: [] }),
      new Set(["juan"]),
    );
    expect(stock.suppliers.get("juan")).toBe(41);
    expect(stock.unassigned).toBe(1);
  });
});
