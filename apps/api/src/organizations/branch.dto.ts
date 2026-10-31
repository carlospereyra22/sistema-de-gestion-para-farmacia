import { Transform } from "class-transformer";
import {
  IsBoolean,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from "class-validator";

export class BranchDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === "string" ? value.trim() : value,
  )
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  @Matches(/^[^\p{Cc}]*$/u)
  name!: string;
  @Transform(({ value }: { value: unknown }) =>
    typeof value === "string" ? value.trim().toUpperCase() : value,
  )
  @IsString()
  @Matches(/^[A-Z0-9-]{2,32}$/)
  code!: string;
  @IsOptional()
  @IsString()
  @MaxLength(160)
  @Matches(/^[^\p{Cc}]*$/u)
  address?: string;
  @IsOptional()
  @IsString()
  @MaxLength(100)
  @Matches(/^[^\p{Cc}]*$/u)
  city?: string;
  @IsOptional()
  @IsString()
  @MaxLength(100)
  @Matches(/^[^\p{Cc}]*$/u)
  province?: string;
  @IsOptional()
  @IsString()
  @MaxLength(40)
  @Matches(/^[^\p{Cc}]*$/u)
  phone?: string;
}
export class BranchStatusDto {
  @IsBoolean() active!: boolean;
}
