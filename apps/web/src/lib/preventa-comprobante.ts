import type { PedidoPreventa } from "./preventa-api";
import {
  COBROS,
  ESTADOS,
  fecha,
  numeroDePedido,
  pesos,
  saldoDelPedido,
  type DatosComprobante,
} from "./preventa";

/**
 * Comprobante del pedido como imagen (SISTEMA-108), para compartirlo por
 * WhatsApp desde el celular. Es un comprobante interno: no es una factura.
 * Se dibuja en un canvas con colores fijos (la imagen se ve igual en modo
 * oscuro y en el teléfono del cliente).
 */

const ANCHO = 720;
const MARGEN = 36;
const ALTO_RENGLON = 46;

const COLOR = {
  fondo: "#ffffff",
  marca: "#0f766e",
  marcaSuave: "#ccfbf1",
  texto: "#0f172a",
  gris: "#64748b",
  linea: "#e2e8f0",
  oferta: "#b45309",
};

/** Alto de la imagen según los renglones (para testear sin canvas). */
export function altoDelComprobante(
  pedido: Pick<PedidoPreventa, "items" | "offers" | "paidMinor" | "notes">,
  nota: string | null,
): number {
  const cabecera = 230;
  const renglones = pedido.items.length * ALTO_RENGLON + 50;
  const ofertas = pedido.offers.length * 30;
  const totales = 70 + (BigInt(pedido.paidMinor) > 0n ? 60 : 0);
  const notas = (pedido.notes ? 50 : 0) + (nota ? 50 : 0);
  return cabecera + renglones + ofertas + totales + notas + 70;
}

/** Corta un texto para que entre en el ancho (con "…"). */
function cortar(ctx: CanvasRenderingContext2D, texto: string, ancho: number) {
  if (ctx.measureText(texto).width <= ancho) return texto;
  let corto = texto;
  while (corto.length > 1 && ctx.measureText(`${corto}…`).width > ancho)
    corto = corto.slice(0, -1);
  return `${corto}…`;
}

export function dibujarComprobante(
  ctx: CanvasRenderingContext2D,
  pedido: PedidoPreventa,
  datos: DatosComprobante,
) {
  const alto = altoDelComprobante(pedido, datos.nota);
  const fuente = (peso: number, tam: number) =>
    `${peso} ${tam}px "Segoe UI", Roboto, Arial, sans-serif`;
  ctx.fillStyle = COLOR.fondo;
  ctx.fillRect(0, 0, ANCHO, alto);
  // Encabezado con el color de la gestión.
  ctx.fillStyle = COLOR.marca;
  ctx.fillRect(0, 0, ANCHO, 120);
  ctx.fillStyle = COLOR.fondo;
  ctx.font = fuente(700, 30);
  ctx.fillText(cortar(ctx, datos.farmacia, ANCHO - MARGEN * 2), MARGEN, 52);
  ctx.font = fuente(400, 17);
  const contacto = [datos.direccion, datos.telefono]
    .filter(Boolean)
    .join(" · ");
  if (contacto)
    ctx.fillText(cortar(ctx, contacto, ANCHO - MARGEN * 2), MARGEN, 86);
  // Número, fecha y estado.
  let y = 160;
  ctx.fillStyle = COLOR.texto;
  ctx.font = fuente(700, 22);
  ctx.fillText(`Pedido ${numeroDePedido(pedido.number)}`, MARGEN, y);
  ctx.textAlign = "right";
  ctx.font = fuente(400, 18);
  ctx.fillStyle = COLOR.gris;
  ctx.fillText(fecha(pedido.createdAt), ANCHO - MARGEN, y);
  ctx.textAlign = "left";
  y += 34;
  ctx.fillStyle = COLOR.texto;
  ctx.font = fuente(600, 19);
  ctx.fillText(
    cortar(ctx, `Cliente: ${pedido.customerName}`, ANCHO - MARGEN * 2 - 160),
    MARGEN,
    y,
  );
  ctx.textAlign = "right";
  ctx.fillStyle = COLOR.marca;
  ctx.fillText(ESTADOS[pedido.status].label, ANCHO - MARGEN, y);
  ctx.textAlign = "left";
  // Renglones.
  y += 30;
  ctx.fillStyle = COLOR.marcaSuave;
  ctx.fillRect(MARGEN, y, ANCHO - MARGEN * 2, 34);
  ctx.fillStyle = COLOR.texto;
  ctx.font = fuente(600, 15);
  ctx.fillText("Cant.", MARGEN + 10, y + 22);
  ctx.fillText("Producto", MARGEN + 80, y + 22);
  ctx.textAlign = "right";
  ctx.fillText("Importe", ANCHO - MARGEN - 10, y + 22);
  ctx.textAlign = "left";
  y += 34;
  for (const item of pedido.items) {
    y += ALTO_RENGLON;
    ctx.fillStyle = COLOR.texto;
    ctx.font = fuente(600, 18);
    ctx.fillText(String(item.quantity), MARGEN + 10, y - 22);
    ctx.font = fuente(400, 18);
    ctx.fillText(
      cortar(ctx, item.productName, ANCHO - MARGEN * 2 - 260),
      MARGEN + 80,
      y - 22,
    );
    ctx.font = fuente(400, 13);
    ctx.fillStyle = COLOR.gris;
    ctx.fillText(`${pesos(item.unitPriceMinor)} c/u`, MARGEN + 80, y - 4);
    ctx.textAlign = "right";
    ctx.font = fuente(600, 18);
    ctx.fillStyle = COLOR.texto;
    // Importe sin ofertas: las ofertas restan abajo y la cuenta cierra a la vista.
    ctx.fillText(
      pesos(BigInt(item.unitPriceMinor) * BigInt(item.quantity)),
      ANCHO - MARGEN - 10,
      y - 22,
    );
    ctx.textAlign = "left";
    ctx.strokeStyle = COLOR.linea;
    ctx.beginPath();
    ctx.moveTo(MARGEN, y + 4);
    ctx.lineTo(ANCHO - MARGEN, y + 4);
    ctx.stroke();
  }
  y += 16;
  for (const oferta of pedido.offers) {
    y += 30;
    ctx.fillStyle = COLOR.oferta;
    ctx.font = fuente(600, 16);
    ctx.fillText(
      cortar(ctx, `Oferta ${oferta.label} · ${oferta.name}`, 480),
      MARGEN + 10,
      y,
    );
    ctx.textAlign = "right";
    ctx.fillText(`-${pesos(oferta.discountMinor)}`, ANCHO - MARGEN - 10, y);
    ctx.textAlign = "left";
  }
  // Totales.
  y += 52;
  ctx.fillStyle = COLOR.texto;
  ctx.font = fuente(700, 26);
  ctx.fillText("Total", MARGEN + 10, y);
  ctx.textAlign = "right";
  ctx.fillText(pesos(pedido.totalMinor), ANCHO - MARGEN - 10, y);
  ctx.textAlign = "left";
  if (BigInt(pedido.paidMinor) > 0n) {
    y += 30;
    ctx.font = fuente(400, 18);
    ctx.fillStyle = COLOR.gris;
    ctx.fillText(
      `Pagado (${COBROS[pedido.paymentStatus].label})`,
      MARGEN + 10,
      y,
    );
    ctx.textAlign = "right";
    ctx.fillText(pesos(pedido.paidMinor), ANCHO - MARGEN - 10, y);
    ctx.textAlign = "left";
    y += 30;
    ctx.fillStyle = COLOR.texto;
    ctx.font = fuente(600, 18);
    ctx.fillText("Saldo", MARGEN + 10, y);
    ctx.textAlign = "right";
    ctx.fillText(pesos(saldoDelPedido(pedido)), ANCHO - MARGEN - 10, y);
    ctx.textAlign = "left";
  }
  ctx.fillStyle = COLOR.gris;
  ctx.font = fuente(400, 15);
  if (pedido.notes) {
    y += 50;
    ctx.fillText(
      cortar(ctx, `Nota: ${pedido.notes}`, ANCHO - MARGEN * 2),
      MARGEN,
      y,
    );
  }
  if (datos.nota) {
    y += 50;
    ctx.fillText(cortar(ctx, datos.nota, ANCHO - MARGEN * 2), MARGEN, y);
  }
  ctx.font = fuente(400, 13);
  ctx.fillText(
    "Comprobante interno de pedido · No válido como factura",
    MARGEN,
    alto - 26,
  );
}

/** El comprobante como PNG (null si el navegador no puede dibujarlo). */
export async function comprobantePng(
  pedido: PedidoPreventa,
  datos: DatosComprobante,
): Promise<Blob | null> {
  const canvas = document.createElement("canvas");
  canvas.width = ANCHO;
  canvas.height = altoDelComprobante(pedido, datos.nota);
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  dibujarComprobante(ctx, pedido, datos);
  return new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
}

/**
 * Comparte la imagen con el menú del teléfono (WhatsApp, etc.). Si el
 * navegador no puede compartir archivos, la descarga.
 */
export async function compartirComprobante(
  pedido: PedidoPreventa,
  datos: DatosComprobante,
): Promise<"compartido" | "descargado" | "cancelado"> {
  const imagen = await comprobantePng(pedido, datos);
  if (!imagen) throw new Error("Este navegador no puede armar la imagen.");
  const nombre = `pedido-${numeroDePedido(pedido.number)}.png`;
  const archivo = new File([imagen], nombre, { type: "image/png" });
  if (navigator.canShare?.({ files: [archivo] })) {
    try {
      await navigator.share({
        files: [archivo],
        title: `Pedido ${numeroDePedido(pedido.number)}`,
      });
      return "compartido";
    } catch (causa) {
      if (causa instanceof DOMException && causa.name === "AbortError")
        return "cancelado";
      throw causa;
    }
  }
  const url = URL.createObjectURL(imagen);
  const link = document.createElement("a");
  link.href = url;
  link.download = nombre;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return "descargado";
}
