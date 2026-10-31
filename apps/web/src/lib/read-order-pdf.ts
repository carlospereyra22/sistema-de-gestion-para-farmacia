import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import ocrWorkerUrl from "tesseract.js/dist/worker.min.js?url";
import type { Worker } from "tesseract.js";
import {
  parseOrderPage,
  orderTotal,
  type ImportLine,
} from "./distribution-import";

export async function readOrderPdf(
  file: File,
  signal: AbortSignal,
  progress: (message: string) => void,
) {
  if (!file.name.toLowerCase().endsWith(".pdf") || file.size > 15 * 1024 * 1024)
    throw new Error("Elegí un PDF de hasta 15 MB.");
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
  const task = pdfjs.getDocument({
    data: new Uint8Array(await file.arrayBuffer()),
  });
  let worker: Worker | undefined;
  const abort = () => {
    void task.destroy();
    if (worker) void worker.terminate();
  };
  signal.addEventListener("abort", abort, { once: true });
  try {
    signal.throwIfAborted();
    const pdf = await task.promise;
    if (pdf.numPages > 10)
      throw new Error("Importá hasta 10 páginas por archivo.");
    // OCR is required for the supplied image-only PDF. No file is sent to a server.
    const { createWorker, PSM } = await import("tesseract.js");
    progress("Preparando reconocimiento de texto…");
    worker = await createWorker("spa", 1, { workerPath: ocrWorkerUrl });
    signal.throwIfAborted();
    await worker.setParameters({ tessedit_pageseg_mode: PSM.AUTO });
    let first: { rows: ImportLine[]; text: string } | undefined;
    for (const resolution of [1800, 2200, 1600]) {
      const rows: ImportLine[] = [];
      const texts: string[] = [];
      for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
        signal.throwIfAborted();
        progress(
          `${resolution === 1800 ? "Leyendo" : "Verificando diferencias:"} página ${pageNumber} de ${pdf.numPages}…`,
        );
        const page = await pdf.getPage(pageNumber);
        const base = page.getViewport({ scale: 1 });
        const viewport = page.getViewport({
          scale: resolution / Math.max(base.width, base.height),
        });
        const canvas = document.createElement("canvas");
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        await page.render({ canvas, viewport }).promise;
        const result = await worker.recognize(canvas);
        texts.push(`Página ${pageNumber}\n${result.data.text}`);
        rows.push(...parseOrderPage(result.data.text, pageNumber));
        canvas.width = 0;
        canvas.height = 0;
        page.cleanup();
        if (rows.length > 250)
          throw new Error("El pedido supera los 250 renglones admitidos.");
      }
      const result = { rows, text: texts.join("\n\n") };
      first ??= result;
      const expected = orderTotal(result.text);
      if (
        expected !== null &&
        rows.reduce((sum, row) => sum + row.quantity, 0) === expected
      )
        return result;
    }
    // Never invent a missing quantity or merge conflicting OCR passes.
    return first!;
  } finally {
    signal.removeEventListener("abort", abort);
    if (worker) await worker.terminate();
    await task.destroy();
  }
}
