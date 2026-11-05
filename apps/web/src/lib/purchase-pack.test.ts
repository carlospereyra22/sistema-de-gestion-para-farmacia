import { describe, expect, it } from "vitest";
import type { CatalogProduct } from "./api";
import type { ImportRow } from "./purchase-excel";
import {
  applyPacks,
  intactPacks,
  invoicePackFactor,
  packSaleProduct,
  packSearchText,
  productPackFactor,
} from "./purchase-pack";

const pack = {
  barcode: "7795345124247",
  baseBarcode: "7795345124230",
  factor: 20,
};
const row = (overrides: Partial<ImportRow> = {}): ImportRow => ({
  rowNumber: 4,
  name: "SERTAL COMPUESTO VL COM.RE X10 EXHIB. X20",
  code: "7795345124247",
  quantity: "1",
  cost: "120725.38",
  productId: null,
  matchedBy: null,
  issue: "Elegí un producto",
  ...overrides,
});
const base = {
  id: "base",
  name: "SERTAL COMPUESTO VL",
  active: true,
  barcodes: [{ code: "7795345124230" }],
} as unknown as CatalogProduct;

describe("exhibidores enteros", () => {
  const lot = (sellableQuantity: number) => ({ sellableQuantity });

  it("20 unidades son 1 exhibidor y 19 ya no", () => {
    expect(intactPacks([lot(20)], 20)).toBe(1);
    expect(intactPacks([lot(19)], 20)).toBe(0);
  });

  it("3 sueltas de otro lote no cambian el exhibidor", () => {
    expect(intactPacks([lot(3), lot(20)], 20)).toBe(1);
  });

  it("no arma un exhibidor sumando lotes distintos", () => {
    expect(intactPacks([lot(19), lot(3)], 20)).toBe(0);
  });

  it("cuenta varios exhibidores", () => {
    expect(intactPacks([lot(40), lot(20)], 20)).toBe(3);
  });

  it("lo vencido no cuenta", () => {
    expect(intactPacks([lot(0)], 20)).toBe(0);
  });
});

describe("venta de un exhibidor", () => {
  it("vende N unidades del producto base", () => {
    expect(packSaleProduct(" 7795345124247 ", [base], [pack])).toEqual({
      product: base,
      factor: 20,
    });
  });

  it("un código común no es exhibidor", () => {
    expect(packSaleProduct("7795345124230", [base], [pack])).toBeNull();
  });

  it("sin el producto base en la farmacia no se puede vender", () => {
    expect(packSaleProduct("7795345124247", [], [pack])).toBeNull();
  });
});

describe("factor de un producto", () => {
  it("lo encuentra por el código base, con o sin ceros", () => {
    expect(productPackFactor(base, [pack])).toBe(20);
    expect(
      productPackFactor({ barcodes: [{ code: "07795345124230" }] } as never, [
        pack,
      ]),
    ).toBe(20);
  });

  it("un producto sin exhibidor no tiene factor", () => {
    expect(
      productPackFactor({ barcodes: [{ code: "7795378001072" }] } as never, [
        pack,
      ]),
    ).toBeNull();
  });
});

describe("factor del exhibidor", () => {
  it.each([
    ["SERTAL COMPUESTO VL COM.RE X10 EXHIB. X20", 20],
    ["SERTAL PERLAS VL X10 EXHIB. X10", 10],
    ["PRODUCTO exhib x 6", 6],
  ])("lee %s", (name, factor) => {
    expect(invoicePackFactor(name)).toBe(factor);
  });

  it("sin la palabra exhibidor no hay factor", () => {
    expect(invoicePackFactor("BUSCAPINA DUO COM.RE X10X10 BLISTER")).toBeNull();
    expect(invoicePackFactor("MIGRAL COMPOSITUM COMPR. X100")).toBeNull();
  });

  it("no acepta un factor de una unidad", () => {
    expect(invoicePackFactor("PRODUCTO EXHIB. X1")).toBeNull();
  });
});

describe("texto para buscar el envase base", () => {
  it("usa las dos primeras palabras", () => {
    expect(packSearchText("SERTAL PERLAS VL X10 EXHIB. X10")).toBe(
      "SERTAL PERLAS",
    );
  });
});

describe("renglón de exhibidor", () => {
  it("suma N unidades al producto base y divide el costo", () => {
    const [applied] = applyPacks([row()], [pack], [base]);
    expect(applied).toEqual(
      expect.objectContaining({
        productId: "base",
        code: "7795345124230",
        quantity: "20",
        cost: "6036.27",
        matchedBy: "code",
        issue: null,
        pack: { code: "7795345124247", factor: 20 },
      }),
    );
  });

  it("multiplica la cantidad de exhibidores de la factura", () => {
    expect(
      applyPacks([row({ quantity: "3" })], [pack], [base])[0]?.quantity,
    ).toBe("60");
  });

  it("si la farmacia no tiene el producto base, queda para crearlo", () => {
    const [applied] = applyPacks([row()], [pack], []);
    expect(applied?.productId).toBeNull();
    expect(applied?.code).toBe("7795345124230");
    expect(applied?.issue).toBe("Elegí un producto");
  });

  it("no toca los renglones sin equivalencia", () => {
    const original = row({ code: "7795378001072" });
    expect(applyPacks([original], [pack], [base])[0]).toBe(original);
  });

  it("no vincula un producto base archivado", () => {
    const archived = { ...base, active: false };
    expect(applyPacks([row()], [pack], [archived])[0]?.productId).toBeNull();
  });
});
