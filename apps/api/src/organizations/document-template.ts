import {
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from "class-validator";
import { Transform } from "class-transformer";

// Comprobante A4 (SISTEMA-17). El ticket térmico usa ticketHeader y no cambia.
export const DEFAULT_DOCUMENT_ACCENT = "#087f70";
export const PRINT_FORMATS = ["TICKET", "A4"] as const;
export type PrintFormat = (typeof PRINT_FORMATS)[number];

// Formato propio de una sucursal; null = el predeterminado de la organización.
export class BranchPrintFormatDto {
  @IsOptional()
  @IsIn(PRINT_FORMATS)
  printFormat?: PrintFormat | null;
}

export const readPrintFormat = (value: unknown): PrintFormat | null =>
  value === "TICKET" || value === "A4" ? value : null;
const FOOTER_MAX_LENGTH = 600;

// Actualización parcial: cada pantalla envía sólo lo que edita y el resto se conserva.
export class DocumentTemplateDto {
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === "string" ? value.trim().toLowerCase() : value,
  )
  @IsString()
  @Matches(/^#[0-9a-f]{6}$/)
  accentColor?: string;
  // Texto libre del pie: se permiten saltos de línea, no otros caracteres de control.
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === "string" ? value.replace(/\r\n?/g, "\n").trim() : value,
  )
  @IsString()
  @MaxLength(FOOTER_MAX_LENGTH)
  @Matches(/^[^\p{Cc}]*(?:\n[^\p{Cc}]*)*$/u)
  footerText?: string;
  // Formato que Ventas ofrece primero al imprimir; el otro sigue disponible.
  @IsOptional()
  @IsIn(PRINT_FORMATS)
  defaultFormat?: PrintFormat;
}

export type DocumentTemplate = {
  accentColor: string;
  footerText: string;
  defaultFormat: PrintFormat;
};

export function readDocumentTemplate(saved: unknown): DocumentTemplate {
  const value =
    saved && typeof saved === "object" && !Array.isArray(saved)
      ? (saved as Record<string, unknown>)
      : {};
  const accent =
    typeof value.accentColor === "string"
      ? value.accentColor.trim().toLowerCase()
      : "";
  return {
    accentColor: /^#[0-9a-f]{6}$/.test(accent)
      ? accent
      : DEFAULT_DOCUMENT_ACCENT,
    footerText:
      typeof value.footerText === "string"
        ? value.footerText.trim().slice(0, FOOTER_MAX_LENGTH)
        : "",
    // Sin configurar se conserva el ticket térmico, como hasta ahora.
    defaultFormat: value.defaultFormat === "A4" ? "A4" : "TICKET",
  };
}
