import { externalGtin } from "./external-product";

// A name and presentation match cannot prove that two different EANs identify
// the same package. Only the exact scanned code may establish that link.
export function medicineReferenceBarcodeConflict(
  productBarcode: string,
  referenceBarcode: string,
): boolean {
  const product = productBarcode.trim();
  const reference = referenceBarcode.trim();
  if (!product || !reference) return false;
  const productGtin = externalGtin(product);
  const referenceGtin = externalGtin(reference);
  return !productGtin || !referenceGtin || productGtin !== referenceGtin;
}

// Código que se copia al formulario al vincular una referencia: el de la
// fuente, si es un EAN válido y no hay otro código cargado.
export function medicineReferenceBarcodeToCopy(
  productBarcode: string,
  referenceBarcode: string,
): string {
  if (productBarcode.trim()) return "";
  const reference = referenceBarcode.trim();
  return externalGtin(reference) ? reference : "";
}
