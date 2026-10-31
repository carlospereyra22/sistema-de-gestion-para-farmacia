import { BadRequestException } from "@nestjs/common";

export function fractionalPrice(
  base: bigint | null,
  divisor: number,
  markupBps: number,
): bigint {
  if (base === null || base < 0n || base > 999999999999n)
    throw new BadRequestException(
      "Ingresá un precio base válido para fraccionar.",
    );
  if (!Number.isInteger(divisor) || divisor < 1 || divisor > 1000000)
    throw new BadRequestException(
      "Dividir por debe ser un entero entre 1 y 1000000.",
    );
  if (!Number.isInteger(markupBps) || markupBps < 0 || markupBps > 1000000)
    throw new BadRequestException("El recargo debe estar entre 0 y 10000%.");
  const denominator = BigInt(divisor) * 10000n;
  const result =
    (base * (10000n + BigInt(markupBps)) + denominator / 2n) / denominator;
  if (result > 999999999999n)
    throw new BadRequestException(
      "El precio calculado supera el máximo permitido.",
    );
  return result;
}
