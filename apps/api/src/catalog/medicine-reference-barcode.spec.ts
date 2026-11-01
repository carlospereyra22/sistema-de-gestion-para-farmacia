import { assertMedicineReferenceBarcode } from "./medicine-reference-barcode";

describe("medicinal reference barcode", () => {
  it("rejects the different official IBU EAN before linking the scanned package", () => {
    expect(() =>
      assertMedicineReferenceBarcode("7798420160383", "7790839980590"),
    ).toThrow("no coincide");
  });

  it("accepts identical GTINs with different zero padding", () => {
    expect(() =>
      assertMedicineReferenceBarcode("7793640992769", "07793640992769"),
    ).not.toThrow();
  });

  it("allows a source without EAN or a product waiting for its scan", () => {
    expect(() =>
      assertMedicineReferenceBarcode("7798420160383", ""),
    ).not.toThrow();
    expect(() =>
      assertMedicineReferenceBarcode("", "7790839980590"),
    ).not.toThrow();
  });
});
