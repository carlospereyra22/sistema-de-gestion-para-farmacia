import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { Prisma } from "@prisma/client";
import { categoryPaths, validateCategoryPlacement } from "./category-tree";
import { automaticCategory } from "./automatic-category";
import {
  equivalentCategory,
  classifyCategoryEvidence,
  type CategoryEvidence,
} from "./category-classification";
import { fractionalPrice } from "./fractional-price";
import { withProductBarcode } from "./product-barcode";
import { cambiosDelProducto } from "./producto-sin-conexion";
import { internalBarcode } from "./internal-barcode";
import {
  addEquivalentBarcode,
  removeEquivalentBarcode,
} from "./equivalent-barcode";
import { assertMedicineReferenceBarcode } from "./medicine-reference-barcode";
import {
  branchProductAccess,
  changeBranchProduct,
  type BranchProductChange,
} from "./branch-product-lifecycle";
import { decodeProductImage, saveProductImage } from "./product-image";
import {
  rangoDeParte,
  versionDe,
  versionesDePartes,
} from "./catalogo-por-partes";
import {
  CATEGORY_ICONS,
  CATEGORY_COLORS,
  type CategoryIcon,
  type CategoryColor,
} from "@gestion/contracts";

/** Campos propios del producto que lleva el listado del catálogo. */
const CATALOG_PRODUCT_FIELDS = {
  id: true,
  name: true,
  brand: true,
  isMedication: true,
  categoryId: true,
  laboratoryId: true,
  activeIngredient: true,
  pharmaceuticalForm: true,
  concentration: true,
  presentation: true,
  externalReferenceSource: true,
  externalReferenceName: true,
  externalReferencePresentation: true,
  externalReferenceBarcode: true,
  externalReferencePriceMinor: true,
  priceDivisor: true,
  priceMarkupBps: true,
  priceBaseMinor: true,
  externalReferenceUpdatedAt: true,
  externalReferenceCheckedAt: true,
  saleUnit: true,
  description: true,
  prescriptionRequired: true,
  active: true,
} satisfies Prisma.ProductSelect;

export const DEFAULT_CATALOG_CATEGORIES = [
  "Medicamentos",
  "Dermocosmética",
  "Perfumería",
  "Accesorios",
  "Suplementos",
  "Higiene",
] as const;

@Injectable()
export class CatalogService {
  constructor(private readonly prisma: PrismaService) {}

  async internalBarcode(
    actorId: string,
    organizationId: string,
    productId: string,
    create: boolean,
  ) {
    await this.assert(
      actorId,
      organizationId,
      create ? "CATALOG_MANAGE" : "CATALOG_READ",
    );
    try {
      return await this.prisma.$transaction((tx) =>
        internalBarcode(tx, actorId, organizationId, productId, create),
      );
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      )
        throw new ConflictException(
          "No se pudo asignar un código interno único. Reintentá o contactá al administrador.",
        );
      throw error;
    }
  }

  async addEquivalentBarcode(
    actorId: string,
    organizationId: string,
    productId: string,
    code: string,
  ) {
    await this.assert(actorId, organizationId, "CATALOG_MANAGE");
    try {
      return await this.prisma.$transaction((tx) =>
        addEquivalentBarcode(tx, actorId, organizationId, productId, code),
      );
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      )
        throw new ConflictException(
          `El código ${code.trim()} ya está registrado. Actualizá y volvé a intentarlo.`,
        );
      throw error;
    }
  }

  async removeEquivalentBarcode(
    actorId: string,
    organizationId: string,
    productId: string,
    code: string,
  ) {
    await this.assert(actorId, organizationId, "CATALOG_MANAGE");
    return this.prisma.$transaction((tx) =>
      removeEquivalentBarcode(tx, actorId, organizationId, productId, code),
    );
  }

  async changeBranchProduct(
    actorId: string,
    organizationId: string,
    branchId: string,
    productId: string,
    input: BranchProductChange,
  ) {
    await this.assert(actorId, organizationId, "CATALOG_MANAGE");
    return this.prisma.$transaction(
      (tx) =>
        changeBranchProduct(
          tx,
          actorId,
          organizationId,
          branchId,
          productId,
          input,
        ),
      { timeout: 20000 },
    );
  }

  async list(actorId: string, organizationId: string, branchId?: string) {
    await this.puedeVerCatalogo(actorId, organizationId, branchId);
    const [productos, { categorias, laboratorios }] = await Promise.all([
      this.armarCatalogo(organizationId, branchId),
      this.diccionarioDelCatalogo(organizationId),
    ]);
    const categoria = new Map(categorias.map((c) => [c.id, c]));
    const laboratorio = new Map(laboratorios.map((l) => [l.id, l]));
    return productos.map(({ categoryId, laboratoryId, ...product }) => ({
      ...product,
      category: (categoryId && categoria.get(categoryId)) || null,
      laboratory: (laboratoryId && laboratorio.get(laboratoryId)) || null,
    }));
  }

  private async puedeVerCatalogo(
    actorId: string,
    organizationId: string,
    branchId?: string,
  ) {
    await this.assert(actorId, organizationId, "CATALOG_READ");
    if (branchId)
      await branchProductAccess(this.prisma, actorId, organizationId, branchId);
  }

  /** Categorías (con su ruta) y laboratorios de la organización. */
  private async diccionarioDelCatalogo(organizationId: string) {
    const [categories, laboratories] = await Promise.all([
      this.prisma.category.findMany({
        where: { organizationId },
        select: { id: true, name: true, parentId: true },
        orderBy: { id: "asc" },
      }),
      this.prisma.laboratory.findMany({
        where: { organizationId },
        select: { id: true, name: true },
        orderBy: { id: "asc" },
      }),
    ]);
    const paths = categoryPaths(categories);
    return {
      categorias: categories.map((c) => ({
        id: c.id,
        name: c.name,
        path: paths.get(c.id) ?? c.name,
      })),
      laboratorios: laboratories,
    };
  }

  /**
   * Productos del catálogo, enteros o sólo de algunas partes, con sus códigos,
   * precio general, estado en la sucursal y foto. Categoría y laboratorio van
   * por id: se completan con el diccionario.
   *
   * Catálogo grande (SISTEMA-74): los productos van en una consulta y cada
   * relación en otra, filtrada por organización o sucursal. Pedirlas como
   * relaciones de Prisma arma una lista con un id por producto y, con miles
   * de productos, PostgreSQL la rechaza (límite de parámetros y de pila).
   */
  private async armarCatalogo(
    organizationId: string,
    branchId?: string,
    partes?: string[],
  ) {
    const deLasPartes = partes
      ? { OR: partes.map((parte) => ({ productId: rangoDeParte(parte) })) }
      : {};
    const [products, barcodes, states, images, general] = await Promise.all([
      this.prisma.product.findMany({
        where: {
          organizationId,
          ...(partes
            ? { OR: partes.map((parte) => ({ id: rangoDeParte(parte) })) }
            : {}),
          ...(branchId
            ? { branchStates: { none: { branchId, status: "DELETED" } } }
            : { active: true }),
        },
        select: CATALOG_PRODUCT_FIELDS,
        orderBy: { name: "asc" },
      }),
      this.prisma.productBarcode.findMany({
        where: { organizationId, ...deLasPartes },
        select: { productId: true, code: true, primary: true, kind: true },
        orderBy: { createdAt: "asc" },
      }),
      branchId
        ? this.prisma.productBranchState.findMany({
            where: { organizationId, branchId, ...deLasPartes },
            select: { productId: true, status: true, updatedAt: true },
          })
        : Promise.resolve([]),
      this.prisma.productImage.findMany({
        where: { organizationId, ...deLasPartes },
        select: { productId: true, updatedAt: true },
      }),
      this.prisma.priceList.findFirst({
        where: { organizationId, name: "Precio general", active: true },
        select: { id: true },
      }),
    ]);
    const prices = general
      ? await this.prisma.productPrice.findMany({
          where: { priceListId: general.id, ...deLasPartes },
          select: { productId: true, amountMinor: true },
        })
      : [];
    const codigos = new Map<
      string,
      {
        code: string;
        primary: boolean;
        kind: (typeof barcodes)[number]["kind"];
      }[]
    >();
    for (const { productId, ...codigo } of barcodes) {
      const lista = codigos.get(productId);
      if (lista) lista.push(codigo);
      else codigos.set(productId, [codigo]);
    }
    const precios = new Map(prices.map((p) => [p.productId, p.amountMinor]));
    const estados = new Map(states.map((s) => [s.productId, s]));
    const fotos = new Map(images.map((i) => [i.productId, i.updatedAt]));
    return products.map((product) => {
      const estado = estados.get(product.id);
      const precio = precios.get(product.id);
      const foto = fotos.get(product.id);
      return {
        ...product,
        image: foto ? { updatedAt: foto } : null,
        barcodes: codigos.get(product.id) ?? [],
        branchStates: estado
          ? [{ status: estado.status, updatedAt: estado.updatedAt }]
          : [],
        branchStateUpdatedAt: estado?.updatedAt.toISOString() ?? null,
        branchStatus:
          estado?.status ?? (product.active ? "ACTIVE" : "ARCHIVED"),
        active: product.active && (!estado || estado.status === "ACTIVE"),
        priceBaseMinor: product.priceBaseMinor?.toString() ?? null,
        externalReferencePriceMinor:
          product.externalReferencePriceMinor?.toString() ?? null,
        prices:
          precio === undefined ? [] : [{ amountMinor: precio.toString() }],
      };
    });
  }

  /**
   * Versión de cada parte del catálogo y, si cambió respecto del que tiene la
   * PC, el diccionario de categorías y laboratorios (SISTEMA-74). Con esto la
   * PC sabe qué partes volver a pedir.
   */
  async catalogVersions(
    actorId: string,
    organizationId: string,
    branchId?: string,
    diccionarioDeLaPc?: string,
  ) {
    await this.puedeVerCatalogo(actorId, organizationId, branchId);
    const general = await this.prisma.priceList.findFirst({
      where: { organizationId, name: "Precio general", active: true },
      select: { id: true },
    });
    type Fila = { parte: string; huella: string };
    const huella = (consulta: Prisma.Sql) =>
      this.prisma.$queryRaw<Fila[]>(consulta);
    const [productos, codigos, precios, estados, fotos, diccionario] =
      await Promise.all([
        huella(Prisma.sql`
          SELECT left(id::text, 2) AS parte,
            md5(string_agg(id::text || ':' || "active"::text || ':' || "updatedAt"::text, ',' ORDER BY id)) AS huella
          FROM "Product" WHERE "organizationId" = ${organizationId}::uuid
          GROUP BY 1`),
        huella(Prisma.sql`
          SELECT left("productId"::text, 2) AS parte,
            md5(string_agg("productId"::text || ':' || code || ':' || "primary"::text || ':' || kind::text, ',' ORDER BY "productId", code)) AS huella
          FROM "ProductBarcode" WHERE "organizationId" = ${organizationId}::uuid
          GROUP BY 1`),
        general
          ? huella(Prisma.sql`
              SELECT left("productId"::text, 2) AS parte,
                md5(string_agg("productId"::text || ':' || "amountMinor"::text || ':' || "updatedAt"::text, ',' ORDER BY "productId")) AS huella
              FROM "ProductPrice" WHERE "priceListId" = ${general.id}::uuid
              GROUP BY 1`)
          : Promise.resolve([]),
        branchId
          ? huella(Prisma.sql`
              SELECT left("productId"::text, 2) AS parte,
                md5(string_agg("productId"::text || ':' || status || ':' || "updatedAt"::text, ',' ORDER BY "productId")) AS huella
              FROM "ProductBranchState"
              WHERE "organizationId" = ${organizationId}::uuid AND "branchId" = ${branchId}::uuid
              GROUP BY 1`)
          : Promise.resolve([]),
        huella(Prisma.sql`
          SELECT left("productId"::text, 2) AS parte,
            md5(string_agg("productId"::text || ':' || "updatedAt"::text, ',' ORDER BY "productId")) AS huella
          FROM "ProductImage" WHERE "organizationId" = ${organizationId}::uuid
          GROUP BY 1`),
        this.diccionarioDelCatalogo(organizationId),
      ]);
    const versionDiccionario = versionDe(diccionario);
    return {
      partes: versionesDePartes(
        { productos, codigos, precios, estados, fotos },
        `${general?.id ?? "sin-general"}|${branchId ?? "organizacion"}`,
      ),
      diccionario:
        diccionarioDeLaPc === versionDiccionario
          ? { version: versionDiccionario }
          : { version: versionDiccionario, ...diccionario },
    };
  }

  /**
   * Productos de algunas partes del catálogo, con su versión al momento de
   * pedirlos (SISTEMA-74). Si algo cambia en el medio, la PC la vuelve a
   * pedir en la próxima actualización.
   */
  async catalogParts(
    actorId: string,
    organizationId: string,
    branchId: string | undefined,
    partes: string[],
  ) {
    const { partes: versiones } = await this.catalogVersions(
      actorId,
      organizationId,
      branchId,
      "no-hace-falta-el-diccionario",
    );
    const productos = await this.armarCatalogo(
      organizationId,
      branchId,
      partes,
    );
    return {
      versiones: Object.fromEntries(
        partes.map((parte) => [parte, versiones[parte] ?? null]),
      ),
      productos,
    };
  }

  async productImage(
    actorId: string,
    organizationId: string,
    productId: string,
  ) {
    await this.assert(actorId, organizationId, "CATALOG_READ");
    const image = await this.prisma.productImage.findFirst({
      where: { productId, organizationId, product: { organizationId } },
      select: { content: true },
    });
    if (!image)
      throw new NotFoundException("El producto no tiene una foto disponible.");
    return {
      dataUrl: `data:image/jpeg;base64,${Buffer.from(image.content).toString("base64")}`,
    };
  }

  async options(actorId: string, organizationId: string) {
    await this.assert(actorId, organizationId, "CATALOG_READ");
    const [categories, laboratories] = await this.prisma.$transaction([
      this.prisma.category.findMany({
        where: { organizationId, active: true },
        select: {
          id: true,
          name: true,
          icon: true,
          color: true,
          parentId: true,
          _count: { select: { products: true } },
        },
        orderBy: { name: "asc" },
      }),
      this.prisma.laboratory.findMany({
        where: { organizationId, active: true },
        select: {
          id: true,
          name: true,
          logoUpdatedAt: true,
          _count: { select: { products: true } },
        },
        orderBy: { name: "asc" },
      }),
    ]);
    return { categories, laboratories };
  }

  async laboratoryLogo(actorId: string, organizationId: string, id: string) {
    await this.assert(actorId, organizationId, "CATALOG_READ");
    const item = await this.prisma.laboratory.findFirst({
      where: { id, organizationId, active: true },
      select: { logo: true },
    });
    if (!item?.logo)
      throw new NotFoundException(
        "El laboratorio no tiene un logo disponible.",
      );
    return {
      dataUrl: `data:image/jpeg;base64,${Buffer.from(item.logo).toString("base64")}`,
    };
  }

  async saveLaboratoryLogo(
    actorId: string,
    organizationId: string,
    id: string,
    dataUrl: string | null,
  ) {
    await this.assert(actorId, organizationId, "CATALOG_MANAGE");
    const content =
      dataUrl === null ? null : new Uint8Array(decodeProductImage(dataUrl));
    return this.prisma.$transaction(
      async (tx) => {
        const item = await tx.laboratory.findFirst({
          where: { id, organizationId, active: true },
          select: { id: true },
        });
        if (!item)
          throw new NotFoundException("El laboratorio no está disponible.");
        const result = await tx.laboratory.update({
          where: { id },
          data: {
            logo: content,
            logoUpdatedAt: content === null ? null : new Date(),
          },
          select: { id: true, logoUpdatedAt: true },
        });
        await tx.auditLog.create({
          data: {
            actorId,
            organizationId,
            entityType: "LABORATORY",
            entityId: id,
            action: content === null ? "LOGO_REMOVED" : "LOGO_SAVED",
          },
        });
        return result;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  async ensureDefaultCategories(actorId: string, organizationId: string) {
    await this.assert(actorId, organizationId, "CATALOG_MANAGE");
    // Initialize once, including archived records, so edits/deletions stay intact.
    const existing = await this.prisma.category.findMany({
      where: { organizationId },
      select: { id: true, name: true, active: true },
    });
    if (existing.length)
      return {
        categories: existing
          .filter((item) => item.active)
          .map(({ id, name }) => ({ id, name })),
      };
    const categories = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${organizationId}, 146))`;
      const current = await tx.category.findMany({
        where: { organizationId },
        select: { id: true, name: true, active: true },
      });
      if (current.length)
        return current
          .filter((item) => item.active)
          .map(({ id, name }) => ({ id, name }));
      return Promise.all(
        DEFAULT_CATALOG_CATEGORIES.map((name) =>
          tx.category.create({
            data: { organizationId, name },
            select: { id: true, name: true },
          }),
        ),
      );
    });
    return { categories };
  }
  async priceLists(actorId: string, organizationId: string) {
    await this.assert(actorId, organizationId, "CATALOG_READ");
    const lists = await this.prisma.priceList.findMany({
      where: { organizationId, active: true },
      include: { prices: true },
      orderBy: { name: "asc" },
    });
    return lists.map((list) => ({
      ...list,
      prices: list.prices.map((price) => ({
        productId: price.productId,
        amountMinor: price.amountMinor.toString(),
      })),
    }));
  }
  async createPriceList(
    actorId: string,
    organizationId: string,
    name: string,
    includeAll = false,
  ) {
    await this.assert(actorId, organizationId, "CATALOG_MANAGE");
    if (name.trim().toLocaleLowerCase() === "precio general")
      throw new BadRequestException(
        "Ese nombre está reservado para la lista protegida.",
      );
    if (name.trim().length < 2)
      throw new BadRequestException(
        "Ingresá un nombre de al menos dos caracteres.",
      );
    try {
      return await this.prisma.$transaction(
        async (tx) => {
          const list = await tx.priceList.create({
            data: { organizationId, name: name.trim() },
          });
          if (includeAll) {
            const products = await tx.product.findMany({
              where: { organizationId, active: true },
              select: {
                id: true,
                prices: {
                  where: {
                    priceList: {
                      organizationId,
                      name: "Precio general",
                      active: true,
                    },
                  },
                },
              },
            });
            if (products.some((product) => !product.prices[0]))
              throw new BadRequestException(
                "Hay productos sin precio general. Completá sus precios desde Productos antes de crear una lista completa.",
              );
            if (products.length)
              await tx.productPrice.createMany({
                data: products.map((product) => ({
                  productId: product.id,
                  priceListId: list.id,
                  amountMinor: product.prices[0]!.amountMinor,
                })),
              });
          }
          await tx.auditLog.create({
            data: {
              actorId,
              organizationId,
              entityType: "PRICE_LIST",
              entityId: list.id,
              action: "PRICE_LIST_CREATED",
              after: { name: list.name, includeAll },
            },
          });
          return list;
        },
        { timeout: 60000 },
      );
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      )
        throw new ConflictException("Ya existe una lista con ese nombre.");
      throw error;
    }
  }
  async renamePriceList(
    actorId: string,
    organizationId: string,
    listId: string,
    name: string,
    fallbackPriceListId?: string | null,
  ) {
    await this.assert(actorId, organizationId, "CATALOG_MANAGE");
    const trimmed = name.trim();
    if (
      trimmed.length < 2 ||
      trimmed.length > 120 ||
      trimmed.toLocaleLowerCase() === "precio general"
    )
      throw new BadRequestException(
        "Ingresá un nombre de 2 a 120 caracteres distinto de Precio general.",
      );
    try {
      return await this.prisma.$transaction(async (tx) => {
        const list = await tx.priceList.findFirst({
          where: { id: listId, organizationId, active: true },
        });
        if (!list) throw new NotFoundException("Lista no encontrada.");
        if (list.name === "Precio general")
          throw new BadRequestException("Precio general está protegido.");
        if (fallbackPriceListId === listId)
          throw new BadRequestException(
            "La lista de respaldo debe ser otra lista.",
          );
        if (fallbackPriceListId) {
          const fallback = await tx.priceList.findFirst({
            where: { id: fallbackPriceListId, organizationId, active: true },
          });
          if (!fallback)
            throw new BadRequestException(
              "La lista de respaldo no está disponible en esta organización.",
            );
          if (fallback.name === "Precio general") fallbackPriceListId = null;
        }
        const updated = await tx.priceList.update({
          where: { id: list.id },
          data: {
            name: trimmed,
            ...(fallbackPriceListId !== undefined
              ? { fallbackPriceListId }
              : {}),
          },
        });
        await tx.auditLog.create({
          data: {
            actorId,
            organizationId,
            entityType: "PRICE_LIST",
            entityId: list.id,
            action:
              fallbackPriceListId === undefined
                ? "PRICE_LIST_RENAMED"
                : "PRICE_LIST_UPDATED",
            before: {
              name: list.name,
              ...(fallbackPriceListId !== undefined
                ? { fallbackPriceListId: list.fallbackPriceListId ?? null }
                : {}),
            },
            after: {
              name: trimmed,
              ...(fallbackPriceListId !== undefined
                ? { fallbackPriceListId }
                : {}),
            },
          },
        });
        return updated;
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      )
        throw new ConflictException("Ya existe una lista con ese nombre.");
      throw error;
    }
  }
  async setPrice(
    actorId: string,
    organizationId: string,
    priceListId: string,
    productId: string,
    amountMinor: number,
  ) {
    await this.assert(actorId, organizationId, "CATALOG_MANAGE");
    const [list, product] = await Promise.all([
      this.prisma.priceList.findFirst({
        where: { id: priceListId, organizationId, active: true },
      }),
      this.prisma.product.findFirst({
        where: { id: productId, organizationId, active: true },
      }),
    ]);
    if (!list || !product)
      throw new NotFoundException("Price list or product is unavailable.");
    if (list.name === "Precio general")
      throw new BadRequestException("Precio general es de solo lectura.");
    return this.prisma.productPrice.upsert({
      where: { productId_priceListId: { productId, priceListId } },
      update: { amountMinor: BigInt(amountMinor) },
      create: { productId, priceListId, amountMinor: BigInt(amountMinor) },
    });
  }
  async updateProductStatus(
    actorId: string,
    organizationId: string,
    productId: string,
    active: boolean,
  ) {
    await this.assert(actorId, organizationId, "CATALOG_MANAGE");
    const product = await this.prisma.product.findFirst({
      where: { id: productId, organizationId },
    });
    if (!product) throw new NotFoundException("Product is unavailable.");
    return this.prisma.product.update({
      where: { id: productId },
      data: { active },
      select: { id: true, active: true },
    });
  }

  async updateProduct(
    actorId: string,
    organizationId: string,
    productId: string,
    input: {
      generateInternalBarcode?: boolean;
      brand?: string | null;
      isMedication?: boolean;
      priceDivisor?: number | null;
      priceMarkupBps?: number;
      priceBaseMinor?: number | null;
      name?: string;
      imageDataUrl?: string | null;
      categoryId?: string | null;
      laboratoryId?: string | null;
      barcode?: string;
      priceMinor?: number;
      activeIngredient?: string;
      pharmaceuticalForm?: string;
      concentration?: string;
      presentation?: string;
      externalReferenceSource?:
        "official" | "preciosderemedios" | "alfabeta" | null;
      externalReferenceName?: string | null;
      externalReferencePresentation?: string | null;
      externalReferenceBarcode?: string | null;
      externalReferencePriceMinor?: number | null;
      saleUnit?: "BOX" | "BLISTER" | "UNIT";
      description?: string;
      prescriptionRequired?: boolean;
    },
  ) {
    await this.assert(actorId, organizationId, "CATALOG_MANAGE");
    const imageContent = await this.prepararEdicion(
      this.prisma,
      organizationId,
      productId,
      input,
    );
    await withProductBarcode(
      this.prisma,
      organizationId,
      productId,
      input.barcode,
      () =>
        this.prisma.$transaction((tx) =>
          this.editarEnTx(
            tx,
            actorId,
            organizationId,
            productId,
            input,
            imageContent,
          ),
        ),
    );
    return { id: productId };
  }

  /** Validaciones de la edición, antes de la transacción (SISTEMA-79). */
  async prepararEdicion(
    db: Pick<Prisma.TransactionClient, "product" | "category" | "laboratory">,
    organizationId: string,
    productId: string,
    input: {
      generateInternalBarcode?: boolean;
      brand?: string | null;
      isMedication?: boolean;
      priceDivisor?: number | null;
      priceMarkupBps?: number;
      priceBaseMinor?: number | null;
      name?: string;
      imageDataUrl?: string | null;
      categoryId?: string | null;
      laboratoryId?: string | null;
      barcode?: string;
      priceMinor?: number;
      activeIngredient?: string;
      pharmaceuticalForm?: string;
      concentration?: string;
      presentation?: string;
      externalReferenceSource?:
        "official" | "preciosderemedios" | "alfabeta" | null;
      externalReferenceName?: string | null;
      externalReferencePresentation?: string | null;
      externalReferenceBarcode?: string | null;
      externalReferencePriceMinor?: number | null;
      saleUnit?: "BOX" | "BLISTER" | "UNIT";
      description?: string;
      prescriptionRequired?: boolean;
    },
  ) {
    const product = await db.product.findFirst({
      where: { id: productId, organizationId },
    });
    if (!product) throw new NotFoundException("Product is unavailable.");
    const [category, laboratory] = await Promise.all([
      input.categoryId
        ? db.category.findFirst({
            where: { id: input.categoryId, organizationId, active: true },
          })
        : undefined,
      input.laboratoryId
        ? db.laboratory.findFirst({
            where: { id: input.laboratoryId, organizationId, active: true },
          })
        : undefined,
    ]);
    if (input.categoryId && !category)
      throw new NotFoundException("Category is unavailable.");
    if (input.laboratoryId && !laboratory)
      throw new NotFoundException("Laboratory is unavailable.");

    const imageContent =
      input.imageDataUrl === undefined
        ? undefined
        : input.imageDataUrl === null
          ? null
          : decodeProductImage(input.imageDataUrl);
    return imageContent;
  }

  /** La edición dentro de una transacción (también la hecha sin conexión). */
  async editarEnTx(
    tx: Prisma.TransactionClient,
    actorId: string,
    organizationId: string,
    productId: string,
    input: {
      generateInternalBarcode?: boolean;
      brand?: string | null;
      isMedication?: boolean;
      priceDivisor?: number | null;
      priceMarkupBps?: number;
      priceBaseMinor?: number | null;
      name?: string;
      imageDataUrl?: string | null;
      categoryId?: string | null;
      laboratoryId?: string | null;
      barcode?: string;
      priceMinor?: number;
      activeIngredient?: string;
      pharmaceuticalForm?: string;
      concentration?: string;
      presentation?: string;
      externalReferenceSource?:
        "official" | "preciosderemedios" | "alfabeta" | null;
      externalReferenceName?: string | null;
      externalReferencePresentation?: string | null;
      externalReferenceBarcode?: string | null;
      externalReferencePriceMinor?: number | null;
      saleUnit?: "BOX" | "BLISTER" | "UNIT";
      description?: string;
      prescriptionRequired?: boolean;
    },
    imageContent: Awaited<ReturnType<CatalogService["prepararEdicion"]>>,
    /** Hora real y PC de una edición sin conexión, para la auditoría. */
    marca: Record<string, string> = {},
  ) {
    await tx.$queryRaw`SELECT id FROM "Product" WHERE id = ${productId}::uuid AND "organizationId" = ${organizationId}::uuid FOR UPDATE`;
    const beforeProduct = await tx.product.findFirstOrThrow({
      where: { id: productId, organizationId },
    });
    const [codigoAntes, precioAntes] = await Promise.all([
      primaryCode(tx, productId),
      generalPrice(tx, organizationId, productId),
    ]);
    const isMedication =
      input.isMedication ??
      beforeProduct.isMedication ??
      Boolean(beforeProduct.externalReferenceSource);
    if (
      !isMedication &&
      (input.externalReferenceSource || input.prescriptionRequired)
    )
      throw new BadRequestException(
        "Activá Es medicamento antes de vincular una referencia medicinal o indicar receta.",
      );
    if (isMedication && input.externalReferenceSource)
      assertMedicineReferenceBarcode(
        input.barcode,
        input.externalReferenceBarcode,
      );
    if (!isMedication)
      input = {
        ...input,
        prescriptionRequired: false,
        externalReferenceSource: null,
        externalReferenceName: null,
        externalReferencePresentation: null,
        externalReferenceBarcode: null,
        externalReferencePriceMinor: null,
        ...(beforeProduct.externalReferenceSource &&
        beforeProduct.priceDivisor &&
        input.priceBaseMinor == null
          ? {
              priceBaseMinor: Number(
                beforeProduct.externalReferencePriceMinor ??
                  beforeProduct.priceBaseMinor ??
                  0,
              ),
            }
          : {}),
      };
    await saveProductImage(
      tx,
      organizationId,
      productId,
      actorId,
      imageContent,
    );
    const updatedProduct = await tx.product.update({
      where: { id: productId },
      data: {
        isMedication,
        ...(input.brand !== undefined
          ? { brand: input.brand?.trim().replace(/\s+/g, " ") || null }
          : {}),
        ...(!isMedication
          ? {
              externalReferenceUpdatedAt: null,
              externalReferenceCheckedAt: null,
            }
          : {}),
        priceDivisor: input.priceDivisor,
        priceMarkupBps: input.priceDivisor === null ? 0 : input.priceMarkupBps,
        priceBaseMinor:
          input.priceDivisor === null
            ? null
            : input.priceBaseMinor === undefined
              ? undefined
              : input.priceBaseMinor === null
                ? null
                : BigInt(input.priceBaseMinor),
        ...(input.name !== undefined ? { name: input.name.trim() } : {}),
        ...(input.categoryId !== undefined
          ? { categoryId: input.categoryId }
          : {}),
        ...(input.laboratoryId !== undefined
          ? { laboratoryId: input.laboratoryId }
          : {}),
        ...(input.activeIngredient !== undefined
          ? { activeIngredient: input.activeIngredient.trim() || null }
          : {}),
        ...(input.pharmaceuticalForm !== undefined
          ? {
              pharmaceuticalForm: input.pharmaceuticalForm.trim() || null,
            }
          : {}),
        ...(input.concentration !== undefined
          ? { concentration: input.concentration.trim() || null }
          : {}),
        ...(input.presentation !== undefined
          ? { presentation: input.presentation.trim() || null }
          : {}),
        ...(input.externalReferenceSource !== undefined
          ? { externalReferenceSource: input.externalReferenceSource }
          : {}),
        ...(input.externalReferenceName !== undefined
          ? {
              externalReferenceName:
                input.externalReferenceName?.trim() || null,
            }
          : {}),
        ...(input.externalReferencePresentation !== undefined
          ? {
              externalReferencePresentation:
                input.externalReferencePresentation?.trim() || null,
            }
          : {}),
        ...(input.externalReferenceBarcode !== undefined
          ? {
              externalReferenceBarcode:
                input.externalReferenceBarcode?.trim() || null,
            }
          : {}),
        ...(input.externalReferencePriceMinor !== undefined
          ? {
              externalReferencePriceMinor:
                input.externalReferencePriceMinor === null
                  ? null
                  : BigInt(input.externalReferencePriceMinor),
              externalReferenceCheckedAt: isMedication ? new Date() : null,
            }
          : {}),
        ...(input.saleUnit !== undefined ? { saleUnit: input.saleUnit } : {}),
        ...(input.description !== undefined
          ? { description: input.description.trim() || null }
          : {}),
        ...(input.prescriptionRequired !== undefined
          ? { prescriptionRequired: input.prescriptionRequired }
          : {}),
      },
    });
    if (input.barcode !== undefined) {
      const primaryBarcode = await tx.productBarcode.findFirst({
        where: { productId, primary: true },
      });
      if (input.barcode.trim()) {
        if (primaryBarcode) {
          await tx.productBarcode.update({
            where: { id: primaryBarcode.id },
            data: { code: input.barcode.trim() },
          });
        } else {
          await tx.productBarcode.create({
            data: {
              organizationId,
              productId,
              code: input.barcode.trim(),
              primary: true,
            },
          });
        }
      } else if (primaryBarcode) {
        await tx.productBarcode.delete({
          where: { id: primaryBarcode.id },
        });
      }
    }
    if (input.isMedication !== undefined || input.brand !== undefined)
      await tx.auditLog.create({
        data: {
          actorId,
          organizationId,
          entityType: "PRODUCT",
          entityId: productId,
          action: "PRODUCT_CLASSIFICATION_UPDATED",
          before: {
            isMedication: beforeProduct.isMedication,
            brand: beforeProduct.brand,
            externalReferenceSource: beforeProduct.externalReferenceSource,
          },
          after: {
            isMedication: updatedProduct.isMedication,
            brand: updatedProduct.brand,
            externalReferenceSource: updatedProduct.externalReferenceSource,
          },
        },
      });
    const pricingChanged =
      input.priceMinor !== undefined ||
      input.priceDivisor !== undefined ||
      input.priceMarkupBps !== undefined ||
      input.priceBaseMinor !== undefined ||
      input.externalReferencePriceMinor !== undefined;
    const divided = updatedProduct.priceDivisor != null;
    const linked = Boolean(
      updatedProduct.externalReferenceSource &&
      updatedProduct.externalReferenceName,
    );
    const calculatedPrice =
      divided && pricingChanged
        ? fractionalPrice(
            linked
              ? updatedProduct.externalReferencePriceMinor
              : updatedProduct.priceBaseMinor,
            updatedProduct.priceDivisor!,
            updatedProduct.priceMarkupBps,
          )
        : undefined;
    const salePrice =
      calculatedPrice ??
      (input.priceDivisor === null &&
      linked &&
      updatedProduct.saleUnit === "BOX"
        ? (updatedProduct.externalReferencePriceMinor ?? undefined)
        : input.priceMinor === undefined
          ? undefined
          : BigInt(input.priceMinor));
    if (salePrice !== undefined) {
      const priceList = await tx.priceList.upsert({
        where: {
          organizationId_name: { organizationId, name: "Precio general" },
        },
        update: {},
        create: { organizationId, name: "Precio general" },
      });
      const synchronized =
        (input.saleUnit ?? beforeProduct.saleUnit) === "BOX" &&
        (input.externalReferenceSource === undefined
          ? beforeProduct.externalReferenceSource
          : input.externalReferenceSource) &&
        (input.externalReferenceName === undefined
          ? beforeProduct.externalReferenceName
          : input.externalReferenceName);
      if (synchronized && !divided && input.priceDivisor !== null) {
        const existingPrice = await tx.productPrice.findUnique({
          where: {
            productId_priceListId: {
              productId,
              priceListId: priceList.id,
            },
          },
        });
        const referencePrice =
          input.externalReferenceSource &&
          input.externalReferencePriceMinor != null
            ? BigInt(input.externalReferencePriceMinor)
            : existingPrice?.amountMinor;
        if (salePrice !== referencePrice)
          throw new BadRequestException(
            "El precio de este producto está sincronizado. Para otro precio, usá una lista personalizada.",
          );
      }
      const previousPrice =
        divided || beforeProduct.priceDivisor != null
          ? await tx.productPrice.findUnique({
              where: {
                productId_priceListId: {
                  productId,
                  priceListId: priceList.id,
                },
              },
            })
          : null;
      await tx.productPrice.upsert({
        where: {
          productId_priceListId: { productId, priceListId: priceList.id },
        },
        update: { amountMinor: salePrice },
        create: {
          productId,
          priceListId: priceList.id,
          amountMinor: salePrice,
        },
      });
      if (divided || beforeProduct.priceDivisor != null)
        await tx.auditLog.create({
          data: {
            actorId,
            organizationId,
            entityType: "PRODUCT",
            entityId: productId,
            action: "PRODUCT_FRACTIONAL_PRICE_CONFIGURED",
            before: {
              divisor: beforeProduct.priceDivisor,
              markupBps: beforeProduct.priceMarkupBps,
              baseMinor: beforeProduct.priceBaseMinor?.toString() ?? null,
              amountMinor: previousPrice?.amountMinor.toString() ?? null,
            },
            after: {
              divisor: updatedProduct.priceDivisor,
              markupBps: updatedProduct.priceMarkupBps,
              baseMinor: updatedProduct.priceBaseMinor?.toString() ?? null,
              referencePriceMinor:
                updatedProduct.externalReferencePriceMinor?.toString() ?? null,
              amountMinor: salePrice.toString(),
            },
          },
        });
    }
    // Qué datos cambió esta edición (SISTEMA-79): una edición hecha sin
    // conexión que llega después no pisa un dato que se cambió más tarde.
    const cambios = cambiosDelProducto(beforeProduct, updatedProduct, {
      codigo: { antes: codigoAntes, despues: await primaryCode(tx, productId) },
      precio: {
        antes: precioAntes,
        despues: await generalPrice(tx, organizationId, productId),
      },
      foto: imageContent !== undefined,
    });
    if (cambios.cambio)
      await tx.auditLog.create({
        data: {
          actorId,
          organizationId,
          entityType: "PRODUCT",
          entityId: productId,
          action: "PRODUCT_UPDATED",
          before: cambios.before as Prisma.InputJsonValue,
          after: { ...cambios.after, ...marca } as Prisma.InputJsonValue,
        },
      });
    if (input.generateInternalBarcode)
      await internalBarcode(tx, actorId, organizationId, productId, true);
  }

  async removeUnusedProduct(
    actorId: string,
    organizationId: string,
    productId: string,
  ) {
    await this.assert(actorId, organizationId, "CATALOG_MANAGE");
    return this.prisma.$transaction((tx) =>
      this.eliminarEnTx(tx, actorId, organizationId, productId),
    );
  }

  /** Elimina un producto sin uso dentro de una transacción (SISTEMA-79). */
  async eliminarEnTx(
    tx: Prisma.TransactionClient,
    actorId: string,
    organizationId: string,
    productId: string,
  ) {
    await tx.$queryRaw`SELECT id FROM "Product" WHERE id=${productId}::uuid AND "organizationId"=${organizationId}::uuid FOR UPDATE`;
    const product = await tx.product.findFirst({
      where: { id: productId, organizationId },
      select: { id: true, name: true },
    });
    if (!product)
      throw new NotFoundException("El producto ya no está disponible.");
    const [
      purchaseItems,
      lots,
      movements,
      saleItems,
      supplierReturns,
      transferItems,
    ] = await Promise.all([
      tx.purchaseItem.count({ where: { productId } }),
      tx.productLot.count({ where: { productId, organizationId } }),
      tx.inventoryMovement.count({ where: { productId, organizationId } }),
      tx.saleItem.count({ where: { productId } }),
      tx.supplierReturn.count({ where: { productId, organizationId } }),
      tx.transferItem.count({ where: { productId } }),
    ]);
    if (
      purchaseItems +
        lots +
        movements +
        saleItems +
        supplierReturns +
        transferItems >
      0
    ) {
      throw new ConflictException(
        "No se puede eliminar definitivamente un producto con ventas, stock o historial. Usá Archivar para conservar la trazabilidad.",
      );
    }
    await tx.productPrice.deleteMany({ where: { productId } });
    await tx.productBarcode.deleteMany({ where: { productId } });
    const branchStates = await tx.productBranchState.findMany({
      where: { productId, organizationId },
      select: { branchId: true, status: true },
    });
    await tx.auditLog.create({
      data: {
        actorId,
        organizationId,
        entityType: "PRODUCT",
        entityId: productId,
        action: "UNUSED_PRODUCT_DELETED",
        before: { name: product.name, branchStates },
        after: { deleted: true },
      },
    });
    await tx.productBranchState.deleteMany({
      where: { productId, organizationId },
    });
    await tx.product.delete({ where: { id: productId } });
    return { id: productId, deleted: true };
  }

  async changeNamedItem(
    actorId: string,
    organizationId: string,
    type: "categories" | "laboratories",
    id: string,
    name?: string,
    parentId?: string | null,
  ) {
    if (type === "categories")
      return this.mutateCategory(actorId, organizationId, {
        id,
        name,
        parentId,
      });
    await this.assert(actorId, organizationId, "CATALOG_MANAGE");
    const trimmed = name?.trim();
    if (
      name !== undefined &&
      (!trimmed || trimmed.length < 2 || trimmed.length > 120)
    )
      throw new BadRequestException(
        "El nombre debe tener entre 2 y 120 caracteres.",
      );
    try {
      return await this.prisma.$transaction(
        async (tx) => {
          const where = { id, organizationId, active: true };
          const item = await tx.laboratory.findFirst({ where });
          if (!item)
            throw new NotFoundException(
              "La categoría o laboratorio no está disponible.",
            );
          if (name === undefined) {
            const count = await tx.product.count({
              where: {
                organizationId,
                laboratoryId: id,
              },
            });
            if (count)
              throw new ConflictException(
                `No se puede eliminar “${item.name}”: tiene ${count} producto(s) asociado(s). Cambiá su categoría o laboratorio antes de eliminarlo.`,
              );
          }
          const data =
            name === undefined ? { active: false } : { name: trimmed! };
          const args = {
            where: { id },
            data,
            select: { id: true, name: true },
          } as const;
          const result = await tx.laboratory.update(args);
          await tx.auditLog.create({
            data: {
              organizationId,
              actorId,
              entityType: "LABORATORY",
              entityId: id,
              action: name === undefined ? "ARCHIVED" : "RENAMED",
              before: { name: item.name, active: item.active },
              after: data,
            },
          });
          return result;
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (cause) {
      if (
        cause instanceof Prisma.PrismaClientKnownRequestError &&
        cause.code === "P2002"
      )
        throw new ConflictException(
          "Ya existe una categoría o laboratorio con ese nombre, incluso si fue eliminado.",
        );
      if (
        cause instanceof Prisma.PrismaClientKnownRequestError &&
        cause.code === "P2034"
      )
        throw new ConflictException(
          "Los datos cambiaron mientras guardabas. Volvé a intentarlo.",
        );
      throw cause;
    }
  }

  async createCategory(
    actorId: string,
    organizationId: string,
    name: string,
    icon: CategoryIcon = "auto",
    color?: CategoryColor,
    parentId?: string | null,
  ) {
    if (!CATEGORY_ICONS.includes(icon))
      throw new BadRequestException("Icono inválido.");
    if (color !== undefined) this.validCategoryColor(color);
    return this.mutateCategory(actorId, organizationId, {
      name,
      icon,
      color,
      parentId,
    });
  }

  async resolveExternalCategory(
    actorId: string,
    organizationId: string,
    path: string[],
    scope: string,
    details: CategoryEvidence & { evidence?: CategoryEvidence[] } = {},
  ) {
    await this.assert(actorId, organizationId, "CATALOG_MANAGE");
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${organizationId}, 146))`;
      const nodes = await tx.category.findMany({ where: { organizationId } });
      const plan = classifyCategoryEvidence(
        nodes,
        { ...details, category_path: path, scope_group: scope },
        details.evidence,
      );
      const adapted = automaticCategory(
        nodes,
        { ...details, category_path: path, scope_group: scope },
        plan,
      );
      if (adapted.ambiguous) return { categoryId: null, created: 0 };
      if (adapted.categoryId)
        return { categoryId: adapted.categoryId, created: 0 };
      if (!plan) return { categoryId: null, created: 0 };
      let parentId = plan.root.id;
      let created = 0;
      for (const name of plan.children) {
        const matches = nodes.filter(
          (node) =>
            node.parentId === parentId && equivalentCategory(node.name, name),
        );
        if (matches.length > 1 || matches.some((node) => !node.active))
          throw new ConflictException(
            "Revisá la subcategoría existente antes de completar esta ficha.",
          );
        let node = matches[0];
        if (!node) {
          node = await tx.category.create({
            data: { organizationId, parentId, name, icon: "auto" },
          });
          nodes.push(node);
          created++;
          await tx.auditLog.create({
            data: {
              actorId,
              organizationId,
              entityType: "CATEGORY",
              entityId: node.id,
              action: "CREATED",
              after: { name, parentId, origin: "EXTERNAL_PRODUCT_SELECTION" },
            },
          });
        }
        parentId = node.id;
      }
      return { categoryId: parentId, created };
    });
  }

  private async mutateCategory(
    actorId: string,
    organizationId: string,
    input: {
      id?: string;
      name?: string;
      parentId?: string | null;
      icon?: CategoryIcon;
      color?: CategoryColor;
    },
  ) {
    await this.assert(actorId, organizationId, "CATALOG_MANAGE");
    const name = input.name?.trim();
    if (
      input.name !== undefined &&
      (!name || name.length < 2 || name.length > 120)
    )
      throw new BadRequestException(
        "El nombre debe tener entre 2 y 120 caracteres.",
      );
    try {
      return await this.prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${organizationId}, 146))`;
        const nodes = await tx.category.findMany({
          where: { organizationId },
          select: { id: true, name: true, parentId: true, active: true },
        });
        const before = input.id
          ? nodes.find((node) => node.id === input.id && node.active)
          : undefined;
        if (input.id && !before)
          throw new NotFoundException("La categoría no está disponible.");
        const parentId =
          input.parentId === undefined
            ? (before?.parentId ?? null)
            : input.parentId;
        if (name !== undefined)
          validateCategoryPlacement(nodes, input.id, name, parentId);
        else {
          if (!before)
            throw new BadRequestException(
              "Indicá un nombre para la categoría.",
            );
          if (nodes.some((node) => node.active && node.parentId === before.id))
            throw new ConflictException(
              "Primero mové o eliminá las subcategorías de esta categoría.",
            );
          if (
            await tx.product.count({
              where: { organizationId, categoryId: before.id },
            })
          )
            throw new ConflictException(
              "La categoría tiene productos asociados. Cambiá su categoría antes de eliminarla.",
            );
        }
        const result = before
          ? await tx.category.update({
              where: { id: before.id },
              data: name === undefined ? { active: false } : { name, parentId },
            })
          : await tx.category.create({
              data: {
                organizationId,
                name: name!,
                parentId,
                icon: input.icon ?? "auto",
                ...(input.color ? { color: input.color } : {}),
              },
            });
        await tx.auditLog.create({
          data: {
            actorId,
            organizationId,
            entityType: "CATEGORY",
            entityId: result.id,
            action: !before
              ? "CREATED"
              : name === undefined
                ? "ARCHIVED"
                : parentId !== before.parentId
                  ? "MOVED"
                  : "RENAMED",
            ...(before
              ? {
                  before: {
                    name: before.name,
                    parentId: before.parentId,
                    active: before.active,
                  },
                }
              : {}),
            after: {
              name: result.name,
              parentId: result.parentId,
              active: result.active,
            },
          },
        });
        return result;
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      )
        throw new ConflictException(
          "Ya existe una categoría con ese nombre en este nivel.",
        );
      throw error;
    }
  }
  async categoryIcon(
    actorId: string,
    organizationId: string,
    id: string,
    icon: CategoryIcon,
    color?: CategoryColor,
  ) {
    await this.assert(actorId, organizationId, "CATALOG_MANAGE");
    if (!CATEGORY_ICONS.includes(icon))
      throw new BadRequestException("Icono inválido.");
    if (color !== undefined) this.validCategoryColor(color);
    return this.prisma.$transaction(
      async (tx) => {
        const item = await tx.category.findFirst({
          where: { id, organizationId, active: true },
          select: { icon: true, color: true },
        });
        if (!item)
          throw new NotFoundException("La categoría no está disponible.");
        const result = await tx.category.update({
          where: { id },
          data: { icon, ...(color !== undefined ? { color } : {}) },
          select: { id: true, icon: true },
        });
        await tx.auditLog.create({
          data: {
            actorId,
            organizationId,
            entityType: "CATEGORY",
            entityId: id,
            action: "ICON_CHANGED",
            before: {
              icon: item.icon,
              ...(color !== undefined ? { color: item.color } : {}),
            },
            after: { icon, ...(color !== undefined ? { color } : {}) },
          },
        });
        return result;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  private validCategoryColor(color: CategoryColor) {
    if (!CATEGORY_COLORS.includes(color))
      throw new BadRequestException("Color inválido.");
    return color;
  }

  async createLaboratory(
    actorId: string,
    organizationId: string,
    name: string,
  ) {
    await this.assert(actorId, organizationId, "CATALOG_MANAGE");
    return this.prisma.laboratory.create({
      data: { organizationId, name: name.trim() },
      select: { id: true, name: true },
    });
  }

  async create(
    actorId: string,
    organizationId: string,
    input: {
      generateInternalBarcode?: boolean;
      brand?: string;
      isMedication?: boolean;
      priceDivisor?: number | null;
      priceMarkupBps?: number;
      priceBaseMinor?: number | null;
      imageDataUrl?: string;
      name: string;
      categoryId?: string;
      laboratoryId?: string;
      laboratoryName?: string;
      barcode?: string;
      priceMinor: number;
      activeIngredient?: string;
      pharmaceuticalForm?: string;
      concentration?: string;
      presentation?: string;
      externalReferenceSource?: "official" | "preciosderemedios" | "alfabeta";
      externalReferenceName?: string;
      externalReferencePresentation?: string;
      externalReferenceBarcode?: string;
      externalReferencePriceMinor?: number;
      saleUnit?: "BOX" | "BLISTER" | "UNIT";
      description?: string;
      prescriptionRequired?: boolean;
      equivalentBarcodes?: string[];
    },
  ) {
    await this.assert(actorId, organizationId, "CATALOG_MANAGE");
    const preparado = await this.prepararAlta(
      this.prisma,
      organizationId,
      input,
    );
    return withProductBarcode(
      this.prisma,
      organizationId,
      undefined,
      input.barcode,
      () =>
        this.prisma.$transaction((tx) =>
          this.crearEnTx(tx, actorId, organizationId, input, preparado),
        ),
    );
  }

  /** Validaciones del alta, antes de la transacción (SISTEMA-79). */
  async prepararAlta(
    db: Pick<Prisma.TransactionClient, "category" | "laboratory">,
    organizationId: string,
    input: {
      generateInternalBarcode?: boolean;
      brand?: string;
      isMedication?: boolean;
      priceDivisor?: number | null;
      priceMarkupBps?: number;
      priceBaseMinor?: number | null;
      imageDataUrl?: string;
      name: string;
      categoryId?: string;
      laboratoryId?: string;
      laboratoryName?: string;
      barcode?: string;
      priceMinor: number;
      activeIngredient?: string;
      pharmaceuticalForm?: string;
      concentration?: string;
      presentation?: string;
      externalReferenceSource?: "official" | "preciosderemedios" | "alfabeta";
      externalReferenceName?: string;
      externalReferencePresentation?: string;
      externalReferenceBarcode?: string;
      externalReferencePriceMinor?: number;
      saleUnit?: "BOX" | "BLISTER" | "UNIT";
      description?: string;
      prescriptionRequired?: boolean;
      equivalentBarcodes?: string[];
    },
  ) {
    const isMedication =
      input.isMedication ??
      Boolean(input.externalReferenceSource || input.prescriptionRequired);
    if (
      !isMedication &&
      (input.externalReferenceSource || input.prescriptionRequired)
    )
      throw new BadRequestException(
        "Activá Es medicamento antes de vincular una referencia medicinal o indicar receta.",
      );
    if (isMedication && input.externalReferenceSource)
      assertMedicineReferenceBarcode(
        input.barcode,
        input.externalReferenceBarcode,
      );
    const [category, laboratory] = await Promise.all([
      input.categoryId
        ? db.category.findFirst({
            where: { id: input.categoryId, organizationId, active: true },
          })
        : undefined,
      input.laboratoryId
        ? db.laboratory.findFirst({
            where: { id: input.laboratoryId, organizationId, active: true },
          })
        : undefined,
    ]);
    if (input.categoryId && !category)
      throw new NotFoundException("Category is unavailable.");
    if (input.laboratoryId && !laboratory)
      throw new NotFoundException("Laboratory is unavailable.");
    const imageContent =
      input.imageDataUrl == null
        ? undefined
        : decodeProductImage(input.imageDataUrl);
    return { isMedication, imageContent };
  }

  /** El alta dentro de una transacción; sin conexión, con el id de la PC. */
  async crearEnTx(
    tx: Prisma.TransactionClient,
    actorId: string,
    organizationId: string,
    input: {
      generateInternalBarcode?: boolean;
      brand?: string;
      isMedication?: boolean;
      priceDivisor?: number | null;
      priceMarkupBps?: number;
      priceBaseMinor?: number | null;
      imageDataUrl?: string;
      name: string;
      categoryId?: string;
      laboratoryId?: string;
      laboratoryName?: string;
      barcode?: string;
      priceMinor: number;
      activeIngredient?: string;
      pharmaceuticalForm?: string;
      concentration?: string;
      presentation?: string;
      externalReferenceSource?: "official" | "preciosderemedios" | "alfabeta";
      externalReferenceName?: string;
      externalReferencePresentation?: string;
      externalReferenceBarcode?: string;
      externalReferencePriceMinor?: number;
      saleUnit?: "BOX" | "BLISTER" | "UNIT";
      description?: string;
      prescriptionRequired?: boolean;
      equivalentBarcodes?: string[];
    },
    {
      isMedication,
      imageContent,
    }: Awaited<ReturnType<CatalogService["prepararAlta"]>>,
    id?: string,
  ) {
    const laboratoryId = input.laboratoryId
      ? input.laboratoryId
      : input.laboratoryName?.trim()
        ? (
            await tx.laboratory.upsert({
              where: {
                organizationId_name: {
                  organizationId,
                  name: input.laboratoryName.trim(),
                },
              },
              update: { active: true },
              create: {
                organizationId,
                name: input.laboratoryName.trim(),
              },
            })
          ).id
        : undefined;
    const priceList = await tx.priceList.upsert({
      where: {
        organizationId_name: { organizationId, name: "Precio general" },
      },
      update: {},
      create: { organizationId, name: "Precio general" },
    });
    const product = await tx.product.create({
      data: {
        // Sin conexión, el id es la clave de la PC (SISTEMA-79).
        ...(id ? { id } : {}),
        isMedication,
        brand: input.brand?.trim().replace(/\s+/g, " ") || null,
        priceDivisor: input.priceDivisor,
        priceMarkupBps: input.priceDivisor ? (input.priceMarkupBps ?? 0) : 0,
        priceBaseMinor:
          input.priceDivisor && input.priceBaseMinor != null
            ? BigInt(input.priceBaseMinor)
            : null,
        organizationId,
        name: input.name.trim(),
        categoryId: input.categoryId,
        laboratoryId,
        activeIngredient: input.activeIngredient?.trim(),
        pharmaceuticalForm: input.pharmaceuticalForm?.trim(),
        concentration: input.concentration?.trim(),
        presentation: input.presentation?.trim(),
        externalReferenceSource: input.externalReferenceSource,
        externalReferenceName: input.externalReferenceName?.trim(),
        externalReferencePresentation:
          input.externalReferencePresentation?.trim(),
        externalReferenceBarcode: input.externalReferenceBarcode?.trim(),
        externalReferencePriceMinor:
          input.externalReferencePriceMinor === undefined
            ? undefined
            : BigInt(input.externalReferencePriceMinor),
        externalReferenceCheckedAt: input.externalReferenceSource
          ? new Date()
          : undefined,
        saleUnit: input.saleUnit,
        description: input.description?.trim(),
        prescriptionRequired: input.prescriptionRequired,
      },
    });
    if (input.barcode)
      await tx.productBarcode.create({
        data: {
          organizationId,
          productId: product.id,
          code: input.barcode.trim(),
          primary: true,
        },
      });
    const base =
      input.externalReferenceSource && input.externalReferenceName
        ? input.externalReferencePriceMinor
        : input.priceBaseMinor;
    const initialPrice =
      input.priceDivisor != null
        ? fractionalPrice(
            base == null ? null : BigInt(base),
            input.priceDivisor,
            input.priceMarkupBps ?? 0,
          )
        : BigInt(input.priceMinor);
    await tx.productPrice.create({
      data: {
        productId: product.id,
        priceListId: priceList.id,
        amountMinor: initialPrice,
      },
    });
    if (input.priceDivisor != null)
      await tx.auditLog.create({
        data: {
          actorId,
          organizationId,
          entityType: "PRODUCT",
          entityId: product.id,
          action: "PRODUCT_FRACTIONAL_PRICE_CONFIGURED",
          after: {
            divisor: input.priceDivisor,
            markupBps: input.priceMarkupBps ?? 0,
            baseMinor: base?.toString() ?? null,
            amountMinor: initialPrice.toString(),
          },
        },
      });
    await saveProductImage(
      tx,
      organizationId,
      product.id,
      actorId,
      imageContent,
    );
    if (input.generateInternalBarcode)
      await internalBarcode(tx, actorId, organizationId, product.id, true);
    // El envase importado queda asociado en la misma transacción: si un
    // código choca con otro producto no se crea nada.
    for (const code of input.equivalentBarcodes ?? [])
      await addEquivalentBarcode(tx, actorId, organizationId, product.id, code);
    return { id: product.id };
  }

  async assertPermission(
    actorId: string,
    organizationId: string,
    code: string,
  ) {
    const membership = await this.prisma.userOrganization.findUnique({
      where: { userId_organizationId: { userId: actorId, organizationId } },
      include: {
        roles: {
          include: {
            role: {
              include: { permissions: { include: { permission: true } } },
            },
          },
        },
      },
    });
    if (
      !membership?.active ||
      !membership.roles.some(({ role }) =>
        role.permissions.some(({ permission }) => permission.code === code),
      )
    )
      throw new ForbiddenException(
        "No tenés permiso para esta operación. Pedíselo al dueño de la farmacia.",
      );
  }

  private async assert(actorId: string, organizationId: string, code: string) {
    return this.assertPermission(actorId, organizationId, code);
  }
}

/** Código principal de un producto (para la auditoría de la edición). */
async function primaryCode(tx: Prisma.TransactionClient, productId: string) {
  return (
    (
      await tx.productBarcode.findFirst({
        where: { productId, primary: true },
        select: { code: true },
      })
    )?.code ?? null
  );
}

/** Precio general de un producto (para la auditoría de la edición). */
async function generalPrice(
  tx: Prisma.TransactionClient,
  organizationId: string,
  productId: string,
) {
  const price = await tx.productPrice.findFirst({
    where: {
      productId,
      priceList: { organizationId, name: "Precio general" },
    },
    select: { amountMinor: true },
  });
  return price?.amountMinor.toString() ?? null;
}
