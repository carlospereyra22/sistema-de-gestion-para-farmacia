export function scheduleToastDismiss(
  close: () => void,
  variant: "success" | "error",
  paused: boolean,
) {
  if (paused) return;
  const timer = setTimeout(close, variant === "error" ? 6000 : 3000);
  return () => clearTimeout(timer);
}
