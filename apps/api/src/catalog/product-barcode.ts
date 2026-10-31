import { ConflictException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import type { PrismaService } from "../prisma/prisma.service";

export async function withProductBarcode<T>(
  prisma: Pick<PrismaService, "productBarcode">,
  organizationId: string,
  productId: string | undefined,
  barcode: string | undefined,
  operation: () => Promise<T>,
): Promise<T> {
  const code = barcode?.trim();
  async function check() {
    if (!code) return;
    const existing = await prisma.productBarcode.findUnique({
      where: { code },
      select: {
        productId: true,
        product: { select: { organizationId: true, name: true } },
      },
    });
    if (existing && existing.productId !== productId) {
      const owner =
        existing.product.organizationId === organizationId
          ? ` al producto “${existing.product.name}”`
          : " a otro producto";
      throw new ConflictException(
        `El código de barras ${code} ya está asignado${owner}. Revisá el código o editá el producto existente.`,
      );
    }
  }
  await check();
  try {
    return await operation();
  } catch (cause) {
    const target =
      cause instanceof Prisma.PrismaClientKnownRequestError
        ? cause.meta?.target
        : undefined;
    if (
      code &&
      cause instanceof Prisma.PrismaClientKnownRequestError &&
      cause.code === "P2002" &&
      (Array.isArray(target)
        ? target.includes("code")
        : target === "ProductBarcode_code_key")
    ) {
      await check();
      throw new ConflictException(
        `El código de barras ${code} ya está registrado. Revisalo antes de guardar.`,
      );
    }
    throw cause;
  }
}
