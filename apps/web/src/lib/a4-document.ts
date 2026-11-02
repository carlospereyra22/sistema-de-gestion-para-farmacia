import type { ThermalTicket } from "@gestion/contracts";
import { fiscalQrSvg } from "./fiscal-qr-image";
import {
  paymentName,
  ticketMoney,
  type ThermalFiscalDetails,
} from "./thermal-ticket";

// Comprobante A4 (SISTEMA-17). Dibuja los mismos datos que el ticket térmico, con la
// plantilla de cada organización; no calcula importes.
export type A4Template = {
  accentColor: string;
  footerText: string;
  logo: string | null;
};

const DEFAULT_ACCENT = "#087f70";

const escape = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
const money = (value: string) => escape(ticketMoney(value));
const multiline = (value: string) => escape(value).replace(/\n/g, "<br>");

// Sólo se aceptan los valores que valida la API; cualquier otro se descarta.
const safeAccent = (value: string) =>
  /^#[0-9a-f]{6}$/i.test(value) ? value : DEFAULT_ACCENT;
const safeLogo = (value: string | null) =>
  value && /^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(value)
    ? value
    : null;

const civilDate = (iso: string) =>
  new Date(iso).toLocaleDateString("es-AR", {
    timeZone: "America/Argentina/Buenos_Aires",
  });

export function a4DocumentHtml(
  ticket: ThermalTicket,
  template: A4Template,
  fiscal?: ThermalFiscalDetails,
): string {
  const accent = safeAccent(template.accentColor);
  const logo = safeLogo(template.logo);
  const title = fiscal
    ? `${fiscal.creditNote ? "Nota de crédito" : "Factura"} ${fiscal.letter}`
    : ticket.kind === "account"
      ? "Recibo"
      : "Comprobante interno";
  const letter = fiscal?.letter ?? "X";
  const number = fiscal?.number ?? ticket.number;
  const row = (label: string, value?: string | null) =>
    value ? `<p><span>${escape(label)}</span> ${escape(value)}</p>` : "";
  const issuer = fiscal
    ? `${row("Razón social:", fiscal.legalName)}${row("Domicilio:", fiscal.address)}${row("Condición IVA:", fiscal.vatCondition)}`
    : `${ticket.store.address ? `<p>${escape(ticket.store.address)}</p>` : ""}${ticket.store.contact ? `<p>${escape(ticket.store.contact)}</p>` : ""}`;
  const voucher = `${row("Fecha:", fiscal?.date ?? civilDate(ticket.date))}${fiscal ? `${row("CUIT:", fiscal.cuit)}${row("Ingresos brutos:", fiscal.grossIncomeId)}${row("Inicio de actividades:", fiscal.activityStart)}` : ""}${row("Sucursal:", ticket.branch)}${row("Atendió:", ticket.cashier)}`;
  const items = ticket.items
    .map(
      (item) =>
        `<tr><td>${escape(item.name)}</td><td class="num">${item.quantity ?? ""}</td><td class="num">${item.unitPriceMinor ? money(item.unitPriceMinor) : ""}</td><td class="num">${money(item.amountMinor)}</td></tr>`,
    )
    .join("");
  const discount =
    ticket.discountMinor && BigInt(ticket.discountMinor) > 0n
      ? `<tr><th>Descuento</th><td>- ${money(ticket.discountMinor)}</td></tr>`
      : "";
  const totals = `<table class="totals">${ticket.subtotalMinor != null ? `<tr><th>Subtotal</th><td>${money(ticket.subtotalMinor)}</td></tr>` : ""}${discount}<tr class="grand"><th>Total</th><td>${money(ticket.totalMinor)}</td></tr></table>`;
  const payments = ticket.payments.length
    ? `<div class="payments"><h3>Forma de pago</h3>${ticket.payments.map((p) => `<p><span>${escape(paymentName(p.method))}</span><span>${money(p.amountMinor)}</span></p>`).join("")}${ticket.balanceAfterMinor != null ? `<p><span>Saldo pendiente</span><span>${money(ticket.balanceAfterMinor)}</span></p>` : ""}</div>`
    : "<div></div>";
  const fiscalBlock = fiscal
    ? `<section class="fiscal">${fiscal.demo ? '<p class="demo">Homologación · Sin validez fiscal</p>' : fiscal.qrUrl ? `<div class="qr">${fiscalQrSvg(fiscal.qrUrl)}</div>` : ""}<div><p><span>${fiscal.demo ? "CAE de homologación:" : "CAE:"}</span> ${escape(fiscal.cae)}</p><p><span>Vencimiento CAE:</span> ${escape(fiscal.caeExpires)}</p>${fiscal.originalNumber ? `<p><span>Comprobante asociado:</span> ${escape(fiscal.originalNumber)}</p>` : ""}</div></section>`
    : ticket.kind === "sale"
      ? '<p class="legend">Documento no válido como factura.</p>'
      : "";
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${escape(`${title} ${number}`)}</title><style>
*{box-sizing:border-box}html,body{margin:0;background:#fff;color:#0f172a;font:10pt/1.4 "Segoe UI",Arial,sans-serif;font-variant-numeric:tabular-nums}
@page{size:A4;margin:12mm}.page{width:186mm;margin:0 auto;position:relative}
header{display:grid;grid-template-columns:1fr 18mm 1fr;border:1px solid #cbd5e1;border-top:4px solid ${accent};border-radius:2mm}
header>div{padding:4mm}.issuer img{max-height:18mm;max-width:60mm;object-fit:contain;display:block;margin-bottom:2mm}
h1{margin:0 0 1mm;font-size:15pt;color:${accent}}p{margin:0}span{color:#475569}
.letter{border-left:1px solid #cbd5e1;border-right:1px solid #cbd5e1;text-align:center;padding:3mm 0!important}
.letter strong{display:block;font-size:24pt;line-height:1;border:1px solid #0f172a;width:12mm;margin:0 auto 1mm;padding:1mm 0}
.letter small{font-size:7pt;color:#475569}.voucher h2{margin:0;font-size:13pt;text-transform:uppercase}.voucher .number{font-size:12pt;font-weight:700;margin-bottom:2mm}
.customer{border:1px solid #cbd5e1;border-radius:2mm;padding:3mm 4mm;margin-top:3mm;display:flex;gap:8mm}
table.items{width:100%;border-collapse:collapse;margin-top:4mm}table.items th{background:${accent};color:#fff;text-align:left;font-size:8.5pt;font-weight:600;padding:2mm}
table.items td{padding:1.8mm 2mm;border-bottom:1px solid #e2e8f0;vertical-align:top}.num{text-align:right!important;white-space:nowrap}
table.items thead{display:table-header-group}table.items tr{break-inside:avoid}
.summary{display:grid;grid-template-columns:1fr 70mm;gap:6mm;margin-top:4mm;break-inside:avoid}
.payments h3{margin:0 0 1mm;font-size:9pt;text-transform:uppercase;color:#475569}.payments p{display:flex;justify-content:space-between;max-width:80mm}
table.totals{width:100%;border-collapse:collapse}table.totals th{text-align:left;font-weight:400;color:#475569;padding:1mm 0}table.totals td{text-align:right;padding:1mm 0;white-space:nowrap}
table.totals .grand th,table.totals .grand td{border-top:2px solid ${accent};font-size:13pt;font-weight:700;color:#0f172a;padding-top:2mm}
.fiscal{display:flex;gap:5mm;align-items:center;border:1px solid #cbd5e1;border-radius:2mm;padding:3mm 4mm;margin-top:5mm;break-inside:avoid}.fiscal .qr svg{width:26mm;height:26mm}
.demo{font-weight:700;color:#b45309}.legend{margin-top:4mm;font-size:8.5pt;color:#475569;text-align:center}.note{margin-top:3mm;font-size:9pt}
footer{margin-top:6mm;padding-top:3mm;border-top:1px solid #cbd5e1;font-size:8.5pt;color:#475569;text-align:center;break-inside:avoid}
.cancelled{position:absolute;top:70mm;left:0;right:0;text-align:center;font-size:48pt;font-weight:800;color:rgba(190,18,60,.18);transform:rotate(-18deg)}
@media screen{body{padding:12mm 0}}@media print{html,body{print-color-adjust:exact;-webkit-print-color-adjust:exact}}
</style></head><body><main class="page">${ticket.cancelled ? '<div class="cancelled" aria-hidden="true">ANULADA</div>' : ""}
<header><div class="issuer">${logo ? `<img src="${logo}" alt="">` : ""}<h1>${escape(ticket.store.name)}</h1>${issuer}</div>
<div class="letter"><strong>${escape(letter)}</strong>${fiscal ? "" : "<small>No válido como factura</small>"}</div>
<div class="voucher"><h2>${escape(title)}</h2><p class="number">N.º ${escape(number)}</p>${voucher}</div></header>
<section class="customer"><p><span>Cliente:</span> <strong>${escape(ticket.customer)}</strong></p>${fiscal?.recipientDocument ? `<p><span>Documento:</span> ${escape(fiscal.recipientDocument)}</p>` : ""}${fiscal?.recipientVatCondition ? `<p><span>IVA:</span> ${escape(fiscal.recipientVatCondition)}</p>` : ""}</section>
<table class="items"><thead><tr><th>Descripción</th><th class="num">Cantidad</th><th class="num">Precio unit.</th><th class="num">Importe</th></tr></thead><tbody>${items}</tbody></table>
<section class="summary">${payments}${totals}</section>
${ticket.note ? `<p class="note">${escape(ticket.note)}</p>` : ""}${fiscalBlock}
${template.footerText.trim() ? `<footer>${multiline(template.footerText.trim())}</footer>` : ""}
</main></body></html>`;
}
