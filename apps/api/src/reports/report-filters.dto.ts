import { Transform, Type } from "class-transformer";
import {
  ArrayMaxSize,
  IsIn,
  IsInt,
  IsOptional,
  IsUUID,
  Matches,
  Max,
  Min,
} from "class-validator";
import {
  ALL_BRANCHES,
  type ReportComparison,
  type ReportExpiryWindowDays,
  type ReportGranularity,
  type ReportPaymentMethod,
} from "@gestion/contracts";

const CIVIL_DATE = /^\d{4}-\d{2}-\d{2}$/;
const BRANCH = new RegExp(
  `^(${ALL_BRANCHES}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$`,
  "i",
);

/** Acepta `?ids=a,b` y `?ids=a&ids=b`. */
const list = ({ value }: { value: unknown }) =>
  (Array.isArray(value) ? value : [value])
    .flatMap((item) => (typeof item === "string" ? item.split(",") : [item]))
    .map((item) => (typeof item === "string" ? item.trim() : item))
    .filter((item) => item !== "");

/**
 * Filtros comunes de reportes (ver `ReportFilters` en @gestion/contracts).
 * Cada endpoint usa solo los que aplican; las fechas se validan en `parseReportPeriod`.
 */
export class ReportFiltersQuery {
  @IsOptional() @Matches(CIVIL_DATE) from?: string;
  @IsOptional() @Matches(CIVIL_DATE) to?: string;
  /** UUID de sucursal o "all"; sin valor equivale a "all". */
  @IsOptional() @Matches(BRANCH) branchId?: string;
  @IsOptional()
  @IsIn(["previous", "yearAgo", "none"])
  comparison?: ReportComparison;
  @IsOptional()
  @IsIn(["hour", "day", "week", "month"])
  granularity?: ReportGranularity;
  @IsOptional()
  @Transform(list)
  @ArrayMaxSize(50)
  @IsUUID("all", { each: true })
  categoryIds?: string[];
  @IsOptional()
  @Transform(list)
  @ArrayMaxSize(50)
  @IsUUID("all", { each: true })
  laboratoryIds?: string[];
  @IsOptional()
  @Transform(list)
  @ArrayMaxSize(50)
  @IsUUID("all", { each: true })
  supplierIds?: string[];
  @IsOptional()
  @Transform(list)
  @ArrayMaxSize(5)
  @IsIn(["CASH", "CARD", "TRANSFER", "ACCOUNT", "OTHER"], { each: true })
  paymentMethods?: ReportPaymentMethod[];
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100000)
  lowStockThreshold?: number;
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(366)
  staleDays?: number;
  @IsOptional()
  @Type(() => Number)
  @IsIn([30, 60, 90])
  expiryWindowDays?: ReportExpiryWindowDays;
}
