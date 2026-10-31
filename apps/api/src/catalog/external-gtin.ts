import { BadRequestException } from "@nestjs/common";

export function canonicalGtin(code: string): string {
  if (!/^(?:[0-9]{8}|[0-9]{12,14})$/.test(code) || /^0+$/.test(code))
    throw new BadRequestException(
      "El código debe ser un GTIN de 8, 12, 13 o 14 dígitos.",
    );
  const sum = [...code.slice(0, -1)]
    .reverse()
    .reduce(
      (total, digit, index) =>
        total + Number(digit) * (index % 2 === 0 ? 3 : 1),
      0,
    );
  if ((10 - (sum % 10)) % 10 !== Number(code.at(-1)))
    throw new BadRequestException("Dígito de control inválido.");
  const normalized = code.padStart(14, "0");
  if (normalized.startsWith("02") || normalized.startsWith("002"))
    throw new BadRequestException(
      "Código de circulación restringida, no apto para catálogo externo.",
    );
  return normalized;
}
