import { ServiceUnavailableException } from "@nestjs/common";

export function externalCatalogUrl(
  explicit: string | undefined,
  commercial: string | undefined,
): string {
  try {
    const url = new URL(explicit || commercial || "");
    if (
      !["postgresql:", "postgres:"].includes(url.protocol) ||
      !["localhost", "127.0.0.1"].includes(url.hostname) ||
      url.pathname !== (explicit ? "/catalogo_juncos_external" : "/gestion_dev")
    )
      throw new Error("Invalid local database");
    url.pathname = "/catalogo_juncos_external";
    if (!explicit) url.search = "";
    return url.href;
  } catch {
    throw new ServiceUnavailableException(
      "La vista previa requiere la base independiente local.",
    );
  }
}
