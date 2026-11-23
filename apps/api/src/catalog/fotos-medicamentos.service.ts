import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { ExternalCatalogService } from "./external-catalog.service";
import {
  elegirFoto,
  type FotoElegida,
  type ProductoSinFoto,
} from "./fotos-medicamentos";

const CADA_MS = 60 * 60_000;
const PRIMERA_VEZ_MS = 2 * 60_000;
const POR_TANDA = 200;
const TANDAS_POR_PASADA = 50;
const DESDE_EL_PRINCIPIO = "00000000-0000-0000-0000-000000000000";

/** Farmacias habilitadas para el catálogo externo (misma variable que la API). */
export function farmaciasHabilitadas(valor = ""): string[] {
  return valor
    .split(",")
    .map((id) => id.trim())
    .filter((id) =>
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        id,
      ),
    );
}

/**
 * Fotos de medicamentos (SISTEMA-122). Cada hora, sólo en el worker, pone la
 * foto de una tienda argentina en los productos sin foto cuyo código de barras
 * coincide con la base de medicamentos. Nunca reemplaza una foto ni vuelve a
 * poner una que alguien quitó. Una falla acá nunca frena una venta ni un alta.
 */
@Injectable()
export class FotosMedicamentosService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(FotosMedicamentosService.name);
  private timer: NodeJS.Timeout | undefined;

  constructor(
    private readonly prisma: PrismaService,
    private readonly catalogoExterno: ExternalCatalogService,
  ) {}

  onModuleInit() {
    if (process.env.MEDICINE_PHOTOS_SCHEDULER === "off") return;
    this.timer = setTimeout(() => void this.pasada(), PRIMERA_VEZ_MS);
  }

  onModuleDestroy() {
    if (this.timer) clearTimeout(this.timer);
  }

  private async pasada() {
    try {
      let desde = DESDE_EL_PRINCIPIO;
      let total = 0;
      for (let tanda = 0; tanda < TANDAS_POR_PASADA; tanda++) {
        const resultado = await this.completar(desde);
        total += resultado.puestas;
        if (!resultado.siguiente) break;
        desde = resultado.siguiente;
      }
      if (total) this.logger.log(`Fotos de medicamentos puestas: ${total}.`);
    } catch (cause) {
      this.logger.error(
        "No se pudieron completar las fotos de medicamentos.",
        cause instanceof Error ? cause.stack : undefined,
      );
    }
    this.timer = setTimeout(() => void this.pasada(), CADA_MS);
  }

  /**
   * Una tanda de productos a partir de `desde` (por id). Devuelve el último id
   * revisado si quedan más. Público para los tests y para correrlo a mano.
   */
  async completar(
    desde = DESDE_EL_PRINCIPIO,
  ): Promise<{ puestas: number; siguiente: string | null }> {
    const farmacias = farmaciasHabilitadas(
      process.env.EXTERNAL_CATALOG_ORGANIZATION_ID,
    );
    if (!farmacias.length) return { puestas: 0, siguiente: null };
    const productos = await this.productosSinFoto(farmacias, desde);
    if (!productos.length) return { puestas: 0, siguiente: null };
    const elegidas: { producto: ProductoSinFoto; foto: FotoElegida }[] = [];
    const porFarmacia = new Map<string, ProductoSinFoto[]>();
    for (const producto of productos)
      porFarmacia.set(producto.organizationId, [
        ...(porFarmacia.get(producto.organizationId) ?? []),
        producto,
      ]);
    // La consulta al catálogo externo va antes y fuera de la transacción.
    for (const [organizationId, propios] of porFarmacia) {
      let fotos: Awaited<
        ReturnType<ExternalCatalogService["fotosDeMedicamentos"]>
      >;
      try {
        fotos = await this.catalogoExterno.fotosDeMedicamentos(
          organizationId,
          propios.flatMap((producto) => producto.gtins),
        );
      } catch (cause) {
        // Catálogo apagado o sin la vista todavía: se prueba en la próxima pasada.
        this.logger.warn(
          `Sin fotos de medicamentos para ${organizationId}: ${cause instanceof Error ? cause.message : "error"}`,
        );
        continue;
      }
      for (const producto of propios) {
        const foto = elegirFoto(producto, fotos);
        if (foto) elegidas.push({ producto, foto });
      }
    }
    const puestas = elegidas.length ? await this.guardar(elegidas) : 0;
    return {
      puestas,
      siguiente: productos.length === POR_TANDA ? productos.at(-1)!.id : null,
    };
  }

  /**
   * Productos activos, sin foto, que nunca recibieron foto de tienda ni se les
   * quitó una, con un código del envase que está en la base de medicamentos. Si
   * el producto está vinculado, el código tiene que ser de ese mismo medicamento.
   */
  private productosSinFoto(
    farmacias: string[],
    desde: string,
  ): Promise<ProductoSinFoto[]> {
    return this.prisma.$queryRaw<ProductoSinFoto[]>(
      Prisma.sql`SELECT p.id::text AS id, p."organizationId"::text AS "organizationId",
          array_agg(mb.gtin::text ORDER BY pb."primary" DESC, pb.code) AS gtins
        FROM "Product" p
        JOIN "ProductBarcode" pb ON pb."productId" = p.id AND pb.kind = 'PACKAGE' AND pb.code ~ '^[0-9]{8,14}$'
        JOIN "MedicineCatalogBarcode" mb ON mb.gtin = lpad(pb.code, 14, '0')
        WHERE p.id > CAST(${desde} AS uuid)
          AND p."organizationId" = ANY(CAST(${farmacias} AS uuid[]))
          AND p.active
          AND p."fotoTiendaEn" IS NULL
          AND NOT EXISTS (SELECT 1 FROM "ProductImage" i WHERE i."productId" = p.id)
          AND NOT EXISTS (SELECT 1 FROM "AuditLog" a WHERE a."entityType" = 'PRODUCT'
            AND a."entityId" = p.id AND a.action = 'PRODUCT_IMAGE_REMOVED')
          AND (NULLIF(p."externalReferenceBarcode", '') IS NULL OR EXISTS (
            SELECT 1 FROM "MedicineCatalogBarcode" x WHERE x."itemId" = mb."itemId"
              AND (x.barcode = p."externalReferenceBarcode" OR x.gtin = lpad(p."externalReferenceBarcode", 14, '0'))))
        GROUP BY p.id, p."organizationId"
        ORDER BY p.id
        LIMIT ${POR_TANDA}`,
    );
  }

  /** Guarda las fotos. Vuelve a comprobar cada producto con la fila bloqueada. */
  private guardar(
    elegidas: { producto: ProductoSinFoto; foto: FotoElegida }[],
  ): Promise<number> {
    return this.prisma.$transaction(
      async (tx) => {
        let puestas = 0;
        for (const { producto, foto } of elegidas) {
          const libre = await tx.$queryRaw<{ id: string }[]>(
            Prisma.sql`SELECT p.id FROM "Product" p
              WHERE p.id = CAST(${producto.id} AS uuid) AND p."organizationId" = CAST(${producto.organizationId} AS uuid)
                AND p."fotoTiendaEn" IS NULL
                AND NOT EXISTS (SELECT 1 FROM "ProductImage" i WHERE i."productId" = p.id)
              FOR UPDATE OF p`,
          );
          if (!libre.length) continue;
          await tx.productImage.create({
            data: {
              productId: producto.id,
              organizationId: producto.organizationId,
              content: new Uint8Array(foto.content),
            },
          });
          await tx.product.update({
            where: { id: producto.id },
            data: { fotoTiendaEn: new Date() },
          });
          await tx.auditLog.create({
            data: {
              organizationId: producto.organizationId,
              actorId: null,
              entityType: "PRODUCT",
              entityId: producto.id,
              action: "PRODUCT_IMAGE_STORE_SAVED",
              after: {
                gtin14: foto.gtin14,
                source: foto.source,
                sourceRef: foto.sourceRef,
                sha256: foto.sha256,
              },
            },
          });
          puestas++;
        }
        return puestas;
      },
      { timeout: 60_000 },
    );
  }
}
