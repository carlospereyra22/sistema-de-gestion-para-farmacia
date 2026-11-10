import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

// El lector de PDF crea su worker pidiendo el archivo cada vez que lee un PDF.
// Sin conexión, si el navegador no lo tiene guardado (en desarrollo no hay
// service worker; en producción, antes de que tome la pestaña), falla con
// "Setting up fake worker failed". Con conexión se carga una vez su código
// (como parte de la app, `?raw`: el archivo tal cual, también en desarrollo,
// donde pedirlo por dirección lo devuelve modificado por Vite) y queda en
// memoria como blob: desde ahí el worker se crea sin red (SISTEMA-76).

const codigoDelWorker = async () =>
  (await import("pdfjs-dist/build/pdf.worker.min.mjs?raw")).default;

let enMemoria: Promise<string> | undefined;

/** Carga el worker una vez por pestaña y lo deja en memoria. */
export function guardarWorkerPdf(
  leer: () => Promise<string> = codigoDelWorker,
  crearUrl: (blob: Blob) => string = (blob) => URL.createObjectURL(blob),
): Promise<string> {
  enMemoria ??= (async () => {
    const codigo = await leer();
    if (!codigo) throw new Error("No se pudo cargar el lector de PDF.");
    return crearUrl(new Blob([codigo], { type: "text/javascript" }));
  })().catch((cause: unknown) => {
    // Se vuelve a intentar la próxima vez.
    enMemoria = undefined;
    throw cause;
  });
  return enMemoria;
}

/** Dirección para `GlobalWorkerOptions.workerSrc`: la copia en memoria si la hay. */
export function direccionDelWorkerPdf(
  leer?: () => Promise<string>,
  crearUrl?: (blob: Blob) => string,
): Promise<string> {
  return guardarWorkerPdf(leer, crearUrl).catch(() => pdfWorkerUrl);
}

/** Sólo para tests. */
export function olvidarWorkerPdf() {
  enMemoria = undefined;
}
