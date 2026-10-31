/** Prints only the already escaped ticket frame, never the management screen. */
export async function printTicketFrame(
  frame: HTMLIFrameElement,
): Promise<void> {
  const document = frame.contentDocument;
  const target = frame.contentWindow;
  if (!document || !target)
    throw new Error("La vista previa todavía no está lista.");
  await Promise.all(Array.from(document.images).map((image) => image.decode()));
  if (document.fonts) await document.fonts.ready;
  // A real roll page, sized after images/fonts load. The driver must also be
  // configured for 80 mm / actual size; CSS cannot override printer settings.
  const ticket = document.querySelector<HTMLElement>(".ticket");
  if (ticket) {
    const heightMm = Math.max(
      20,
      Math.ceil((ticket.getBoundingClientRect().height * 25.4) / 96) + 1,
    );
    let page = document.querySelector<HTMLStyleElement>("#ticket-page-size");
    if (!page) {
      page = document.createElement("style");
      page.id = "ticket-page-size";
      document.head.appendChild(page);
    }
    page.textContent = `@page{size:80mm ${heightMm}mm;margin:0}`;
  }
  target.focus();
  target.print();
}
