import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  Logger,
} from "@nestjs/common";
import { ConsultationCache } from "./consultation-cache";

export type AlfaBetaMatch = { id: string; name: string; laboratory: string };
const base = "https://www.alfabeta.net/precio/";
const safeId = /^[a-z0-9][a-z0-9-]{0,180}\.html$/;
// Página guardada en la base de medicamentos; `idL` elige el laboratorio cuando
// dos comparten el nombre.
const safePage = /^[a-z0-9][a-z0-9-]{0,180}\.html(?:\?idL=\d{1,8})?$/;

function searchTokens(value: string): string[] {
  return (
    value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLocaleLowerCase("es-AR")
      .match(/[a-z]+|\d+(?:[.,]\d+)?/g) ?? []
  );
}

export function filterAlfaBetaMatches(
  matches: AlfaBetaMatch[],
  query: string,
): AlfaBetaMatch[] {
  const desired = searchTokens(query);
  if (!desired.length) return [];
  return matches.filter((item) => {
    const words = searchTokens(item.name);
    return desired.every((term) =>
      words.some((word) =>
        /^\d/.test(term) ? word === term : word.includes(term),
      ),
    );
  });
}

function plain(html: string): string {
  const entities: Record<string, string> = {
    amp: "&",
    nbsp: " ",
    quot: '"',
    apos: "'",
    aacute: "á",
    eacute: "é",
    iacute: "í",
    oacute: "ó",
    uacute: "ú",
    ntilde: "ñ",
    uuml: "ü",
  };
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(
      /&(#x[0-9a-f]+|#\d+|[a-z]+);/gi,
      (original: string, entity: string) => {
        if (!entity.startsWith("#")) return entities[entity] ?? original;
        const code = entity.startsWith("#x")
          ? parseInt(entity.slice(2), 16)
          : parseInt(entity.slice(1), 10);
        return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : "";
      },
    )
    .replace(/\s+/g, " ")
    .trim();
}

function cell(html: string, className: string): string {
  return plain(
    new RegExp(
      `<td\\b[^>]*class=["']${className}["'][^>]*>([\\s\\S]*?)<\\/td>`,
      "i",
    ).exec(html)?.[1] ?? "",
  );
}

export function parseAlfaBetaSearch(html: string): AlfaBetaMatch[] {
  const matches: AlfaBetaMatch[] = [];
  const blocks = html
    .split(/(?=<form\b[^>]*name=["']pr\d+["'])/i)
    .filter((block) => /^<form\b[^>]*name=["']pr\d+["']/i.test(block));
  for (const block of blocks) {
    // AlfaBeta pasó de "sertal.html" a "/precio/sertal.html" (19/11/2026):
    // se acepta la ruta propia del sitio, nunca otro dominio.
    const id = (/action=["']([^"']+)["']/i.exec(block)?.[1] ?? "").replace(
      /^(?:https:\/\/www\.alfabeta\.net)?\/precio\//,
      "",
    );
    const name = plain(
      /<a\b[^>]*class=["']rprod["'][^>]*>([\s\S]*?)<\/a>/i.exec(block)?.[1] ??
        "",
    );
    const laboratory = plain(
      /<a\b[^>]*class=["']rlab["'][^>]*>([\s\S]*?)<\/a>/i.exec(block)?.[1] ??
        "",
    );
    if (safeId.test(id) && name && !matches.some((item) => item.id === id))
      matches.push({ id, name, laboratory });
  }
  if (
    !matches.length &&
    !/(?:\b0\s+coincidencias|no se (?:han encontrado|encontraron|hallaron) coincidencias)/i.test(
      plain(html),
    )
  ) {
    throw new BadGatewayException(
      "AlfaBeta devolvió un formato no reconocido. No podemos confirmar los resultados; intentá nuevamente más tarde.",
    );
  }
  return matches;
}

export function parseAlfaBetaDetail(html: string) {
  const name = plain(
    /<span\b[^>]*class=["']tproducto["'][^>]*>([\s\S]*?)<\/span>/i.exec(
      html,
    )?.[1] ?? "",
  );
  const presentations = [
    ...html.matchAll(
      /<tr\b[^>]*>(\s*<td\b[^>]*class=["']tddesc["'][\s\S]*?)<\/tr>/gi,
    ),
  ].map((match) => {
    const row = match[1] ?? "";
    const amount = cell(row, "tdprecio")
      .replace(/[$\s.]/g, "")
      .replace(",", ".");
    const price =
      amount && /^\d+(?:\.\d{1,2})?$/.test(amount)
        ? Math.round(Number(amount) * 100)
        : null;
    return {
      presentation: cell(row, "tddesc"),
      priceMinor: price !== null && Number.isSafeInteger(price) ? price : null,
      updatedAt: cell(row, "tdfecha").replace(/^\(|\)$/g, "") || null,
    };
  });
  if (!name || !presentations.length)
    throw new BadGatewayException(
      "No se pudieron leer las presentaciones de AlfaBeta. Intentá nuevamente más tarde.",
    );
  return { name, presentations };
}

@Injectable()
export class AlfaBetaService {
  // Queda en el registro de la API cuándo y por qué falló AlfaBeta: si cambia
  // su página (como el 19/11/2026) se ve acá antes que en las farmacias.
  private readonly logger = new Logger("AlfaBeta");
  private readonly searches = new ConsultationCache<AlfaBetaMatch[]>();
  private readonly details = new ConsultationCache<
    ReturnType<typeof parseAlfaBetaDetail>
  >();

  async search(query: string) {
    if (query.trim().length < 2 || query.trim().length > 120)
      throw new BadRequestException("Ingresá entre 2 y 120 caracteres.");
    const terms = searchTokens(query);
    if (!terms.length)
      throw new BadRequestException("Ingresá un nombre de medicamento.");
    // Search one meaningful name token upstream; match the complete query here.
    // This also reuses the same cached list for Actron, Actron 400 and Actron 600.
    const anchor = terms.find((term) => /^[a-z]{2,}$/.test(term)) ?? terms[0]!;
    const matches = await this.searches.get(anchor, async () =>
      this.leer(`búsqueda "${anchor}"`, parseAlfaBetaSearch, "srv", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          patron: anchor,
          src: "prs",
          mde: "pat",
        }).toString(),
      }),
    );
    return filterAlfaBetaMatches(matches, query).slice(0, 30);
  }

  async detail(id: string) {
    if (!safeId.test(id))
      throw new BadRequestException("Identificador de medicamento inválido.");
    return this.details.get(id, async () =>
      this.leer(`ficha ${id}`, parseAlfaBetaDetail, id),
    );
  }

  // Lee una página por su link guardado. Sin caché: es para actualizar precios.
  async page(url: string) {
    const path = url.startsWith(base) ? url.slice(base.length) : "";
    if (!safePage.test(path))
      throw new BadRequestException("Link de AlfaBeta inválido.");
    return this.leer(`página ${path}`, parseAlfaBetaDetail, path);
  }

  // Pide y lee una página; si falla, lo deja en el registro con el motivo.
  private async leer<T>(
    que: string,
    leerHtml: (html: string) => T,
    path: string,
    init: RequestInit = {},
  ): Promise<T> {
    try {
      return leerHtml(await this.request(path, init));
    } catch (error) {
      this.logger.warn(
        `No se pudo leer AlfaBeta (${que}): ${error instanceof Error ? error.message : String(error)}`,
      );
      throw error;
    }
  }

  private async request(path: string, init: RequestInit = {}): Promise<string> {
    try {
      const response = await fetch(base + path, {
        ...init,
        redirect: "error",
        signal: AbortSignal.timeout(8000),
      });
      if (!response.ok) throw new Error("Source unavailable");
      const data = await response.arrayBuffer();
      const charset =
        /charset=([\w-]+)/i.exec(
          response.headers.get("content-type") ?? "",
        )?.[1] ?? "utf-8";
      return new TextDecoder(charset).decode(data);
    } catch {
      throw new BadGatewayException(
        "AlfaBeta no está disponible en este momento. Probá nuevamente en unos minutos.",
      );
    }
  }
}
