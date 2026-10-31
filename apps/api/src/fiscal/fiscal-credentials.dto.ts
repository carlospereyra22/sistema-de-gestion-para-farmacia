import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
} from "class-validator";
export class PrepareCredentialDto {
  @IsString() @Matches(/^\d{11}$/) holderCuit!: string;
  @IsInt() @Min(0) expectedVersion!: number;
  @IsOptional() @IsBoolean() replace?: boolean;
}
export class UploadCredentialDto extends PrepareCredentialDto {
  @IsString() @MaxLength(24000) certificate!: string;
  @IsOptional() @IsString() @MaxLength(16000) privateKey?: string;
  @IsOptional() @IsString() @MaxLength(256) passphrase?: string;
}
