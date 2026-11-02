/** Imprime sólo el iframe ya escapado del comprobante A4, nunca la pantalla de gestión. */
export async function printA4Frame(frame: HTMLIFrameElement): Promise<void> {
  const document = frame.contentDocument;
  const target = frame.contentWindow;
  if (!document || !target)
    throw new Error("La vista previa todavía no está lista.");
  // El logo tiene que estar decodificado antes de abrir el diálogo de impresión.
  await Promise.all(Array.from(document.images).map((image) => image.decode()));
  target.focus();
  target.print();
}
