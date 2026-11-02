import { expect, it } from "vitest";
import type { MedicineReference } from "./api";
import {
  compatibleRetailMedicineReferences,
  retailMedicineNameQuery,
} from "./retail-medicine-link";

const reference = (barcode: string): MedicineReference => ({
  source: "official",
  name: "IBU 400",
  presentation: "20 comprimidos",
  laboratory: "Laboratorio",
  activeIngredient: "ibuprofeno",
  barcode,
  troquel: "",
  priceMinor: null,
  pamiPriceMinor: null,
  updatedAt: null,
  saleType: "",
});

it("never proposes an official link with a different package barcode", () => {
  expect(
    compatibleRetailMedicineReferences("7798420160383", [
      reference("7798420160383"),
      reference("7790839980590"),
      reference(""),
    ]).map((item) => item.barcode),
  ).toEqual(["7798420160383", ""]);
});

it("searches alternative references by medicine name without the package suffix", () => {
  expect(retailMedicineNameQuery("Ibuprofeno 400mg X 20 Comprimidos")).toBe(
    "Ibuprofeno 400mg",
  );
});
