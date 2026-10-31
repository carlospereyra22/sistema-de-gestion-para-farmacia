import type { DistributionDocument } from "./api";

function escape(value: string | number | null) {
  return String(value ?? "").replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        char
      ]!,
  );
}
export function distributionPrint(doc: DistributionDocument) {
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Salida de distribución</title>
<style>body{font:14px Arial;padding:24px;color:#172b3a}table{width:100%;border-collapse:collapse}td,th{text-align:left;border-bottom:1px solid #ddd;padding:10px}small{color:#555}</style></head><body>
<h1>Salida por distribución</h1><p>Comprobante interno · No es factura ni recibo de pago</p>
<p>${escape(doc.id)}<br>${escape(new Date(doc.createdAt).toLocaleString("es-AR"))}</p>
<p>Destino: ${escape(doc.destination)}<br>Motivo: ${escape(doc.reason)}</p>
${doc.reversedAt ? `<p>REVERTIDA · ${escape(doc.reversalReason)}</p>` : ""}
<table><thead><tr><th>Producto</th><th>Lote</th><th>Cantidad</th></tr></thead><tbody>
${doc.items.map((i) => `<tr><td>${escape(i.productName)}</td><td>${escape(i.lotNumber)}</td><td>${escape(i.quantity)}</td></tr>`).join("")}
</tbody></table></body></html>`;
}
