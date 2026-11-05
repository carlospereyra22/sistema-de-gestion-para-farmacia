import { describe, expect, it, vi } from "vitest";
import type { MedicineReference } from "./api";
import {
  bulkProductInput,
  bulkReference,
  createRows,
  pendingProductRows,
} from "./purchase-bulk-products";
import type { ImportRow } from "./purchase-excel";

const reference: MedicineReference = {
  source: "preciosderemedios",
  name: "NOVALGINA",
  presentation: "comp.x 30",
  laboratory: "Opella Healthcare Arg.",
  activeIngredient: "dipirona",
  barcode: "7798389330162",
  troquel: "",
  priceMinor: 2000000,
  pamiPriceMinor: null,
  updatedAt: null,
  saleType: "Venta Libre",
  prescriptionRequired: false,
};
const row = (overrides: Partial<ImportRow> = {}): ImportRow => ({
  rowNumber: 1,
  name: "NOVALGINA COMPR. X30",
  code: "7798389330162",
  quantity: "2",
  cost: "19497.93",
  productId: null,
  matchedBy: null,
  issue: "Elegí un producto",
  ...overrides,
});

describe("renglones para crear", () => {
  it("toma solo los que tienen cantidad y no tienen producto", () => {
    const rows = [
      row(),
      row({ rowNumber: 2, productId: "ya" }),
      row({ rowNumber: 3, quantity: "" }),
      row({ rowNumber: 4 }),
    ];
    expect(
      pendingProductRows(rows, { 4: "vinculado" }).map((r) => r.rowNumber),
    ).toEqual([1]);
  });
});

describe("referencia para crear", () => {
  it("usa la única coincidencia", () => {
    expect(bulkReference([reference]).name).toBe("NOVALGINA");
  });

  it("explica por qué no se puede crear", () => {
    expect(() => bulkReference([])).toThrow("No está en la base");
    expect(() => bulkReference([reference, reference])).toThrow("varios");
    expect(() => bulkReference([{ ...reference, priceMinor: null }])).toThrow(
      "no informa precio",
    );
  });
});

describe("datos del producto", () => {
  const options = {
    categories: [{ id: "med", name: "Medicamentos" }],
    laboratories: [{ id: "lab", name: "Opella Healthcare Arg." }],
  };
  const withPrice = bulkReference([reference]);

  it("completa como Nuevo producto y conserva el código del renglón", () => {
    expect(bulkProductInput("07798389330162", withPrice, options)).toEqual(
      expect.objectContaining({
        name: "NOVALGINA",
        barcode: "07798389330162",
        isMedication: true,
        saleUnit: "BOX",
        priceMinor: 2000000,
        categoryId: "med",
        laboratoryId: "lab",
        laboratoryName: undefined,
        externalReferenceSource: "preciosderemedios",
        externalReferenceBarcode: "7798389330162",
        externalReferencePriceMinor: 2000000,
      }),
    );
  });

  it("un laboratorio nuevo se manda por nombre", () => {
    expect(
      bulkProductInput("1", withPrice, { ...options, laboratories: [] }),
    ).toEqual(
      expect.objectContaining({
        laboratoryId: undefined,
        laboratoryName: "Opella Healthcare Arg.",
      }),
    );
  });
});

describe("creación de a uno", () => {
  it("un renglón que falla no frena a los demás", async () => {
    const onProgress = vi.fn();
    const create = vi
      .fn()
      .mockResolvedValueOnce("uno")
      .mockRejectedValueOnce(new Error("El código ya existe."))
      .mockResolvedValueOnce("tres");
    const result = await createRows(
      [
        row({ rowNumber: 1 }),
        row({ rowNumber: 2, name: "REFENAX" }),
        row({ rowNumber: 3 }),
      ],
      create,
      onProgress,
    );
    expect(result.created).toEqual([
      { rowNumber: 1, productId: "uno" },
      { rowNumber: 3, productId: "tres" },
    ]);
    expect(result.failed).toEqual([
      { rowNumber: 2, name: "REFENAX", reason: "El código ya existe." },
    ]);
    expect(onProgress).toHaveBeenLastCalledWith(3);
  });

  it("un renglón sin código falla sin consultar", async () => {
    const create = vi.fn();
    const result = await createRows([row({ code: " " })], create, () => {});
    expect(create).not.toHaveBeenCalled();
    expect(result.failed[0]?.reason).toBe("No tiene código para buscarlo.");
  });
});
