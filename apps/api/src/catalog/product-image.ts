import { BadRequestException } from "@nestjs/common";
import type { Prisma } from "@prisma/client";

export function decodeProductImage(value: string): Buffer {
  if (value.length > 82000)
    throw new BadRequestException("La foto supera el tamaño permitido.");
  const match = /^data:image\/jpeg;base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
  if (!match)
    throw new BadRequestException("La foto debe ser una imagen JPEG válida.");
  const bytes = Buffer.from(match[1]!, "base64");
  if (
    bytes.length > 61440 ||
    bytes.length < 4 ||
    bytes.toString("base64") !== match[1] ||
    bytes.readUInt16BE(0) !== 0xffd8 ||
    bytes.readUInt16BE(bytes.length - 2) !== 0xffd9
  )
    throw new BadRequestException(
      "La foto no es válida o supera el tamaño permitido (60 KB).",
    );
  let offset = 2;
  let dimensions = false;
  while (offset + 4 <= bytes.length) {
    if (bytes[offset] !== 0xff) break;
    while (bytes[offset] === 0xff) offset++;
    const marker = bytes[offset++];
    if (marker === 0xda) {
      if (dimensions) return bytes;
      break;
    }
    if (offset + 2 > bytes.length) break;
    const length = bytes.readUInt16BE(offset);
    if (length < 2 || offset + length > bytes.length) break;
    if (marker === 0xc0 || marker === 0xc2) {
      if (length < 8) break;
      const height = bytes.readUInt16BE(offset + 3);
      const width = bytes.readUInt16BE(offset + 5);
      if (!height || !width || width > 1024 || height > 1024)
        throw new BadRequestException(
          "La foto debe medir como máximo 1024 × 1024 píxeles.",
        );
      dimensions = true;
    }
    offset += length;
  }
  throw new BadRequestException(
    "No se pudo reconocer la imagen. Probá con otra foto.",
  );
}

export async function saveProductImage(
  tx: Prisma.TransactionClient,
  organizationId: string,
  productId: string,
  actorId: string,
  content: Buffer | null | undefined,
) {
  if (content === undefined) return;
  if (content === null)
    await tx.productImage.deleteMany({ where: { productId, organizationId } });
  else {
    const bytes = new Uint8Array(content);
    await tx.productImage.upsert({
      where: { productId },
      create: { productId, organizationId, content: bytes },
      update: { content: bytes },
    });
  }
  await tx.auditLog.create({
    data: {
      organizationId,
      actorId,
      entityType: "PRODUCT",
      entityId: productId,
      action:
        content === null ? "PRODUCT_IMAGE_REMOVED" : "PRODUCT_IMAGE_SAVED",
    },
  });
}
