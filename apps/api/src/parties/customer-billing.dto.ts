import {
  IsEmail,
  IsOptional,
  IsString,
  MaxLength,
  ValidateIf,
} from "class-validator";

export class CustomerBillingDto {
  @IsOptional() @IsString() @MaxLength(1000) notes?: string;
  @IsOptional() @IsString() @MaxLength(160) billingName?: string;
  @IsOptional() @IsString() @MaxLength(32) billingTaxId?: string;
  @IsOptional() @IsString() @MaxLength(80) billingVatCondition?: string;
  @IsOptional() @IsString() @MaxLength(200) billingAddress?: string;
  @IsOptional() @IsString() @MaxLength(100) billingCity?: string;
  @IsOptional() @IsString() @MaxLength(100) billingProvince?: string;
  @IsOptional() @IsString() @MaxLength(20) billingPostalCode?: string;
  @IsOptional()
  @ValidateIf((_object, value: unknown) => value !== "")
  @IsEmail()
  @MaxLength(254)
  billingEmail?: string;
  @IsOptional() @IsString() @MaxLength(40) billingPhone?: string;
}

export function billingData(input: CustomerBillingDto) {
  const result: Partial<Record<keyof CustomerBillingDto, string | null>> = {};
  const keys: (keyof CustomerBillingDto)[] = [
    "notes",
    "billingName",
    "billingTaxId",
    "billingVatCondition",
    "billingAddress",
    "billingCity",
    "billingProvince",
    "billingPostalCode",
    "billingEmail",
    "billingPhone",
  ];
  for (const key of keys) {
    if (input[key] !== undefined) result[key] = input[key]?.trim() || null;
  }
  return result;
}

export class UpdateCustomerBillingDto extends CustomerBillingDto {
  @IsOptional() @IsString() priceListId?: string | null;
  @IsOptional() @IsString() @MaxLength(160) name?: string;
}
