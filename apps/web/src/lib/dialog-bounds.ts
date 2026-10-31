export function isOutsideDialog(
  point: { clientX: number; clientY: number },
  bounds: { left: number; right: number; top: number; bottom: number },
): boolean {
  return (
    point.clientX < bounds.left ||
    point.clientX > bounds.right ||
    point.clientY < bounds.top ||
    point.clientY > bounds.bottom
  );
}
