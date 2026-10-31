type FullscreenDocument = Pick<
  Document,
  "fullscreenElement" | "fullscreenEnabled" | "exitFullscreen"
> & {
  documentElement: Pick<HTMLElement, "requestFullscreen">;
};

export async function toggleFullscreen(
  doc: FullscreenDocument = document,
): Promise<void> {
  if (doc.fullscreenElement) {
    await doc.exitFullscreen();
    return;
  }
  if (
    !doc.fullscreenEnabled ||
    typeof doc.documentElement.requestFullscreen !== "function"
  ) {
    throw new Error(
      "Este navegador no permite usar pantalla completa desde la aplicación.",
    );
  }
  // Called directly from a click: requesting fullscreen requires user activation.
  await doc.documentElement.requestFullscreen();
}

export function isFullscreen(): boolean {
  return typeof document !== "undefined" && Boolean(document.fullscreenElement);
}

export function subscribeFullscreen(onChange: () => void): () => void {
  document.addEventListener("fullscreenchange", onChange);
  return () => document.removeEventListener("fullscreenchange", onChange);
}
