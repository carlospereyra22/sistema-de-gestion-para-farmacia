import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

// Partes de la app que se bajan aparte la primera vez que se usan (SISTEMA-72):
// lector de PDF y su worker, Excel y Reportes. Con conexión se precargan en
// segundo plano, así sin conexión andan aunque el service worker todavía no
// controle la pestaña (primera visita o versión nueva sin "Actualizar").
// El reconocimiento de texto de PDF escaneados (OCR) baja su idioma de
// internet: sin conexión no anda igual.

export const MODULOS_APARTE: ReadonlyArray<() => Promise<unknown>> = [
  () => import("./read-purchase-invoice-pdf"),
  () => import("./read-order-pdf"),
  () => import("pdfjs-dist"),
  () => import("read-excel-file/browser"),
  () => import("../report-chart"),
];

let precargados: Promise<void> | undefined;

/** Una vez por pestaña; de a uno para no competir con la pantalla. */
export function precargarModulos(
  modulos: ReadonlyArray<() => Promise<unknown>> = MODULOS_APARTE,
  bajar: (url: string) => Promise<unknown> = (url) => fetch(url),
): Promise<void> {
  precargados ??= (async () => {
    for (const modulo of modulos) await modulo().catch(() => undefined);
    // El worker del PDF se pide por dirección, no con import.
    await bajar(pdfWorkerUrl).catch(() => undefined);
  })();
  return precargados;
}

/** Sólo para tests. */
export function olvidarPrecarga() {
  precargados = undefined;
}
