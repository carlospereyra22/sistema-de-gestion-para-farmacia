import { describe, expect, it } from "vitest";
import {
  barcodeKindOf,
  equivalentBarcodes,
  findProductByBarcode,
  medicinesByName,
  primaryBarcodeOf,
} from "./equivalent-barcodes";

const actron = {
  id: "actron",
  barcodes: [
    { code: "7793640215509", primary: true, kind: "PACKAGE" as const },
    { code: "SG000000000001", primary: false, kind: "INTERNAL" as const },
    { code: "4006381333931", primary: false, kind: "EQUIVALENT" as const },
  ],
};

describe("códigos equivalentes", () => {
  it("lista solo los códigos de envases importados", () => {
    expect(equivalentBarcodes(actron)).toEqual(["4006381333931"]);
  });

  it("encuentra el producto nacional con o sin ceros a la izquierda", () => {
    expect(findProductByBarcode([actron], "07793640215509")?.id).toBe("actron");
    expect(findProductByBarcode([actron], "4006381333931")?.id).toBe("actron");
  });

  it("muestra el código nacional y reconoce el tipo del código escaneado", () => {
    expect(primaryBarcodeOf(actron)).toBe("7793640215509");
    expect(barcodeKindOf(actron, "4006381333931")).toBe("EQUIVALENT");
    expect(barcodeKindOf(actron, "07793640215509")).toBe("PACKAGE");
    expect(barcodeKindOf(actron, "7795378001058")).toBeUndefined();
  });

  it("busca medicamentos del catálogo por nombre sin tildes ni repetidos", () => {
    const product = {
      ...actron,
      name: "ACTRON PEDIÁTRICO",
      presentation: "susp.oral x 100 ml",
      isMedication: true,
    };
    const perfume = { ...product, id: "perfume", isMedication: false };
    expect(
      medicinesByName([product, product, perfume], "actron pediatrico").map(
        (item) => item.id,
      ),
    ).toEqual(["actron"]);
    expect(medicinesByName([product], "a")).toEqual([]);
  });

  it("no busca códigos inválidos ni inexistentes", () => {
    expect(findProductByBarcode([actron], "")).toBeUndefined();
    expect(findProductByBarcode([actron], "7795378001058")).toBeUndefined();
  });
});
