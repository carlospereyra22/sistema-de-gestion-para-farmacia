import { retailerMedicineMatches } from "./retail-medicine-fallback";

describe("retailer medicine fallback", () => {
  it("accepts only the exact valid barcode and does not invent a price or official link", () => {
    expect(
      retailerMedicineMatches("7798420160383", [
        {
          source: "public_farmalife",
          payload: {
            code: "7798420160383",
            name: "Ibu 400 x20",
            presentation: "20 comprimidos",
            brand: "IBU",
          },
        },
        {
          source: "public_farmalife",
          payload: {
            code: "7798420160383",
            name: "Ibu 400 x20",
            presentation: "20 comprimidos",
          },
        },
        {
          source: "public_farmamix",
          payload: { code: "7798420160382", name: "Incorrecto" },
        },
      ]),
    ).toEqual([
      {
        name: "Ibu 400 x20",
        presentation: "20 comprimidos",
        brand: "IBU",
        barcode: "7798420160383",
        source: "public_farmalife",
        sourceRef: "",
        verification: "CHECKSUM_VALID_NOT_PHYSICALLY_VERIFIED",
      },
    ]);
  });
});
