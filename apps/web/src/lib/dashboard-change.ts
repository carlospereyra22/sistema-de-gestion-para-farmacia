export function dashboardChange(current: bigint, previous: bigint) {
  if (previous === 0n)
    return {
      direction: current === 0n ? 0 : 1,
      label: current === 0n ? "Sin actividad ambos días" : "Ayer sin actividad",
    };
  const delta = current - previous;
  const absolute = delta < 0n ? -delta : delta;
  const tenths = (absolute * 1000n + previous / 2n) / previous;
  return {
    direction: delta === 0n ? 0 : delta > 0n ? 1 : -1,
    label: `${(tenths / 10n).toLocaleString("es-AR")}${tenths % 10n ? `,${tenths % 10n}` : ""}% vs. ayer`,
  };
}
