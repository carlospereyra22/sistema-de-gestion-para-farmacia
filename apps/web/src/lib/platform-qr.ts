import QRCode from "qrcode";

/** Módulos del QR, para dibujarlos sin insertar HTML: la imagen contiene el secreto. */
export function qrCells(text: string) {
  const { modules } = QRCode.create(text, { errorCorrectionLevel: "M" });
  const cells: { x: number; y: number }[] = [];
  for (let y = 0; y < modules.size; y += 1)
    for (let x = 0; x < modules.size; x += 1)
      if (modules.get(y, x)) cells.push({ x, y });
  return { size: modules.size, cells };
}
