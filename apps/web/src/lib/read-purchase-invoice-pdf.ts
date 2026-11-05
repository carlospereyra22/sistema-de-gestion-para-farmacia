import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import ocrWorkerUrl from "tesseract.js/dist/worker.min.js?url";
import {
  invoiceEmptyMessage,
  invoiceTextLines,
  parseInvoiceLines,
  type InvoiceLine,
} from "./purchase-invoice-pdf";

/**
 * Lee los renglones de una factura PDF en el navegador, sin subirla. Las
 * facturas digitales traen texto; si una página no lo tiene (escaneada) se
 * reconoce con OCR, como en Distribución.
 */
export async function readPurchaseInvoicePdf(
  file: File,
  progress: (message: string) => void,
): Promise<InvoiceLine[]> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
  const task = pdfjs.getDocument({
    data: new Uint8Array(await file.arrayBuffer()),
  });
  let ocr: import("tesseract.js").Worker | undefined;
  try {
    const pdf = await task.promise;
    if (pdf.numPages > 10)
      throw new Error("Importá facturas de hasta 10 páginas.");
    const lines: InvoiceLine[] = [];
    const pages: string[] = [];
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
      progress(`Leyendo página ${pageNumber} de ${pdf.numPages}…`);
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();
      const items = content.items.flatMap((item) =>
        "str" in item
          ? [
              {
                str: item.str,
                x: item.transform[4],
                y: item.transform[5],
                rotated: Math.abs(item.transform[1]) > 0.01,
              },
            ]
          : [],
      );
      let text = invoiceTextLines(items);
      if (text.join("").length < 40) {
        if (!ocr) {
          progress("La factura es una imagen: preparando reconocimiento…");
          const { createWorker } = await import("tesseract.js");
          ocr = await createWorker("spa", 1, { workerPath: ocrWorkerUrl });
        }
        progress(`Reconociendo página ${pageNumber} de ${pdf.numPages}…`);
        const base = page.getViewport({ scale: 1 });
        const viewport = page.getViewport({
          scale: 2000 / Math.max(base.width, base.height),
        });
        const canvas = document.createElement("canvas");
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        await page.render({ canvas, viewport }).promise;
        text = (await ocr.recognize(canvas)).data.text.split("\n");
        canvas.width = 0;
        canvas.height = 0;
      }
      pages.push(...text);
      lines.push(...parseInvoiceLines(text));
      page.cleanup();
    }
    if (!lines.length) throw new Error(invoiceEmptyMessage(pages));
    return lines;
  } finally {
    if (ocr) await ocr.terminate();
    await task.destroy();
  }
}
