import { IsOptional, Matches } from "class-validator";

/** Rango de un historial (SISTEMA-74): fechas civiles AAAA-MM-DD, opcionales. */
export class HistorialQueryDto {
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) desde?: string;
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) hasta?: string;
}
