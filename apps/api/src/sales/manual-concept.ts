import { BadRequestException } from "@nestjs/common";
export function manualConcept(line: {
  productId?: string;
  description?: string;
  unitPriceMinor?: number;
  quantity: number;
  discountMinor?: number;
}) {
  if (
    line.productId &&
    line.description === undefined &&
    line.unitPriceMinor === undefined
  )
    return null;
  const description = line.description?.trim();
  if (
    line.productId ||
    !description ||
    description.length < 3 ||
    description.length > 160 ||
    [...description].some((character) => character.charCodeAt(0) < 32) ||
    !Number.isSafeInteger(line.quantity) ||
    line.quantity < 1 ||
    line.quantity > 2147483647 ||
    !Number.isSafeInteger(line.unitPriceMinor) ||
    line.unitPriceMinor! < 1 ||
    line.unitPriceMinor! > 2147483647 ||
    !Number.isSafeInteger(line.discountMinor ?? 0) ||
    (line.discountMinor ?? 0) < 0 ||
    !Number.isSafeInteger(line.unitPriceMinor! * line.quantity) ||
    (line.discountMinor ?? 0) > line.unitPriceMinor! * line.quantity
  )
    throw new BadRequestException(
      "Revisá el concepto: descripción de 3 a 160 caracteres e importe positivo. No admite producto ni lote.",
    );
  return {
    productId: null,
    lotId: null,
    description,
    quantity: line.quantity,
    unitPriceMinor: BigInt(line.unitPriceMinor!),
    discountMinor: BigInt(line.discountMinor ?? 0),
  };
}
