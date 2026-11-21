import {
  IsOptional,
  IsInt,
  Min,
  Max,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from "class-validator";
import { Transform } from "class-transformer";

/** data: de una imagen PNG, WebP o JPEG en base64. */
export const LOGO_IMAGEN =
  /^data:image\/(?:png|webp|jpeg);base64,[A-Za-z0-9+/]+={0,2}$/;
export const LOGO_IMAGEN_MAXIMO = 90_000;

export class TicketHeaderDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(8)
  printDensity?: number;
  @IsOptional()
  @IsString()
  @Matches(/^(?:[0-9a-f]{4096})?$/)
  logoRaster?: string;
  // El logo original, achicado (SISTEMA-110): se ve con sus colores en la
  // cabecera y la pestaña. El ticket sigue usando logoRaster (blanco y negro).
  @IsOptional()
  @IsString()
  @MaxLength(LOGO_IMAGEN_MAXIMO)
  @Matches(LOGO_IMAGEN)
  logoImage?: string;
  @Transform(({ value }: { value: unknown }) =>
    typeof value === "string" ? value.trim() : value,
  )
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  @Matches(/^[^\p{Cc}]*$/u)
  name!: string;
  @IsString() @MaxLength(160) @Matches(/^[^\p{Cc}]*$/u) address!: string;
  @IsString() @MaxLength(100) @Matches(/^[^\p{Cc}]*$/u) city!: string;
  @IsString() @MaxLength(100) @Matches(/^[^\p{Cc}]*$/u) province!: string;
  @IsString() @MaxLength(32) @Matches(/^[^\p{Cc}]*$/u) taxId!: string;
  @IsString() @MaxLength(40) @Matches(/^[^\p{Cc}]*$/u) phone!: string;
}
export function readTicketHeader(
  organization: { name: string; ticketHeader?: unknown } | null | undefined,
): TicketHeaderDto {
  const saved = organization?.ticketHeader;
  const value =
    saved && typeof saved === "object" && !Array.isArray(saved)
      ? (saved as Record<string, unknown>)
      : {};
  const field = (key: string) =>
    typeof value[key] === "string" ? value[key].trim() : "";
  return {
    printDensity:
      typeof value.printDensity === "number" &&
      Number.isInteger(value.printDensity) &&
      value.printDensity >= 1 &&
      value.printDensity <= 8
        ? value.printDensity
        : 4,
    ...(field("logoRaster") ? { logoRaster: field("logoRaster") } : {}),
    ...(LOGO_IMAGEN.test(field("logoImage")) &&
    field("logoImage").length <= LOGO_IMAGEN_MAXIMO
      ? { logoImage: field("logoImage") }
      : {}),
    name: field("name") || organization?.name || "",
    address: field("address"),
    city: field("city"),
    province: field("province"),
    taxId: field("taxId"),
    phone: field("phone"),
  };
}
export function organizationTicketStore(
  organization: Parameters<typeof readTicketHeader>[0],
) {
  const header = readTicketHeader(organization);
  return {
    printDensity: header.printDensity,
    ...(header.logoRaster ? { logoRaster: header.logoRaster } : {}),
    name: header.name,
    address: [
      header.address,
      [header.city, header.province].filter(Boolean).join(", "),
    ]
      .filter(Boolean)
      .join(" · "),
    contact: [
      header.taxId ? `CUIT ${header.taxId}` : "",
      header.phone ? `Tel. ${header.phone}` : "",
    ]
      .filter(Boolean)
      .join(" · "),
  };
}
