import JsBarcode from "jsbarcode";

const escape = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        character
      ]!,
  );
export function internalBarcodeSvg(code: string) {
  if (!/^SG\d{12}$/.test(code)) throw new Error("Código interno inválido.");
  const result: { encodings?: { data: string }[] } = {};
  JsBarcode(result, code, { format: "CODE128", displayValue: false });
  const bits = result.encodings?.map((encoding) => encoding.data).join("");
  if (!bits || !/^[01]+$/.test(bits))
    throw new Error("No se pudo dibujar el código.");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${bits.length + 40} 60" role="img" aria-label="${code}" preserveAspectRatio="none"><rect width="100%" height="100%" fill="white"/>${[...bits].map((bit, i) => (bit === "1" ? `<rect x="${i + 20}" y="0" width="1" height="60" fill="black"/>` : "")).join("")}</svg>`;
}
export function barcodeLabelsHtml(
  name: string,
  unit: string,
  code: string,
  copies: number,
) {
  if (!Number.isInteger(copies) || copies < 1 || copies > 210)
    throw new Error("Elegí entre 1 y 210 etiquetas.");
  const svg = internalBarcodeSvg(code);
  const label = `<article><div class="name">${escape(name)}</div><div class="unit">${escape(unit)} · Código interno</div>${svg}<div class="code">${code}</div></article>`;
  const pages = Array.from(
    { length: Math.ceil(copies / 21) },
    (_, page) =>
      `<section>${label.repeat(Math.min(21, copies - page * 21))}</section>`,
  ).join("");
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Etiquetas internas</title><style>@page{size:A4 portrait;margin:10mm}*{box-sizing:border-box}body{margin:0;background:white;color:black;font-family:Arial,sans-serif}section{display:grid;grid-template-columns:repeat(3,62mm);grid-auto-rows:36mm;gap:2mm;width:190mm;break-after:page}section:last-child{break-after:auto}article{border:.15mm dashed #aaa;padding:2mm;text-align:center;break-inside:avoid;display:flex;flex-direction:column;align-items:center;justify-content:center}.name{font-size:8pt;line-height:1.1;overflow-wrap:anywhere}.unit{font-size:7pt;margin:1mm 0}svg{display:block;width:56mm;height:12mm;flex-shrink:0}.code{font:9pt monospace;margin-top:1mm}</style></head><body>${pages}</body></html>`;
}
