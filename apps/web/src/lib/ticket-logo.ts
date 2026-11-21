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

function validarArchivo(file: File) {
  if (
    !["image/png", "image/jpeg", "image/webp"].includes(file.type) ||
    file.size > 5 * 1024 * 1024
  )
    throw new Error("Elegí una imagen PNG, JPG o WebP de hasta 5 MB.");
}

async function leerImagen(file: File) {
  validarArchivo(file);
  const bitmap = await createImageBitmap(file);
  if (bitmap.width * bitmap.height > 25000000) {
    bitmap.close();
    throw new Error(
      "La imagen es demasiado grande. Usá una de hasta 25 megapíxeles.",
    );
  }
  return bitmap;
}

/**
 * Raster de 128 x 128 en blanco y negro para la impresora térmica, desde los
 * píxeles RGBA. Los grises se simulan con puntos (difusión de error de
 * Floyd-Steinberg) en vez de un corte fijo: antes todo lo más oscuro que un
 * gris claro salía negro y un logo con relleno de color quedaba una mancha
 * (SISTEMA-110). Lo transparente cuenta como blanco.
 */
export function rasterDesdePixeles(rgba: ArrayLike<number>): string {
  const lado = 128;
  const luz = new Float32Array(lado * lado);
  for (let i = 0; i < lado * lado; i++) {
    const alfa = (rgba[i * 4 + 3] ?? 255) / 255;
    const gris =
      (rgba[i * 4] ?? 255) * 0.299 +
      (rgba[i * 4 + 1] ?? 255) * 0.587 +
      (rgba[i * 4 + 2] ?? 255) * 0.114;
    luz[i] = gris * alfa + 255 * (1 - alfa);
  }
  const bytes = new Uint8Array(2048);
  const repartir = (x: number, y: number, error: number) => {
    if (x < 0 || x >= lado || y >= lado) return;
    luz[y * lado + x] = (luz[y * lado + x] ?? 0) + error;
  };
  for (let y = 0; y < lado; y++)
    for (let x = 0; x < lado; x++) {
      const i = y * lado + x;
      const valor = luz[i] ?? 255;
      const negro = valor < 128;
      if (negro) bytes[i >> 3]! |= 128 >> (i % 8);
      const error = valor - (negro ? 0 : 255);
      repartir(x + 1, y, (error * 7) / 16);
      repartir(x - 1, y + 1, (error * 3) / 16);
      repartir(x, y + 1, (error * 5) / 16);
      repartir(x + 1, y + 1, error / 16);
    }
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join(
    "",
  );
}

export async function prepareTicketLogo(file: File): Promise<string> {
  const bitmap = await leerImagen(file);
  try {
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
    return rasterDesdePixeles(context.getImageData(0, 0, 128, 128).data);
  } finally {
    bitmap.close();
  }
}

/**
 * El logo original con sus colores, achicado (lado mayor de 192 px o menos)
 * para la cabecera y la pestaña (SISTEMA-110). Conserva la transparencia. Se
 * achica hasta pesar menos de 60 KB, para que entre en el pedido a la API.
 */
export async function prepararLogoImagen(file: File): Promise<string> {
  const bitmap = await leerImagen(file);
  try {
    for (const lado of [192, 160, 128, 96]) {
      const escala = Math.min(1, lado / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(bitmap.width * escala));
      canvas.height = Math.max(1, Math.round(bitmap.height * escala));
      const context = canvas.getContext("2d");
      if (!context) throw new Error("No se pudo preparar el logo.");
      context.imageSmoothingQuality = "high";
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const webp = canvas.toDataURL("image/webp", 0.9);
      const imagen = webp.startsWith("data:image/webp")
        ? webp
        : canvas.toDataURL("image/png");
      if (imagen.length <= 60_000) return imagen;
    }
    throw new Error("No se pudo achicar el logo. Probá con otra imagen.");
  } finally {
    bitmap.close();
  }
}
