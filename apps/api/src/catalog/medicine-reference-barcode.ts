import { BadRequestException } from "@nestjs/common";
import { canonicalGtin } from "./external-gtin";

export function assertMedicineReferenceBarcode(
  productBarcode?: string | null,
  referenceBarcode?: string | null,
): void {
  if (!productBarcode?.trim() || !referenceBarcode?.trim()) return;
  if (
    canonicalGtin(productBarcode.trim()) !==
    canonicalGtin(referenceBarcode.trim())
  )
    throw new BadRequestException(
      "El código de barras del envase no coincide con el de la referencia medicinal. Revisá la presentación o elegí otra fuente.",
    );
}
