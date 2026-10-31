import { BadRequestException } from "@nestjs/common";
import {
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  Matches,
} from "class-validator";
import type { SaleFiscalOptions } from "@gestion/contracts";
import { fiscalRecipient } from "./fiscal-recipient";

export class SaleFiscalOptionsDto implements SaleFiscalOptions {
  @IsIn(["FINAL_CONSUMER", "CUSTOMER"])
  recipient!: SaleFiscalOptions["recipient"];
  @IsIn([11]) voucherType!: 11;
  @IsOptional() @IsString() @MaxLength(160) consumerName?: string;
  @IsOptional()
  @IsString()
  @Matches(/^(?:\d{7,8}|\d{11})?$/)
  consumerDocument?: string;
}

export function saleFiscalRecipient(
  customer: Parameters<typeof fiscalRecipient>[0],
  options?: SaleFiscalOptions,
) {
  // Older clients keep their historical customer selection semantics.
  if (!options) return fiscalRecipient(customer);
  if (options.voucherType !== 11)
    throw new BadRequestException("Este circuito admite únicamente factura C.");
  if (options.recipient === "CUSTOMER") {
    if (!customer)
      throw new BadRequestException(
        "Seleccioná un cliente para usar sus datos fiscales.",
      );
    if (options.consumerName || options.consumerDocument)
      throw new BadRequestException(
        "No combines datos de consumidor final con los del cliente.",
      );
    return fiscalRecipient(customer);
  }
  if (options.recipient !== "FINAL_CONSUMER")
    throw new BadRequestException("Elegí un receptor fiscal válido.");
  const name = options.consumerName?.trim() || "Consumidor final";
  const document = options.consumerDocument || "";
  if (name.length > 160 || !/^(?:\d{7,8}|\d{11})?$/.test(document))
    throw new BadRequestException(
      "Revisá el nombre y el DNI o CUIT del consumidor final.",
    );
  return fiscalRecipient({
    name,
    billingName: null,
    billingVatCondition: "Consumidor final",
    billingTaxId: null,
    document,
  });
}
