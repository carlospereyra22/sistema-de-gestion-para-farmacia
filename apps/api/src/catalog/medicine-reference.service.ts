import {
  BadGatewayException,
  BadRequestException,
  Injectable,
} from "@nestjs/common";
import { canonicalGtin } from "./external-gtin";

type OfficialMedicine = {
  NOMBRE?: unknown;
  PRESENTACION?: unknown;
  LABORATORIO?: unknown;
  DROGA?: unknown;
  C_BARRA?: unknown;
  GTIN1?: unknown;
  TROQUEL?: unknown;
  PRECIO?: unknown;
  PRECIOPAMI?: unknown;
  FECHA?: unknown;
  TIPO_DE_VENTA?: unknown;
  VIGENCIA?: unknown;
  BAJA?: unknown;
  FORMA?: unknown;
  POTENCIA?: unknown;
  UPOTENCIA?: unknown;
};

type MedicineReferenceSource = "official" | "preciosderemedios";

export type MedicineReference = {
  source: MedicineReferenceSource | "alfabeta";
  name: string;
  presentation: string;
  laboratory: string;
  activeIngredient: string;
  barcode: string;
  troquel: string;
  priceMinor: number | null;
  pamiPriceMinor: number | null;
  updatedAt: string | null;
  saleType: string;
  pharmaceuticalForm?: string;
  concentration?: string;
  prescriptionRequired?: boolean;
};

type PriceRemediesCandidate = MedicineReference & { score: number };

const OFFICIAL_MEDICINE_URL = "https://cnpm.msal.gov.ar/api/vademecum";
const PRICE_REMEDIES_URL = "https://preciosderemedios.com.ar/result/";
const REQUEST_TIMEOUT_MS = 7_000;
const MAX_RESULTS = 8;

function normalized(value: unknown): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("es-AR")
    .replace(/\bx\s+(\d+)/g, "x$1")
    .replace(/(\d+)\s+mg\b/g, "$1mg")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeBarcode(value: unknown): string {
  return String(value ?? "")
    .replace(/\D/g, "")
    .trim();
}

function text(value: unknown): string {
  return String(value ?? "").trim();
}

export function parsePriceMinor(value: unknown): number | null {
  if (value === null || value === undefined || String(value).trim() === "")
    return null;
  const cleaned = String(value ?? "")
    .replace(/\s+/g, "")
    .replace(/\$/g, "")
    .replace(/^ars/i, "")
    .replace(/^ar\$/i, "")
    .replace(/\.(?=\d{3}(?:\D|$))/g, "")
    .replace(/,/g, ".");
  const amount = Number(cleaned);
  if (!Number.isFinite(amount) || amount < 0) return null;
  return Math.round(amount * 100);
}

function tokens(value: string): string[] {
  return normalized(value)
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 2);
}

export function buildMedicineSearchQueries(value: string): string[] {
  const original = String(value ?? "").trim();
  const withoutPackage = original
    .replace(/\bx\s*\d+/gi, "")
    .replace(/\s+/g, " ")
    .trim();
  const searchTokens = tokens(withoutPackage);
  const queries = [original, withoutPackage];

  if (searchTokens.length >= 2) queries.push(searchTokens.join(" "));
  for (const [index, token] of searchTokens.entries()) {
    if (token.length >= 5) queries.push(token);
    const nextToken = searchTokens[index + 1];
    if (nextToken) queries.push(`${token} ${nextToken}`);
  }

  return [...new Set(queries.map((query) => query.trim()).filter(Boolean))];
}

function packageQuantity(value: string): number | null {
  const match = normalized(value).match(/(?:\b(?:x|por)\s*)(\d{1,4})\b/);
  if (!match?.[1]) return null;
  const quantity = Number(match[1]);
  return Number.isFinite(quantity) ? quantity : null;
}

function scoreCandidate(candidate: string, query: string): number {
  const candidateText = normalized(candidate);
  const queryText = normalized(query);
  let score = candidateText.includes(queryText) ? 260 : 0;
  score += tokens(query).reduce(
    (total, token) =>
      total + (candidateText.includes(token) ? token.length * 10 : 0),
    0,
  );
  const desiredPackage = packageQuantity(query);
  const currentPackage = packageQuantity(candidate);
  if (desiredPackage && currentPackage) {
    score += desiredPackage === currentPackage ? 420 : -40;
  }
  return score;
}

function mapOfficialMedicine(item: OfficialMedicine): MedicineReference {
  return {
    source: "official",
    name: text(item.NOMBRE),
    presentation: text(item.PRESENTACION),
    laboratory: text(item.LABORATORIO),
    activeIngredient: text(item.DROGA),
    barcode: normalizeBarcode(item.C_BARRA) || normalizeBarcode(item.GTIN1),
    troquel: text(item.TROQUEL),
    priceMinor: parsePriceMinor(item.PRECIO),
    pamiPriceMinor: parsePriceMinor(item.PRECIOPAMI),
    updatedAt: text(item.FECHA) || null,
    saleType: text(item.TIPO_DE_VENTA),
    pharmaceuticalForm: text(item.FORMA),
    concentration:
      item.POTENCIA != null && text(item.POTENCIA) !== ""
        ? [text(item.POTENCIA), text(item.UPOTENCIA)]
            .filter((part) => part && part !== "undefined")
            .join(" ")
        : "",
    prescriptionRequired: text(item.TIPO_DE_VENTA)
      ? /receta/i.test(text(item.TIPO_DE_VENTA))
      : undefined,
  };
}

function decodeHtml(value: string): string {
  return value
    .replace(/<br\s*\/?\s*>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&#(?:x([0-9a-f]+)|([0-9]+));/gi, (_full, hex, decimal) => {
      const codePoint = Number.parseInt(hex ?? decimal, hex ? 16 : 10);
      return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : "";
    })
    .replace(/\s+/g, " ")
    .trim();
}

function extractCell(row: string, className: string): string {
  const pattern = new RegExp(
    `<td\\b[^>]*class=["'][^"']*${className}[^"']*["'][^>]*>([\\s\\S]*?)<\\/td>`,
    "i",
  );
  return (pattern.exec(row)?.[1] ?? "").trim();
}

export function parsePriceRemedies(
  html: string,
  query: string,
): MedicineReference[] {
  const rows =
    html.match(/<tr\b[^>]*data-price=["'][^"']+["'][\s\S]*?<\/tr>/gi) ?? [];
  const candidates: PriceRemediesCandidate[] = [];

  for (const row of rows) {
    const priceMatch = /data-price=["']([^"']+)["']/i.exec(row);
    const productHtml = extractCell(row, "product-text");
    const spans = [...productHtml.matchAll(/<span\b[^>]*>([\s\S]*?)<\/span>/gi)]
      .map((match) => decodeHtml(match[1] ?? ""))
      .filter(Boolean);
    const name = spans[0] ?? decodeHtml(productHtml);
    const presentation = spans.slice(1).join(" ");
    const laboratory = decodeHtml(extractCell(row, "laboratorio-text"));
    const priceMinor = parsePriceMinor(priceMatch?.[1]);
    const score = scoreCandidate(
      [name, presentation, laboratory].filter(Boolean).join(" "),
      query,
    );

    if (!name || priceMinor === null || score <= 0) continue;
    candidates.push({
      source: "preciosderemedios",
      name,
      presentation,
      laboratory,
      activeIngredient: "",
      barcode: "",
      troquel: "",
      priceMinor,
      pamiPriceMinor: null,
      updatedAt: null,
      saleType: "",
      score,
    });
  }

  return candidates
    .sort((first, second) => second.score - first.score)
    .slice(0, MAX_RESULTS)
    .map((candidate) => ({
      source: candidate.source,
      name: candidate.name,
      presentation: candidate.presentation,
      laboratory: candidate.laboratory,
      activeIngredient: candidate.activeIngredient,
      barcode: candidate.barcode,
      troquel: candidate.troquel,
      priceMinor: candidate.priceMinor,
      pamiPriceMinor: candidate.pamiPriceMinor,
      updatedAt: candidate.updatedAt,
      saleType: candidate.saleType,
    }));
}

@Injectable()
export class MedicineReferenceService {
  private barcodeIndex?: {
    expires: number;
    rows: Map<string, MedicineReference[]>;
  };
  private barcodeLoading?: Promise<Map<string, MedicineReference[]>>;

  async byBarcode(code: string): Promise<MedicineReference[]> {
    const canonical = canonicalGtin(code);
    if (this.barcodeIndex && this.barcodeIndex.expires > Date.now())
      return this.barcodeIndex.rows.get(canonical) ?? [];
    this.barcodeLoading ??= this.loadBarcodeIndex().catch(() => {
      throw new BadGatewayException(
        "No se pudo consultar el padrón de medicamentos. Reintentá o usá la carga manual.",
      );
    });
    try {
      return (await this.barcodeLoading).get(canonical) ?? [];
    } finally {
      this.barcodeLoading = undefined;
    }
  }

  private async loadBarcodeIndex(): Promise<Map<string, MedicineReference[]>> {
    // Upstream searches names, not EAN. Index its public wildcard response in
    // memory for 30 minutes; never use a name-only match for automatic linking.
    const response = await fetch(OFFICIAL_MEDICINE_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Origin: "https://www.argentina.gob.ar",
      },
      body: JSON.stringify({ searchdata: "%%%" }),
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok)
      throw new BadGatewayException("El padrón no está disponible.");
    const payload: unknown = await response.json();
    if (!Array.isArray(payload) || !payload.length || payload.length > 100000)
      throw new BadGatewayException(
        "La fuente devolvió un formato no reconocido.",
      );
    const index = new Map<string, Map<string, MedicineReference>>();
    for (const value of payload) {
      if (!value || typeof value !== "object") continue;
      const item = value as OfficialMedicine;
      if (String(item.BAJA) === "1" || String(item.VIGENCIA) === "0") continue;
      const matchingCodes = [item.C_BARRA, item.GTIN1]
        .map((entry) => String(entry ?? "").trim())
        .filter((entry) => {
          try {
            canonicalGtin(entry);
            return true;
          } catch {
            return false;
          }
        });
      for (const matchingCode of matchingCodes) {
        const reference = {
          ...mapOfficialMedicine(item),
          barcode: matchingCode,
        };
        if (!reference.name || !reference.presentation) continue;
        // Retain differing source rows; no name-only or prefix matching for auto-linking.
        const canonical = canonicalGtin(matchingCode);
        const matches =
          index.get(canonical) ?? new Map<string, MedicineReference>();
        matches.set(
          JSON.stringify({ ...reference, barcode: canonical }),
          reference,
        );
        index.set(canonical, matches);
      }
    }
    const rows = new Map(
      [...index].map(([code, matches]) => [code, [...matches.values()]]),
    );
    if (!rows.size)
      throw new BadGatewayException(
        "No se pudieron verificar códigos del padrón.",
      );
    this.barcodeIndex = { rows, expires: Date.now() + 30 * 60 * 1000 };
    return rows;
  }
  async search(
    query: string,
    source: MedicineReferenceSource,
  ): Promise<MedicineReference[]> {
    const searchText = query.trim();
    if (searchText.length < 2) {
      throw new BadRequestException(
        "Ingresá al menos dos caracteres para buscar.",
      );
    }

    if (source === "preciosderemedios") {
      return this.searchPriceRemedies(searchText);
    }
    return this.searchOfficial(searchText);
  }

  private async searchOfficial(query: string): Promise<MedicineReference[]> {
    const references = new Map<string, MedicineReference & { score: number }>();
    let lastError: unknown;

    for (const candidateQuery of buildMedicineSearchQueries(query)) {
      try {
        const payload = await this.requestJson<unknown>(OFFICIAL_MEDICINE_URL, {
          method: "POST",
          headers: {
            Accept: "application/json, text/plain, */*",
            "Content-Type": "application/json",
            Origin: "https://www.argentina.gob.ar",
          },
          body: JSON.stringify({ searchdata: candidateQuery }),
        });
        if (!Array.isArray(payload)) continue;

        for (const item of payload) {
          if (typeof item !== "object" || item === null) continue;
          const reference = mapOfficialMedicine(item as OfficialMedicine);
          const score = scoreCandidate(
            [
              reference.name,
              reference.presentation,
              reference.laboratory,
              reference.activeIngredient,
            ]
              .filter(Boolean)
              .join(" "),
            query,
          );
          if (!reference.name || score <= 0) continue;

          const key = [
            reference.name,
            reference.presentation,
            reference.laboratory,
          ]
            .map(normalized)
            .join("::");
          const existing = references.get(key);
          if (!existing || score > existing.score) {
            references.set(key, { ...reference, score });
          }
        }
      } catch (cause) {
        lastError = cause;
      }
    }

    const sorted = [...references.values()]
      .sort((first, second) => second.score - first.score)
      .slice(0, MAX_RESULTS);
    if (sorted.length) {
      return sorted.map(({ score, ...reference }) => {
        void score;
        return reference;
      });
    }
    if (lastError instanceof Error) throw lastError;
    return [];
  }

  private async searchPriceRemedies(
    query: string,
  ): Promise<MedicineReference[]> {
    const url = new URL(PRICE_REMEDIES_URL);
    url.searchParams.set("busqueda", query);
    const html = await this.requestText(url.toString(), {
      headers: { Accept: "text/html,application/xhtml+xml" },
    });
    return parsePriceRemedies(html, query);
  }

  private async requestJson<T>(url: string, init: RequestInit): Promise<T> {
    const response = await this.request(url, init);
    return (await response.json()) as T;
  }

  private async requestText(url: string, init: RequestInit): Promise<string> {
    const response = await this.request(url, init);
    return response.text();
  }

  private async request(url: string, init: RequestInit): Promise<Response> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch(url, { ...init, signal: controller.signal });
      if (!response.ok) {
        throw new BadGatewayException(
          "La fuente de medicamentos no respondió correctamente.",
        );
      }
      return response;
    } catch (cause) {
      if (cause instanceof BadGatewayException) throw cause;
      throw new BadGatewayException(
        "No se pudo consultar la fuente de medicamentos. Probá de nuevo.",
      );
    } finally {
      clearTimeout(timeout);
    }
  }
}
