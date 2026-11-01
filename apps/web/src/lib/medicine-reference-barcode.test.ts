import { describe, expect, it } from "vitest";
import { medicineReferenceBarcodeConflict } from "./medicine-reference-barcode";

describe("medicine reference barcode", () => {
  it("rejects the official IBU barcode when it differs from the scanned package", () => {
    expect(
      medicineReferenceBarcodeConflict("7798420160383", "7790839980590"),
    ).toBe(true);
  });

  it("accepts the same GTIN with canonical zero padding", () => {
    expect(
      medicineReferenceBarcodeConflict("7793640992769", "07793640992769"),
    ).toBe(false);
  });

  it("allows a name search without a scanned product barcode", () => {
    expect(medicineReferenceBarcodeConflict("", "7790839980590")).toBe(false);
  });
});
