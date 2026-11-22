import { ServiceUnavailableException } from "@nestjs/common";

/**
 * Servidores permitidos para la base independiente. En producción, sólo la
 * propia máquina (los contenedores usan la red del servidor). En la PC, la API
 * corre en Docker y llega a su base por el nombre del servicio, `db`
 * (SISTEMA-112).
 */
export function hostCatalogoPermitido(
  hostname: string,
  production = process.env.NODE_ENV === "production",
): boolean {
  return (
    ["localhost", "127.0.0.1"].includes(hostname) ||
    (!production && hostname === "db")
  );
}

export function externalCatalogUrl(
  explicit: string | undefined,
  commercial: string | undefined,
  production = process.env.NODE_ENV === "production",
): string {
  try {
    const url = new URL(explicit || commercial || "");
    if (
      !["postgresql:", "postgres:"].includes(url.protocol) ||
      !(explicit
        ? hostCatalogoPermitido(url.hostname, production)
        : ["localhost", "127.0.0.1"].includes(url.hostname)) ||
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
