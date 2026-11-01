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
import { internalBarcode } from "./internal-barcode";
import { assertMedicineReferenceBarcode } from "./medicine-reference-barcode";
import {
  branchProductAccess,
  changeBranchProduct,
  type BranchProductChange,
} from "./branch-product-lifecycle";
import { decodeProductImage, saveProductImage } from "./product-image";
import {
  CATEGORY_ICONS,
  CATEGORY_COLORS,
  type CategoryIcon,
  type CategoryColor,
} from "@gestion/contracts";

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
    await this.assert(actorId, organizationId, "CATALOG_READ");
    if (branchId)
      await branchProductAccess(this.prisma, actorId, organizationId, branchId);
    const products = await this.prisma.product.findMany({
      where: {
        organizationId,
        ...(branchId
          ? { branchStates: { none: { branchId, status: "DELETED" } } }
          : { active: true }),
      },
      select: {
        branchStates: {
          where: {
            branchId: branchId ?? "00000000-0000-0000-0000-000000000000",
          },
          select: { status: true, updatedAt: true },
        },
        id: true,
        name: true,
        brand: true,
        isMedication: true,
        image: { select: { updatedAt: true } },
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
        category: { select: { id: true, name: true } },
        laboratory: { select: { id: true, name: true } },
        barcodes: { select: { code: true, primary: true } },
        prices: {
          where: {
            priceList: {
              is: {
                organizationId,
                name: "Precio general",
                active: true,
              },
            },
          },
          select: { amountMinor: true },
        },
      },
      orderBy: { name: "asc" },
    });
    const paths = categoryPaths(
      await this.prisma.category.findMany({
        where: { organizationId },
        select: { id: true, name: true, parentId: true },
      }),
    );
    return products.map((product) => ({
      ...product,
      category: product.category
        ? {
            ...product.category,
            path: paths.get(product.category.id) ?? product.category.name,
          }
        : null,
      branchStateUpdatedAt:
        product.branchStates[0]?.updatedAt.toISOString() ?? null,
      branchStatus:
        product.branchStates[0]?.status ??
        (product.active ? "ACTIVE" : "ARCHIVED"),
      active:
        product.active &&
        (!product.branchStates[0] ||
          product.branchStates[0].status === "ACTIVE"),
      priceBaseMinor: product.priceBaseMinor?.toString() ?? null,
      externalReferencePriceMinor:
        product.externalReferencePriceMinor?.toString() ?? null,
      prices: product.prices.map((price) => ({
        amountMinor: price.amountMinor.toString(),
      })),
    }));
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
    const product = await this.prisma.product.findFirst({
      where: { id: productId, organizationId },
    });
    if (!product) throw new NotFoundException("Product is unavailable.");
    const [category, laboratory] = await Promise.all([
      input.categoryId
        ? this.prisma.category.findFirst({
            where: { id: input.categoryId, organizationId, active: true },
          })
        : undefined,
      input.laboratoryId
        ? this.prisma.laboratory.findFirst({
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
    await withProductBarcode(
      this.prisma,
      organizationId,
      productId,
      input.barcode,
      () =>
        this.prisma.$transaction(async (tx) => {
          await tx.$queryRaw`SELECT id FROM "Product" WHERE id = ${productId}::uuid AND "organizationId" = ${organizationId}::uuid FOR UPDATE`;
          const beforeProduct = await tx.product.findFirstOrThrow({
            where: { id: productId, organizationId },
          });
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
              priceMarkupBps:
                input.priceDivisor === null ? 0 : input.priceMarkupBps,
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
                    externalReferenceCheckedAt: isMedication
                      ? new Date()
                      : null,
                  }
                : {}),
              ...(input.saleUnit !== undefined
                ? { saleUnit: input.saleUnit }
                : {}),
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
                  externalReferenceSource:
                    beforeProduct.externalReferenceSource,
                },
                after: {
                  isMedication: updatedProduct.isMedication,
                  brand: updatedProduct.brand,
                  externalReferenceSource:
                    updatedProduct.externalReferenceSource,
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
                    baseMinor:
                      updatedProduct.priceBaseMinor?.toString() ?? null,
                    referencePriceMinor:
                      updatedProduct.externalReferencePriceMinor?.toString() ??
                      null,
                    amountMinor: salePrice.toString(),
                  },
                },
              });
          }
          if (input.generateInternalBarcode)
            await internalBarcode(tx, actorId, organizationId, productId, true);
        }),
    );
    return { id: productId };
  }

  async removeUnusedProduct(
    actorId: string,
    organizationId: string,
    productId: string,
  ) {
    await this.assert(actorId, organizationId, "CATALOG_MANAGE");
    return this.prisma.$transaction(async (tx) => {
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
    });
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
    },
  ) {
    await this.assert(actorId, organizationId, "CATALOG_MANAGE");
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
        ? this.prisma.category.findFirst({
            where: { id: input.categoryId, organizationId, active: true },
          })
        : undefined,
      input.laboratoryId
        ? this.prisma.laboratory.findFirst({
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
    return withProductBarcode(
      this.prisma,
      organizationId,
      undefined,
      input.barcode,
      () =>
        this.prisma.$transaction(async (tx) => {
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
              isMedication,
              brand: input.brand?.trim().replace(/\s+/g, " ") || null,
              priceDivisor: input.priceDivisor,
              priceMarkupBps: input.priceDivisor
                ? (input.priceMarkupBps ?? 0)
                : 0,
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
            await internalBarcode(
              tx,
              actorId,
              organizationId,
              product.id,
              true,
            );
          return { id: product.id };
        }),
    );
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
      throw new ForbiddenException("You do not have the required permission.");
  }

  private async assert(actorId: string, organizationId: string, code: string) {
    return this.assertPermission(actorId, organizationId, code);
  }
}
