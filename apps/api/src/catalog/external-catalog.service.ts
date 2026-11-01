import {
  Injectable,
  NotFoundException,
  OnModuleDestroy,
  ServiceUnavailableException,
} from "@nestjs/common";
import { Prisma, PrismaClient } from "@prisma/client";
import { canonicalGtin } from "./external-gtin";
import type { CategoryEvidence } from "./category-classification";
import { externalCatalogUrl } from "./external-catalog-url";
import {
  retailerMedicineMatches,
  type RetailMedicineRow,
} from "./retail-medicine-fallback";
type Candidate = {
  code: string;
  gtin14: string;
  name: string;
  brand: string;
  category: string;
  presentation: string;
  source: string;
  source_ref: string;
  license: string;
  verification: string;
  scope_group: string;
  subcategory?: string;
  category_path?: string[];
  source_category_paths?: string[][];
  source_subcategory?: string;
  isMedication?: boolean | null;
  type_review_reason?: string;
  attribute_sources?: Record<string, { source: string; source_ref: string }>;
  argentina_evidence: string;
  fingerprint: string;
  review_reason?: string;
  source_review_reason?: string;
  evidence_count: number;
  sources: string[];
  image?: {
    data_url: string;
    url: string;
    source: string;
    source_ref: string;
    license: string;
    sha256: string;
  };
};

@Injectable()
export class ExternalCatalogService implements OnModuleDestroy {
  private client?: PrismaClient;
  private connection(organizationId: string): PrismaClient {
    const production = process.env.NODE_ENV === "production";
    const enabled = production
      ? process.env.EXTERNAL_CATALOG_ENABLED === "true"
      : process.env.EXTERNAL_CATALOG_PREVIEW === "true";
    if (
      !enabled ||
      !organizationId ||
      process.env.EXTERNAL_CATALOG_ORGANIZATION_ID !== organizationId
    )
      throw new NotFoundException("Catálogo externo desactivado.");
    const raw = externalCatalogUrl(
      process.env.EXTERNAL_CATALOG_DATABASE_URL,
      process.env.DATABASE_URL,
    );
    if (!raw)
      throw new ServiceUnavailableException("Catálogo externo no configurado.");
    let url: URL;
    try {
      url = new URL(raw);
    } catch {
      throw new ServiceUnavailableException(
        "Configuración de catálogo externo inválida.",
      );
    }
    if (
      !["postgresql:", "postgres:"].includes(url.protocol) ||
      !["localhost", "127.0.0.1"].includes(url.hostname) ||
      url.pathname !== "/catalogo_juncos_external"
    )
      throw new ServiceUnavailableException(
        "La vista previa requiere la base independiente local.",
      );
    this.client ??= new PrismaClient({ datasources: { db: { url: raw } } });
    return this.client;
  }

  async lookup(code: string, organizationId = "") {
    const gtin14 = canonicalGtin(code);
    const client = this.connection(organizationId);
    try {
      const groups = await client.$transaction(
        async (tx) => {
          await tx.$executeRaw`SET TRANSACTION READ ONLY`;
          await tx.$executeRaw`SET LOCAL statement_timeout = '3000ms'`;
          const reference = await tx.$queryRaw<{ payload: Candidate }[]>(
            Prisma.sql`SELECT payload FROM reference_catalog.product WHERE eligible AND gtin14=CAST(${gtin14} AS char(14))`,
          );
          const beauty = await tx.$queryRaw<{ payload: Candidate }[]>(
            Prisma.sql`SELECT payload FROM beauty_odbl.product WHERE eligible AND gtin14=CAST(${gtin14} AS char(14))`,
          );
          return { reference, beauty };
        },
        { timeout: 5000 },
      );
      return {
        code,
        gtin14,
        matched: groups.reference.length + groups.beauty.length > 0,
        requiresReview: true,
        automaticSelection: false,
        physicallyVerified: false,
        reference: groups.reference.map((r) => r.payload),
        openBeauty: {
          attribution: "Open Beauty Facts contributors",
          license: "ODbL-1.0",
          licenseUrl: "https://opendatacommons.org/licenses/odbl/1-0/",
          candidates: groups.beauty.map((r) => r.payload),
        },
        truncated: false,
        notice:
          "Candidatos por código exacto. Cotejar nombre, marca y presentación contra el envase. No modifica productos, precios ni stock.",
      };
    } catch {
      throw new ServiceUnavailableException(
        "No se pudo consultar el catálogo externo. La carga manual sigue disponible.",
      );
    }
  }

  async medicineFallback(code: string, organizationId: string) {
    const gtin14 = canonicalGtin(code);
    const rows = await this.connection(organizationId).$transaction(
      async (tx) => {
        await tx.$executeRaw`SET TRANSACTION READ ONLY`;
        await tx.$executeRaw`SET LOCAL statement_timeout = '3000ms'`;
        return tx.$queryRaw<RetailMedicineRow[]>(
          Prisma.sql`SELECT source, payload FROM reference_catalog.medicine_fallback WHERE gtin14=CAST(${gtin14} AS char(14)) ORDER BY observed_at DESC LIMIT 30`,
        );
      },
      { timeout: 5000 },
    );
    return retailerMedicineMatches(code, rows);
  }

  async categoryEvidence(
    code: string,
    organizationId: string,
    source: string,
    fingerprint: string,
  ): Promise<CategoryEvidence[]> {
    const gtin = canonicalGtin(code);
    const table =
      source === "openbeauty"
        ? Prisma.raw("beauty_odbl.product")
        : Prisma.raw("reference_catalog.product");
    return this.connection(organizationId).$transaction(
      async (tx) => {
        await tx.$executeRaw`SET TRANSACTION READ ONLY`;
        await tx.$executeRaw`SET LOCAL statement_timeout = '3000ms'`;
        const rows = await tx.$queryRaw<
          {
            evidence: (CategoryEvidence & { gtin14: string; source: string })[];
          }[]
        >(
          Prisma.sql`SELECT evidence FROM ${table} WHERE eligible AND gtin14=CAST(${gtin} AS char(14)) AND payload->>'source'=${source} AND payload->>'fingerprint'=${fingerprint}`,
        );
        return (rows[0]?.evidence ?? []).filter(
          (row) =>
            row.gtin14 === gtin &&
            (row.source === "openbeauty") === (source === "openbeauty"),
        );
      },
      { timeout: 5000 },
    );
  }

  async onModuleDestroy() {
    await this.client?.$disconnect();
  }
}
