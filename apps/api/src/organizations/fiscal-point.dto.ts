import { IsBoolean, IsInt, IsUUID, Max, Min } from "class-validator";

export class FiscalPointDto {
  @IsUUID() branchId!: string;
  @IsInt() @Min(1) @Max(99999) number!: number;
}
export class FiscalPointStatusDto {
  @IsBoolean() active!: boolean;
}
