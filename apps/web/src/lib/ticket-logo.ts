/** Fixed 128 x 128 monochrome raster, shared by preview and ESC/POS output. */
export function logoPreview(raster?: string): string {
  if (!raster || !/^[0-9a-f]{4096}$/.test(raster)) return "/logo-remito.png";
  let pixels = "";
  for (let index = 0; index < 2048; index++) {
    const byte = parseInt(raster.slice(index * 2, index * 2 + 2), 16);
    for (let bit = 0; bit < 8; bit++) {
      if (byte & (128 >> bit))
        pixels += `<rect x="${(index % 16) * 8 + bit}" y="${Math.floor(index / 16)}" width="1" height="1"/>`;
    }
  }
  return `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128"><rect width="128" height="128" fill="white"/><g fill="black">${pixels}</g></svg>`)}`;
}

export async function prepareTicketLogo(file: File): Promise<string> {
  if (
    !["image/png", "image/jpeg", "image/webp"].includes(file.type) ||
    file.size > 5 * 1024 * 1024
  )
    throw new Error("Elegí una imagen PNG, JPG o WebP de hasta 5 MB.");
  const bitmap = await createImageBitmap(file);
  try {
    if (bitmap.width * bitmap.height > 25000000)
      throw new Error(
        "La imagen es demasiado grande. Usá una de hasta 25 megapíxeles.",
      );
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 128;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("No se pudo preparar el logo.");
    context.fillStyle = "white";
    context.fillRect(0, 0, 128, 128);
    const scale = Math.min(128 / bitmap.width, 128 / bitmap.height);
    const width = bitmap.width * scale,
      height = bitmap.height * scale;
    context.drawImage(
      bitmap,
      (128 - width) / 2,
      (128 - height) / 2,
      width,
      height,
    );
    const pixels = context.getImageData(0, 0, 128, 128).data;
    const bytes = new Uint8Array(2048);
    for (let i = 0; i < 16384; i++) {
      if (
        pixels[i * 4] * 0.299 +
          pixels[i * 4 + 1] * 0.587 +
          pixels[i * 4 + 2] * 0.114 <
        180
      )
        bytes[i >> 3] |= 128 >> (i % 8);
    }
    return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join(
      "",
    );
  } finally {
    bitmap.close();
  }
}
