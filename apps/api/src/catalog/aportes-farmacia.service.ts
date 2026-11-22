import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from "@nestjs/common";
import { Prisma, PrismaClient } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import {
  ambienteAportes,
  aportesDelProducto,
  rutaDeCategoria,
  type Aporte,
} from "./aportes-farmacia";
import { hostCatalogoPermitido } from "./external-catalog-url";

const CADA_MS = 10 * 60_000;
const PRIMERA_VEZ_MS = 60_000;
const POR_TANDA = 300;
const TANDAS_POR_PASADA = 20;
const DESDE_SIEMPRE = {
  hasta: "1970-01-01 00:00:00+00",
  ultimoId: "00000000-0000-0000-0000-000000000000",
};

type FilaProducto = {
  id: string;
  organizationId: string;
  name: string;
  brand: string | null;
  presentation: string | null;
  isMedication: boolean;
  active: boolean;
  categoryId: string | null;
  cambio: string;
};

/** URL del rol que escribe los aportes; undefined si no está configurada o no es segura. */
export function urlAportes(
  valor = "",
  production = process.env.NODE_ENV === "production",
): string | undefined {
  try {
    const url = new URL(valor);
    return ["postgresql:", "postgres:"].includes(url.protocol) &&
      hostCatalogoPermitido(url.hostname, production) &&
      url.pathname === "/catalogo_juncos_external"
      ? url.href
      : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Aportes de las farmacias al catálogo externo (SISTEMA-112). Cada 10 minutos,
 * sólo en el worker, copia los productos no medicinales con código de barras
 * válido que ninguna tienda tiene. Corre aparte de las ventas y altas: una
 * falla acá nunca frena una operación comercial.
 */
@Injectable()
export class AportesFarmaciaService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AportesFarmaciaService.name);
  private timer: NodeJS.Timeout | undefined;
  private externa: PrismaClient | undefined;

  constructor(private readonly prisma: PrismaService) {}

  onModuleInit() {
    if (process.env.CATALOG_APORTES_SCHEDULER === "off") return;
    const ambiente = ambienteAportes(process.env.CATALOG_APORTES_AMBIENTE);
    const url = urlAportes(process.env.CATALOG_APORTES_DATABASE_URL);
    if (!ambiente || !url) {
      this.logger.warn(
        "Aportes al catálogo externo apagados: faltan CATALOG_APORTES_AMBIENTE o CATALOG_APORTES_DATABASE_URL.",
      );
      return;
    }
    this.externa = new PrismaClient({ datasources: { db: { url } } });
    this.timer = setTimeout(() => void this.pasada(ambiente), PRIMERA_VEZ_MS);
  }

  async onModuleDestroy() {
    if (this.timer) clearTimeout(this.timer);
    await this.externa?.$disconnect();
  }

  private async pasada(ambiente: string) {
    try {
      let total = 0;
      for (let tanda = 0; tanda < TANDAS_POR_PASADA; tanda++) {
        const resultado = await this.recolectar(ambiente);
        total += resultado.aportados;
        if (!resultado.quedanMas) break;
      }
      if (total) this.logger.log(`Aportes al catálogo externo: ${total}.`);
    } catch (cause) {
      this.logger.error(
        "No se pudieron recolectar los aportes al catálogo externo.",
        cause instanceof Error ? cause.stack : undefined,
      );
    }
    this.timer = setTimeout(() => void this.pasada(ambiente), CADA_MS);
  }

  /** Una tanda. Público para los tests y para correrlo a mano. */
  async recolectar(
    ambiente: string,
  ): Promise<{ aportados: number; quedanMas: boolean }> {
    const externa = this.externa;
    if (!externa) return { aportados: 0, quedanMas: false };
    return externa.$transaction(
      async (tx) => {
        // Una sola pasada a la vez por ambiente, aunque haya dos copias.
        const [bloqueo] = await tx.$queryRaw<{ ok: boolean }[]>(
          Prisma.sql`SELECT pg_try_advisory_xact_lock(hashtext(${`aporte_farmacia:${ambiente}`})) AS ok`,
        );
        if (!bloqueo?.ok) return { aportados: 0, quedanMas: false };
        const [marca] = await tx.$queryRaw<
          { hasta: string; ultimo_id: string }[]
        >(
          Prisma.sql`SELECT hasta::text AS hasta, ultimo_id::text AS ultimo_id FROM aporte_farmacia.recoleccion WHERE ambiente=${ambiente} FOR UPDATE`,
        );
        const desde = marca
          ? { hasta: marca.hasta, ultimoId: marca.ultimo_id }
          : DESDE_SIEMPRE;
        const productos = await this.productosCambiados(desde);
        if (!productos.length) return { aportados: 0, quedanMas: false };
        const aportes = await this.armarAportes(productos);
        const yaPublicados = await this.yaPublicados(
          tx,
          aportes.map((aporte) => aporte.gtin14),
        );
        let aportados = 0;
        for (const producto of productos) {
          const propios = aportes.filter(
            (aporte) =>
              aporte.productId === producto.id &&
              !yaPublicados.has(aporte.gtin14),
          );
          await this.reemplazar(tx, ambiente, producto, propios);
          aportados += propios.length;
        }
        const ultimo = productos.at(-1)!;
        await tx.$executeRaw(
          Prisma.sql`INSERT INTO aporte_farmacia.recoleccion (ambiente, hasta, ultimo_id, actualizado)
            VALUES (${ambiente}, CAST(${ultimo.cambio} AS timestamptz), CAST(${ultimo.id} AS uuid), now())
            ON CONFLICT (ambiente) DO UPDATE SET hasta=EXCLUDED.hasta, ultimo_id=EXCLUDED.ultimo_id, actualizado=now()`,
        );
        return { aportados, quedanMas: productos.length === POR_TANDA };
      },
      { timeout: 60_000 },
    );
  }

  /** Productos de todas las farmacias cambiados después de la marca. */
  private productosCambiados(desde: {
    hasta: string;
    ultimoId: string;
  }): Promise<FilaProducto[]> {
    // La fecha viaja como texto para no perder los microsegundos de PostgreSQL.
    return this.prisma.$queryRaw<FilaProducto[]>(
      Prisma.sql`SELECT id, "organizationId", name, brand, presentation, "isMedication", active,
          "categoryId", cambio_ts::text AS cambio
        FROM (
          SELECT p.id::text AS id, p."organizationId"::text AS "organizationId", p.name, p.brand,
            p.presentation, p."isMedication", p.active, p."categoryId"::text AS "categoryId",
            GREATEST(p."updatedAt", COALESCE(i."updatedAt", p."updatedAt"),
              COALESCE((SELECT max(b."createdAt") FROM "ProductBarcode" b WHERE b."productId" = p.id), p."updatedAt")) AS cambio_ts
          FROM "Product" p LEFT JOIN "ProductImage" i ON i."productId" = p.id
        ) t
        WHERE (cambio_ts, id::uuid) > (CAST(${desde.hasta} AS timestamptz), CAST(${desde.ultimoId} AS uuid))
        ORDER BY cambio_ts, id::uuid
        LIMIT ${POR_TANDA}`,
    );
  }

  private async armarAportes(productos: FilaProducto[]): Promise<Aporte[]> {
    const ids = productos.map((producto) => producto.id);
    const organizaciones = [
      ...new Set(productos.map((producto) => producto.organizationId)),
    ];
    const [codigos, fotos, categorias] = await Promise.all([
      this.prisma.productBarcode.findMany({
        where: { productId: { in: ids } },
        select: { productId: true, code: true },
      }),
      this.prisma.productImage.findMany({
        where: { productId: { in: ids } },
        select: { productId: true, content: true },
      }),
      this.prisma.category.findMany({
        where: { organizationId: { in: organizaciones } },
        select: { id: true, name: true, parentId: true },
      }),
    ]);
    const mapaCategorias = new Map(
      categorias.map((categoria) => [categoria.id, categoria]),
    );
    const fotoDe = new Map(fotos.map((foto) => [foto.productId, foto.content]));
    return productos.flatMap((producto) =>
      aportesDelProducto({
        productId: producto.id,
        organizationId: producto.organizationId,
        nombre: producto.name,
        marca: producto.brand,
        presentacion: producto.presentation,
        esMedicamento: producto.isMedication,
        activo: producto.active,
        codigos: codigos
          .filter((codigo) => codigo.productId === producto.id)
          .map((codigo) => codigo.code),
        categoriaRuta: rutaDeCategoria(producto.categoryId, mapaCategorias),
        foto: fotoDe.get(producto.id) ?? null,
      }),
    );
  }

  /** Códigos que ya tiene alguna tienda: no se duplican como aporte. */
  private async yaPublicados(
    tx: Prisma.TransactionClient,
    gtins: string[],
  ): Promise<Set<string>> {
    if (!gtins.length) return new Set();
    const filas = await tx.$queryRaw<{ gtin14: string }[]>(
      Prisma.sql`SELECT gtin14 FROM reference_catalog.product WHERE eligible AND gtin14 = ANY(CAST(${gtins} AS char(14)[]))
        UNION SELECT gtin14 FROM beauty_odbl.product WHERE eligible AND gtin14 = ANY(CAST(${gtins} AS char(14)[]))`,
    );
    return new Set(filas.map((fila) => fila.gtin14.trim()));
  }

  /** Deja vigentes sólo los aportes actuales del producto; el resto se apaga, no se borra. */
  private async reemplazar(
    tx: Prisma.TransactionClient,
    ambiente: string,
    producto: FilaProducto,
    aportes: Aporte[],
  ) {
    const vigentes = aportes.map((aporte) => aporte.gtin14);
    await tx.$executeRaw(
      Prisma.sql`UPDATE aporte_farmacia.producto SET vigente=false, actualizado=now()
        WHERE ambiente=${ambiente} AND organization_id=CAST(${producto.organizationId} AS uuid)
          AND product_id=CAST(${producto.id} AS uuid) AND vigente
          AND NOT (gtin14 = ANY(CAST(${vigentes} AS char(14)[])))`,
    );
    for (const aporte of aportes)
      await tx.$executeRaw(
        Prisma.sql`INSERT INTO aporte_farmacia.producto
            (ambiente, gtin14, organization_id, product_id, nombre, marca, presentacion, categoria_ruta, foto, foto_sha256, vigente, actualizado)
          VALUES (${ambiente}, CAST(${aporte.gtin14} AS char(14)), CAST(${aporte.organizationId} AS uuid),
            CAST(${aporte.productId} AS uuid), ${aporte.nombre}, ${aporte.marca}, ${aporte.presentacion},
            CAST(${aporte.categoriaRuta} AS text[]), ${aporte.foto ? Buffer.from(aporte.foto) : null}, ${aporte.fotoSha256}, true, now())
          ON CONFLICT (ambiente, gtin14, organization_id) DO UPDATE SET
            product_id=EXCLUDED.product_id, nombre=EXCLUDED.nombre, marca=EXCLUDED.marca,
            presentacion=EXCLUDED.presentacion, categoria_ruta=EXCLUDED.categoria_ruta,
            foto=EXCLUDED.foto, foto_sha256=EXCLUDED.foto_sha256, vigente=true, actualizado=now()`,
      );
  }
}
