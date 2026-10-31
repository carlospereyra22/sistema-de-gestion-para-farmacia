export function subscribeSalesDataRefresh(
  refresh: () => void,
  windowTarget: Pick<
    Window,
    "addEventListener" | "removeEventListener"
  > = window,
  documentTarget: Pick<
    Document,
    "addEventListener" | "removeEventListener" | "visibilityState"
  > = document,
): () => void {
  const visible = () => {
    if (documentTarget.visibilityState === "visible") refresh();
  };
  refresh();
  windowTarget.addEventListener("focus", visible);
  documentTarget.addEventListener("visibilitychange", visible);
  return () => {
    windowTarget.removeEventListener("focus", visible);
    documentTarget.removeEventListener("visibilitychange", visible);
  };
}
