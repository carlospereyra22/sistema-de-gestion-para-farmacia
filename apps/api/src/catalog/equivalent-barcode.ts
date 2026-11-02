import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { canonicalGtin } from "./external-gtin";

export const MAX_EQUIVALENT_BARCODES = 10;

// Un mismo GTIN puede escribirse con o sin ceros a la izquierda
// ("07793640215509" y "7793640215509"): todas sus formas cuentan como el mismo
// código al buscar duplicados.
export function gtinSpellings(code: string): string[] {
  const normalized = canonicalGtin(code);
  return [14, 13, 12, 8]
    .filter((length) => /^0*$/.test(normalized.slice(0, 14 - length)))
    .map((length) => normalized.slice(14 - length));
}

async function lockProduct(
  tx: Prisma.TransactionClient,
  organizationId: string,
  productId: string,
) {
  // Serializa con la edición del producto y con otros equivalentes simultáneos.
  await tx.$queryRaw`SELECT id FROM "Product" WHERE id = ${productId}::uuid AND "organizationId" = ${organizationId}::uuid FOR UPDATE`;
  const product = await tx.product.findFirst({
    where: { id: productId, organizationId, active: true },
    select: { id: true, name: true },
  });
  if (!product) throw new NotFoundException("Producto no disponible.");
  return product;
}

export async function addEquivalentBarcode(
  tx: Prisma.TransactionClient,
  actorId: string,
  organizationId: string,
  productId: string,
  rawCode: string,
) {
  const code = rawCode.trim();
  const spellings = gtinSpellings(code);
  const product = await lockProduct(tx, organizationId, productId);
  const existing = await tx.productBarcode.findFirst({
    where: { organizationId, code: { in: spellings } },
    select: { productId: true, product: { select: { name: true } } },
  });
  if (existing?.productId === productId)
    throw new BadRequestException(
      `El código ${code} ya es un código de este producto.`,
    );
  if (existing)
    throw new ConflictException(
      `El código ${code} ya está asignado al producto “${existing.product.name}”. Revisá el envase o quitáselo a ese producto antes de asociarlo.`,
    );
  const count = await tx.productBarcode.count({
    where: { organizationId, productId, kind: "EQUIVALENT" },
  });
  if (count >= MAX_EQUIVALENT_BARCODES)
    throw new BadRequestException(
      `Un producto admite hasta ${MAX_EQUIVALENT_BARCODES} códigos equivalentes.`,
    );
  await tx.productBarcode.create({
    data: {
      organizationId,
      productId,
      code,
      primary: false,
      kind: "EQUIVALENT",
    },
  });
  await tx.auditLog.create({
    data: {
      actorId,
      organizationId,
      entityType: "PRODUCT",
      entityId: productId,
      action: "PRODUCT_EQUIVALENT_BARCODE_ADDED",
      after: { code },
    },
  });
  return { productId, productName: product.name, code };
}

export async function removeEquivalentBarcode(
  tx: Prisma.TransactionClient,
  actorId: string,
  organizationId: string,
  productId: string,
  rawCode: string,
) {
  const code = rawCode.trim();
  await lockProduct(tx, organizationId, productId);
  const barcode = await tx.productBarcode.findFirst({
    where: { organizationId, productId, code, kind: "EQUIVALENT" },
    select: { id: true },
  });
  if (!barcode)
    throw new NotFoundException(
      "El código equivalente no existe en este producto.",
    );
  await tx.productBarcode.delete({ where: { id: barcode.id } });
  await tx.auditLog.create({
    data: {
      actorId,
      organizationId,
      entityType: "PRODUCT",
      entityId: productId,
      action: "PRODUCT_EQUIVALENT_BARCODE_REMOVED",
      before: { code },
    },
  });
  return { productId, code };
}
