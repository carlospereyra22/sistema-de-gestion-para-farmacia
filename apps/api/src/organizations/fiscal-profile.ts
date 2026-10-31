import { BadRequestException } from "@nestjs/common";
import { IsIn, IsString, Matches, MaxLength } from "class-validator";

export class FiscalProfileDto {
  @IsString() @MaxLength(160) legalName!: string;
  @IsString() @Matches(/^(?:\d{11})?$/) cuit!: string;
  @IsIn(["", "REGISTERED", "MONOTAX", "EXEMPT"]) vatCondition!: string;
  @IsString() @MaxLength(200) address!: string;
  @IsString() @MaxLength(100) city!: string;
  @IsString() @MaxLength(100) province!: string;
  @IsString() @MaxLength(20) postalCode!: string;
  @IsString() @MaxLength(60) grossIncomeId!: string;
  @IsString() @Matches(/^(?:\d{4}-\d{2}-\d{2})?$/) activityStart!: string;
}

export function readFiscalProfile(value: unknown): FiscalProfileDto {
  const source =
    value && typeof value === "object"
      ? (value as Record<string, unknown>)
      : {};
  const string = (key: string) =>
    typeof source[key] === "string" ? source[key].trim() : "";
  return {
    legalName: string("legalName"),
    cuit: string("cuit"),
    vatCondition: string("vatCondition"),
    address: string("address"),
    city: string("city"),
    province: string("province"),
    postalCode: string("postalCode"),
    grossIncomeId: string("grossIncomeId"),
    activityStart: string("activityStart"),
  };
}

export function validateFiscalDraft(data: FiscalProfileDto) {
  if (data.cuit) {
    const weights = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
    const result =
      11 -
      (weights.reduce(
        (sum, weight, i) => sum + Number(data.cuit[i]) * weight,
        0,
      ) %
        11);
    const digit = result === 11 ? 0 : result === 10 ? 9 : result;
    if (!/^\d{11}$/.test(data.cuit) || digit !== Number(data.cuit[10]))
      throw new BadRequestException(
        "Revisá el CUIT: el dígito verificador no es válido.",
      );
  }
  if (
    data.activityStart &&
    (!Number.isFinite(Date.parse(data.activityStart)) ||
      new Date(data.activityStart).toISOString().slice(0, 10) !==
        data.activityStart)
  )
    throw new BadRequestException(
      "La fecha de inicio de actividades no es válida.",
    );
}
