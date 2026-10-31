import { BadRequestException } from "@nestjs/common";

export function creditLineAmount(
  unitPrice: bigint,
  discount: bigint,
  sold: number,
  prior: number,
  requested: number,
) {
  if (
    ![sold, prior, requested].every(Number.isSafeInteger) ||
    sold <= 0 ||
    prior < 0 ||
    requested <= 0 ||
    prior + requested > sold ||
    unitPrice < 0n ||
    discount < 0n ||
    discount > unitPrice * BigInt(sold)
  )
    throw new BadRequestException(
      "La cantidad devuelta excede lo vendido o el importe no es válido.",
    );
  const net = unitPrice * BigInt(sold) - discount;
  // Cumulative allocation leaves the final cent on the final returned unit.
  return (
    (net * BigInt(prior + requested)) / BigInt(sold) -
    (net * BigInt(prior)) / BigInt(sold)
  );
}
