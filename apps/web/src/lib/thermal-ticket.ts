import type { ThermalTicket } from "@gestion/contracts";
import { fiscalQrSvg } from "./fiscal-qr-image";
import type { AccountReceipt } from "./api";
import { logoPreview } from "./ticket-logo";
import { usesV24StoreName, v24Logo, v24StoreName } from "./v24/header";

export function accountTicket(receipt: AccountReceipt): ThermalTicket {
  return {
    kind: "account",
    id: receipt.id,
    number: receipt.id.slice(0, 8).toUpperCase(),
    date: receipt.createdAt,
    store: receipt.store ?? { name: "" },
    branch: receipt.branchName,
    cashier: receipt.cashier,
    customer: receipt.customerName,
    items: receipt.items.map((item) => ({
      name: item.name,
      amountMinor: item.amountMinor,
    })),
    totalMinor: receipt.amountMinor,
    payments: receipt.payments?.length
      ? receipt.payments
      : [
          {
            method: receipt.method ?? "Sin especificar",
            amountMinor: receipt.amountMinor,
          },
        ],
    balanceAfterMinor: receipt.balanceAfterMinor,
    note: receipt.note,
  };
}
export const paymentName = (method: string) =>
  ({
    CASH: "Efectivo",
    CARD: "Tarjeta",
    TRANSFER: "Transferencia",
    ACCOUNT: "Cuenta corriente",
    OTHER: "Otro",
  })[method] ?? method;
export function ticketMoney(value: string): string {
  const amount = BigInt(value);
  const absolute = amount < 0n ? -amount : amount;
  return `${amount < 0n ? "- " : ""}$ ${(absolute / 100n).toLocaleString("es-AR")},${String(absolute % 100n).padStart(2, "0")}`;
}
const escape = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
const money = (value: string) =>
  escape(ticketMoney(value)).replace(
    "$",
    '<span style="font-weight:400">$</span>',
  );
// Code 39 narrow/wide patterns; same real reference used by the RAW renderer.
const patterns = [
  "nnnwwnwnn",
  "wnnwnnnnw",
  "nnwwnnnnw",
  "wnwwnnnnn",
  "nnnwwnnnw",
  "wnnwwnnnn",
  "nnwwwnnnn",
  "nnnwnnwnw",
  "wnnwnnwnn",
  "nnwwnnwnn",
  "wnnnnwnnw",
  "nnwnnwnnw",
  "wnwnnwnnn",
  "nnnnwwnnw",
  "wnnnwwnnn",
  "nnwnwwnnn",
  "nnnnnwwnw",
  "wnnnnwwnn",
  "nnwnnwwnn",
  "nnnnwwwnn",
  "wnnnnnnww",
  "nnwnnnnww",
  "wnwnnnnwn",
  "nnnnwnnww",
  "wnnnwnnwn",
  "nnwnwnnwn",
  "nnnnnnwww",
  "wnnnnnwwn",
  "nnwnnnwwn",
  "nnnnwnwwn",
  "wwnnnnnnw",
  "nwwnnnnnw",
  "wwwnnnnnn",
  "nwnnwnnnw",
  "wwnnwnnnn",
  "nwwnwnnnn",
  "nwnnnnwnw",
  "wwnnnnwnn",
  "nwwnnnwnn",
  "nwnwnwnnn",
  "nwnwnnnwn",
  "nwnnnwnwn",
  "nnnwnwnwn",
  "nwnnwnwnn",
];
function barcode(value: string): string {
  let x = 10;
  const bars: string[] = [];
  for (const c of `*${value}*`) {
    const pattern =
      patterns["0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ-. $/+%*".indexOf(c)];
    if (!pattern) return "";
    [...pattern].forEach((width, index) => {
      const w = width === "w" ? 3 : 1;
      if (index % 2 === 0)
        bars.push(`<rect x="${x}" width="${w}" height="40"/>`);
      x += w;
    });
    x++;
  }
  return `<svg role="img" aria-label="Código ${escape(value)}" viewBox="0 0 ${x + 10} 40" preserveAspectRatio="none" style="width:${(x + 10) * 0.25}mm;height:7.5mm;max-width:100%;margin-top:3.75mm">${bars.join("")}</svg>`;
}
export interface ThermalFiscalDetails {
  qrUrl?: string;
  creditNote?: boolean;
  originalNumber?: string;
  recipientVatCondition?: string;
  letter: "B" | "C";
  number: string;
  date: string;
  legalName: string;
  cuit: string;
  address: string;
  vatCondition: string;
  grossIncomeId: string;
  activityStart: string;
  recipientDocument?: string;
  cae: string;
  caeExpires: string;
  demo: boolean;
}
export function thermalTicketHtml(
  ticket: ThermalTicket,
  _origin: string,
  fiscal?: ThermalFiscalDetails,
): string {
  // Retained for callers of the previous template; all assets are now embedded.
  void _origin;
  const row = (label: string, value: string) =>
    `<div class="row"><span>${escape(label)}</span><span>${escape(value)}</span></div>`;
  const monetary = (label: string, value: string) =>
    `<div class="row"><span>${escape(label)}</span><span>${money(value)}</span></div>`;
  if (
    fiscal &&
    (!/^\d{14}$/.test(fiscal.cae) || (!fiscal.demo && !fiscal.qrUrl))
  )
    throw new Error(
      "El comprobante fiscal requiere autorización y QR para imprimir.",
    );
  const fiscalTitle = fiscal?.creditNote ? "NOTA DE CRÉDITO " : "FACTURA ";
  const fiscalHeader = fiscal
    ? `<p>${fiscalTitle}${fiscal.letter}${fiscal.demo ? " · PRUEBA</p><p>SIN VALIDEZ FISCAL" : ""}</p>${row("Razón social", fiscal.legalName)}${row("CUIT", fiscal.cuit)}${row("Domicilio fiscal", fiscal.address)}${row("IVA", fiscal.vatCondition)}${fiscal.grossIncomeId ? row("IIBB", fiscal.grossIncomeId) : ""}${row("Inicio de actividades", fiscal.activityStart)}${fiscal.recipientVatCondition ? row("IVA receptor", fiscal.recipientVatCondition) : ""}${fiscal.originalNumber ? row("Factura asociada", fiscal.originalNumber) : ""}`
    : "";
  const fiscalFooter = fiscal
    ? `${row(fiscal.demo ? "CAE de homologación" : "CAE", fiscal.cae)}${row("Vencimiento CAE", fiscal.caeExpires)}${fiscal.demo ? "<p>SIN VALIDEZ FISCAL</p>" : fiscalQrSvg(fiscal.qrUrl!)}`
    : "";
  const rule = `<div class="rule" aria-hidden="true">${"-".repeat(48)}</div>`;
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><style>
  *{box-sizing:border-box}html,body{margin:0;padding:0;background:white;color:#000}.ticket{width:80mm;margin:0 auto;padding:0 4mm 15mm;background:white;font:700 2.5mm/3.75mm "Courier New",Courier,monospace;font-variant-numeric:tabular-nums;overflow-wrap:anywhere}header,footer{text-align:center}header{margin-bottom:3.75mm}h1{font:800 5mm/6mm Arial,sans-serif;margin:3.75mm 0}p{margin:0}.logo{display:block;height:19mm;width:18mm;object-fit:contain;margin:0 auto 3.75mm;image-rendering:pixelated}.logo.custom{width:16mm;height:16mm}.store-name{display:block;width:64mm;height:5.5mm;margin:0 auto 3.75mm;image-rendering:pixelated}.rule{white-space:pre;line-height:3.75mm;margin:0;break-inside:avoid}.row{display:grid;grid-template-columns:max-content minmax(0,1fr);align-items:start;gap:1.5mm;break-inside:avoid}.row>span:last-child{text-align:right;min-width:0}.item{margin:3.75mm 0;break-inside:avoid}.name{text-transform:uppercase}.columns{margin:3.75mm 0}.total{font-size:5mm;line-height:7.5mm}.payment-title{text-align:center}.total .row{gap:0}.reference{margin-top:3.75mm} @page{size:auto;margin:0}@media print{html,body{width:80mm;print-color-adjust:exact;-webkit-print-color-adjust:exact}.ticket{margin:0}.logo{filter:grayscale(1)}}
  </style></head><body><main class="ticket"><header><img class="logo${ticket.store.logoRaster ? " custom" : ""}" src="${escape(ticket.store.logoRaster ? logoPreview(ticket.store.logoRaster) : v24Logo)}" alt="">${usesV24StoreName(ticket.store.name) ? `<img class="store-name" src="${escape(v24StoreName)}" alt="${escape(ticket.store.name)}">` : `<h1>${escape(ticket.store.name)}</h1>`}${ticket.store.address ? `<p>${escape(ticket.store.address)}</p>` : ""}${ticket.store.contact ? `<p>${escape(ticket.store.contact)}</p>` : ""}</header>${rule}
  ${ticket.kind === "account" ? "<p>RECIBO DE CUENTA CORRIENTE</p>" : ""}${ticket.cancelled ? "<p>*** VENTA ANULADA ***</p>" : ""}
  ${fiscalHeader}${row(fiscal ? fiscalTitle + fiscal.letter : ticket.kind === "account" ? "RECIBO" : "TICKET", fiscal ? fiscal.number : "#" + ticket.number)}${row("FECHA", fiscal ? fiscal.date : new Date(ticket.date).toLocaleString("es-AR", { timeZone: "America/Argentina/Buenos_Aires" }))}${ticket.cashier ? row("ATENDIÓ", ticket.cashier) : ""}${row("SUCURSAL", ticket.branch)}${row("CLIENTE", ticket.customer)}${fiscal?.recipientDocument ? row("DOCUMENTO", fiscal.recipientDocument) : ""}${rule}<div class="row columns"><span>PRODUCTO</span><span>${ticket.kind === "account" ? "PAGADO" : "IMPORTE"}</span></div>
  ${ticket.items.map((item) => `<div class="item"><div class="name">${escape(item.name)}</div><div class="row"><span>${item.quantity == null ? "Pagado" : `${item.quantity} x ${money(item.unitPriceMinor!)}`}</span><span>${money(item.amountMinor)}</span></div></div>`).join("")}${!ticket.items.length && ticket.kind === "account" ? "<p>Pago a cuenta corriente</p>" : ""}${rule}
  ${ticket.subtotalMinor != null ? monetary("SUBTOTAL", ticket.subtotalMinor) : ""}${BigInt(ticket.discountMinor ?? "0") > 0n ? monetary("DESCUENTO", ticket.discountMinor!) : ""}${rule}<div class="total">${monetary(ticket.kind === "account" ? "RECIBIDO" : "TOTAL", ticket.totalMinor)}</div>${rule}<p class="payment-title">FORMA DE PAGO</p>
  ${ticket.payments.map((p) => monetary(paymentName(p.method), p.amountMinor)).join("")}${ticket.receivedMinor != null ? monetary("Recibido efectivo", ticket.receivedMinor) : ""}${ticket.changeMinor != null ? monetary("Vuelto", ticket.changeMinor) : ""}${ticket.balanceAfterMinor != null ? monetary("Saldo pendiente al cobrar", ticket.balanceAfterMinor) : ""}${ticket.note ? `<p>${escape(ticket.note)}</p>` : ""}${rule}
  <footer>${fiscalFooter}<p>¡GRACIAS POR TU ${ticket.kind === "account" ? "PAGO" : "COMPRA"}!</p><p>Conservá este comprobante.</p>${barcode(ticket.number)}<p class="reference">#${escape(ticket.number)}</p></footer></main></body></html>`;
}
