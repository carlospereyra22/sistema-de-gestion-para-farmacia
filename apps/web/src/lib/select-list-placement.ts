const rowHeight = 40;
const maxListHeight = 224;
// Relleno del panel flotante y separación con el campo.
const panelSpace = 22;

/** Decide hacia dónde abre la lista para que no quede cortada por su contenedor. */
export function selectListPlacement(
  optionCount: number,
  spaceBelow: number,
  spaceAbove: number,
) {
  const needed = Math.min(maxListHeight, optionCount * rowHeight) + panelSpace;
  const above = spaceBelow < needed && spaceAbove > spaceBelow;
  const room = (above ? spaceAbove : spaceBelow) - panelSpace;
  return {
    above,
    maxHeight: Math.max(rowHeight * 2, Math.min(maxListHeight, room)),
  };
}
