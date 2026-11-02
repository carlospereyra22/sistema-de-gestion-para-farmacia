import { ConflictException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import type { PrismaService } from "../prisma/prisma.service";
import { gtinSpellings } from "./equivalent-barcode";

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
    // Único por organización: otra farmacia puede usar el mismo código. Un
    // GTIN cuenta igual con o sin ceros a la izquierda.
    let spellings = [code];
    try {
      spellings = gtinSpellings(code);
    } catch {
      // Código propio que no es un GTIN: se compara tal cual.
    }
    const existing = await prisma.productBarcode.findFirst({
      where: {
        organizationId,
        code: { in: spellings },
        ...(productId ? { productId: { not: productId } } : {}),
      },
      select: { productId: true, product: { select: { name: true } } },
    });
    if (existing && existing.productId !== productId)
      throw new ConflictException(
        `El código de barras ${code} ya está asignado al producto “${existing.product.name}”. Revisá el código o editá el producto existente.`,
      );
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
        : target === "ProductBarcode_organizationId_code_key")
    ) {
      await check();
      throw new ConflictException(
        `El código de barras ${code} ya está registrado. Revisalo antes de guardar.`,
      );
    }
    throw cause;
  }
}
