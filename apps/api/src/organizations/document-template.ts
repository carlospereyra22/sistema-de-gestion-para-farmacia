import { IsString, Matches, MaxLength } from "class-validator";
import { Transform } from "class-transformer";

// Comprobante A4 (SISTEMA-17). El ticket térmico usa ticketHeader y no cambia.
export const DEFAULT_DOCUMENT_ACCENT = "#087f70";
const FOOTER_MAX_LENGTH = 600;

export class DocumentTemplateDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === "string" ? value.trim().toLowerCase() : value,
  )
  @IsString()
  @Matches(/^#[0-9a-f]{6}$/)
  accentColor!: string;
  // Texto libre del pie: se permiten saltos de línea, no otros caracteres de control.
  @Transform(({ value }: { value: unknown }) =>
    typeof value === "string" ? value.replace(/\r\n?/g, "\n").trim() : value,
  )
  @IsString()
  @MaxLength(FOOTER_MAX_LENGTH)
  @Matches(/^[^\p{Cc}]*(?:\n[^\p{Cc}]*)*$/u)
  footerText!: string;
}

export type DocumentTemplate = { accentColor: string; footerText: string };

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
  };
}
