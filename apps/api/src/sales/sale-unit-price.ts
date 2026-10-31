import { BadRequestException } from "@nestjs/common";

export function saleUnitPrice(
  base: bigint,
  requested: number | undefined,
  expected?: string,
): bigint {
  if (requested === undefined) return base;
  if (expected !== base.toString())
    throw new BadRequestException(
      "El precio cambió. Actualizá los precios y revisá el descuento antes de confirmar.",
    );
  if (
    !Number.isSafeInteger(requested) ||
    requested < 0 ||
    BigInt(requested) > base
  )
    throw new BadRequestException(
      "El precio especial debe estar entre cero y el precio de la lista seleccionada.",
    );
  return BigInt(requested);
}
