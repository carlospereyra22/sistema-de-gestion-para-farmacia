export async function prepareProductImage(file: File): Promise<string> {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type))
    throw new Error("Elegí una foto JPG, PNG o WebP.");
  if (file.size > 10 * 1024 * 1024)
    throw new Error("La foto original no puede superar 10 MB.");
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    if (
      !image.naturalWidth ||
      !image.naturalHeight ||
      image.naturalWidth * image.naturalHeight > 40000000
    )
      throw new Error(
        "La foto es demasiado grande. Usá una de menor resolución.",
      );
    for (const size of [800, 640, 480, 320]) {
      const ratio = Math.min(
        1,
        size / Math.max(image.naturalWidth, image.naturalHeight),
      );
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(image.naturalWidth * ratio));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * ratio));
      const context = canvas.getContext("2d");
      if (!context)
        throw new Error("No se pudo preparar la foto en este navegador.");
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      for (const quality of [0.85, 0.7, 0.5]) {
        const result = canvas.toDataURL("image/jpeg", quality);
        if (
          result.startsWith("data:image/jpeg;base64,") &&
          result.length <= 81943
        )
          return result;
      }
    }
    throw new Error("No se pudo optimizar la foto. Probá con otra imagen.");
  } finally {
    URL.revokeObjectURL(url);
  }
}
