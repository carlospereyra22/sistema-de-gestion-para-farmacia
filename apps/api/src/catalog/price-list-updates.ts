import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { createHash, randomUUID } from "node:crypto";
import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsUUID,
  Matches,
  Max,
  Min,
  ValidateNested,
} from "class-validator";
import { PrismaService } from "../prisma/prisma.service";
import { CatalogService } from "./catalog.service";

export class PriceChangeDto {
  @IsUUID() productId!: string;
  @IsOptional() @Matches(/^\d{1,12}$/) expectedMinor!: string | null;
  @IsOptional() @Matches(/^\d{1,12}$/) amountMinor!: string | null;
}
export class PriceChangesDto {
  @IsUUID() requestId!: string;
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(2000)
  @ValidateNested({ each: true })
  @Type(() => PriceChangeDto)
  changes!: PriceChangeDto[];
}
export class PricePreviewDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(2000)
  @IsUUID(undefined, { each: true })
  productIds!: string[];
  @IsIn(["PERCENT", "FIXED"]) mode!: "PERCENT" | "FIXED";
  // Percent uses basis points (8% = 800); fixed uses cents.
  @IsInt() @Min(-999999999999) @Max(999999999999) value!: number;
}
export function increasedPrice(
  amount: bigint,
  mode: "PERCENT" | "FIXED",
  value: number,
) {
  if (!Number.isSafeInteger(value) || Math.abs(value) > 999999999999)
    throw new BadRequestException("Ajuste inválido.");
  if (mode === "PERCENT" && value < -10000)
    throw new BadRequestException("La reducción no puede superar el 100%.");
  const result =
    mode === "PERCENT"
      ? (amount * (10000n + BigInt(value)) + 5000n) / 10000n
      : amount + BigInt(value);
  if (result > 999999999999n)
    throw new BadRequestException("El precio supera el máximo permitido.");
  if (result < 0n)
    throw new BadRequestException(
      "El ajuste dejaría un precio negativo. Reducí el monto de la baja.",
    );
  return result;
}

@Injectable()
export class PriceListUpdates {
  constructor(
    private readonly prisma: PrismaService,
    private readonly catalog: CatalogService,
  ) {}
  async effective(
    actorId: string,
    organizationId: string,
    customerId?: string,
    priceListId?: string,
  ) {
    await this.catalog.assertPermission(
      actorId,
      organizationId,
      "CATALOG_READ",
    );
    const customer = customerId
      ? await this.prisma.customer.findFirst({
          where: { id: customerId, organizationId, active: true },
        })
      : null;
    if (customerId && !customer)
      throw new NotFoundException("Cliente no disponible.");
    const general = await this.prisma.priceList.findFirst({
      where: { organizationId, name: "Precio general", active: true },
    });
    const requestedList = priceListId || customer?.priceListId;
    const custom = requestedList
      ? await this.prisma.priceList.findFirst({
          where: { id: requestedList, organizationId, active: true },
        })
      : null;
    if (priceListId && !custom)
      throw new NotFoundException("Lista no disponible.");
    const fallback = custom?.fallbackPriceListId
      ? await this.prisma.priceList.findFirst({
          where: {
            id: custom.fallbackPriceListId,
            organizationId,
            active: true,
          },
        })
      : null;
    const lists = [custom?.id, fallback?.id, general?.id].filter(
      (id): id is string => Boolean(id),
    );
    const products = await this.prisma.product.findMany({
      where: { organizationId, active: true },
      select: { id: true, prices: { where: { priceListId: { in: lists } } } },
    });
    return {
      listName: custom?.name ?? "Precio general",
      prices: products.map((product) => {
        const selected =
          product.prices.find((p) => p.priceListId === custom?.id) ??
          product.prices.find((p) => p.priceListId === fallback?.id) ??
          product.prices.find((p) => p.priceListId === general?.id);
        return {
          productId: product.id,
          amountMinor: selected?.amountMinor.toString() ?? null,
          source:
            custom && selected?.priceListId === custom.id
              ? custom.name
              : fallback && selected?.priceListId === fallback.id
                ? fallback.name
                : "Precio general",
        };
      }),
    };
  }
  async single(
    actorId: string,
    organizationId: string,
    id: string,
    productId: string,
    amount: number,
  ) {
    await this.catalog.assertPermission(
      actorId,
      organizationId,
      "CATALOG_MANAGE",
    );
    await this.editable(organizationId, id);
    const current = await this.prisma.productPrice.findUnique({
      where: { productId_priceListId: { productId, priceListId: id } },
    });
    return this.save(actorId, organizationId, id, {
      requestId: randomUUID(),
      changes: [
        {
          productId,
          expectedMinor: current?.amountMinor.toString() ?? null,
          amountMinor: String(amount),
        },
      ],
    });
  }
  private async editable(organizationId: string, id: string) {
    const list = await this.prisma.priceList.findFirst({
      where: { id, organizationId, active: true },
    });
    if (!list) throw new NotFoundException("Lista no disponible.");
    if (list.name === "Precio general")
      throw new BadRequestException(
        "Precio general es de solo lectura. Creá una lista personalizada.",
      );
    return list;
  }
  async preview(
    actorId: string,
    organizationId: string,
    id: string,
    input: PricePreviewDto,
  ) {
    await this.catalog.assertPermission(
      actorId,
      organizationId,
      "CATALOG_MANAGE",
    );
    await this.editable(organizationId, id);
    const prices = await this.prisma.productPrice.findMany({
      where: {
        priceListId: id,
        productId: { in: input.productIds },
        product: { organizationId, active: true },
      },
      include: { product: { select: { name: true } } },
    });
    if (prices.length !== new Set(input.productIds).size)
      throw new BadRequestException(
        "La selección incluye productos que no están activos en esta lista. Actualizá la selección.",
      );
    return prices.map((price) => ({
      productId: price.productId,
      name: price.product.name,
      expectedMinor: price.amountMinor.toString(),
      amountMinor: increasedPrice(
        price.amountMinor,
        input.mode,
        input.value,
      ).toString(),
    }));
  }
  async save(
    actorId: string,
    organizationId: string,
    id: string,
    input: PriceChangesDto,
  ) {
    await this.catalog.assertPermission(
      actorId,
      organizationId,
      "CATALOG_MANAGE",
    );
    if (
      new Set(input.changes.map((c) => c.productId)).size !==
      input.changes.length
    )
      throw new BadRequestException("Hay productos repetidos.");
    for (const change of input.changes) {
      if (
        ![change.expectedMinor, change.amountMinor].every(
          (value) =>
            value === null ||
            (typeof value === "string" && /^\d{1,12}$/.test(value)),
        )
      )
        throw new BadRequestException("Precio inválido.");
    }
    const digest = createHash("sha256")
      .update(JSON.stringify(input.changes))
      .digest("hex");
    return this.prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${organizationId + ":price-list:" + id}, 0))`;
        const list = await tx.priceList.findFirst({
          where: { id, organizationId, active: true },
        });
        if (!list) throw new NotFoundException("Lista no disponible.");
        if (list.name === "Precio general")
          throw new BadRequestException("Precio general es de solo lectura.");
        const prior = await tx.auditLog.findFirst({
          where: {
            organizationId,
            entityId: id,
            action: "PRICE_LIST_UPDATED",
            after: { path: ["requestId"], equals: input.requestId },
          },
        });
        if (prior) {
          const data = prior.after as { digest?: string; actorId?: string };
          if (data.digest !== digest || data.actorId !== actorId)
            throw new ConflictException(
              "El identificador de guardado ya fue utilizado.",
            );
          return { ok: true, repeated: true };
        }
        const ids = input.changes.map((c) => c.productId);
        const products = await tx.product.count({
          where: { id: { in: ids }, organizationId, active: true },
        });
        if (products !== ids.length)
          throw new BadRequestException(
            "Hay productos inactivos o ajenos a la organización.",
          );
        const current = await tx.productPrice.findMany({
          where: { priceListId: id, productId: { in: ids } },
        });
        for (const change of input.changes) {
          const before =
            current
              .find((p) => p.productId === change.productId)
              ?.amountMinor.toString() ?? null;
          if (before !== change.expectedMinor)
            throw new ConflictException(
              "Los precios cambiaron desde que abriste la lista. Recargá antes de guardar.",
            );
          if (change.amountMinor === null) {
            await tx.productPrice.deleteMany({
              where: { priceListId: id, productId: change.productId },
            });
          } else {
            await tx.productPrice.upsert({
              where: {
                productId_priceListId: {
                  productId: change.productId,
                  priceListId: id,
                },
              },
              create: {
                productId: change.productId,
                priceListId: id,
                amountMinor: BigInt(change.amountMinor),
              },
              update: { amountMinor: BigInt(change.amountMinor) },
            });
          }
        }
        await tx.priceList.update({
          where: { id },
          data: { updatedAt: new Date() },
        });
        await tx.auditLog.create({
          data: {
            actorId,
            organizationId,
            entityType: "PRICE_LIST",
            entityId: id,
            action: "PRICE_LIST_UPDATED",
            after: {
              requestId: input.requestId,
              actorId,
              digest,
              changes: input.changes.map((c) => ({ ...c })),
            },
          },
        });
        return { ok: true, repeated: false };
      },
      { timeout: 60000 },
    );
  }
}
