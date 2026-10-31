import { createHash } from "node:crypto";
import { ConflictException, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";

// This is a private Code 128 identifier, never an EAN/GTIN assigned by GS1.
export function internalBarcodeCode(organizationId: string, productId: string) {
  const hash = createHash("sha256")
    .update(`internal-barcode-v1:${organizationId}:${productId}`)
    .digest("hex");
  return `SG${(BigInt(`0x${hash.slice(0, 16)}`) % 1000000000000n).toString().padStart(12, "0")}`;
}

export async function internalBarcode(
  tx: Prisma.TransactionClient,
  actorId: string,
  organizationId: string,
  productId: string,
  create: boolean,
) {
  // Serializes with product editing and with concurrent creation/retries.
  await tx.$queryRaw`SELECT id FROM "Product" WHERE id = ${productId}::uuid AND "organizationId" = ${organizationId}::uuid FOR UPDATE`;
  const product = await tx.product.findFirst({
    where: { id: productId, organizationId, active: true },
    select: { name: true, saleUnit: true },
  });
  if (!product) throw new NotFoundException("Producto no disponible.");
  const code = internalBarcodeCode(organizationId, productId);
  const existing = await tx.productBarcode.findUnique({ where: { code } });
  if (existing && existing.productId !== productId)
    throw new ConflictException(
      "No se pudo asignar un código interno único. Contactá al administrador.",
    );
  if (!existing && create) {
    await tx.productBarcode.create({
      data: { productId, code, primary: false },
    });
    await tx.auditLog.create({
      data: {
        actorId,
        organizationId,
        entityType: "PRODUCT",
        entityId: productId,
        action: "PRODUCT_INTERNAL_BARCODE_CREATED",
        after: { code },
      },
    });
  }
  return { ...product, code: existing || create ? code : null };
}
