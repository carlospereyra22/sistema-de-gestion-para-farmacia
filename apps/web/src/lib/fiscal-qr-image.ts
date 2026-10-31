import QRCode from "qrcode";

export function fiscalQrSvg(url: string) {
  const parsed = new URL(url);
  if (
    parsed.origin !== "https://www.arca.gob.ar" ||
    parsed.pathname !== "/fe/qr/" ||
    !parsed.searchParams.get("p") ||
    url.length > 2000
  )
    throw new Error("QR fiscal inválido.");
  const matrix = QRCode.create(url, { errorCorrectionLevel: "M" }).modules;
  const size = matrix.size + 8;
  const squares: string[] = [];
  for (let y = 0; y < matrix.size; y++)
    for (let x = 0; x < matrix.size; x++)
      if (matrix.get(y, x))
        squares.push(`<rect x="${x + 4}" y="${y + 4}" width="1" height="1"/>`);
  return `<svg xmlns="http://www.w3.org/2000/svg" role="img" aria-label="QR fiscal ARCA" viewBox="0 0 ${size} ${size}" style="display:block;width:40mm;height:40mm;margin:3mm auto;break-inside:avoid;shape-rendering:crispEdges"><rect width="${size}" height="${size}" fill="white"/><g fill="black">${squares.join("")}</g></svg>`;
}
