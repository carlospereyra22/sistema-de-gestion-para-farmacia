type SaleLot = {
  quantity: number;
  packFactor: number | null;
  packCount: number;
};

// Reparte una línea entre lotes ya ordenados por vencimiento. Las unidades
// vendidas como exhibidor salen primero de los exhibidores cerrados, porque eso
// es lo que deja el estante; el resto sale de lo que vence antes.
export function allocateSaleLots<T extends SaleLot>(
  lots: T[],
  quantity: number,
  packQuantity = 0,
): { lot: T; quantity: number }[] {
  const taken = new Map<T, number>();
  let pack = Math.min(packQuantity, quantity);
  for (const lot of lots) {
    if (!pack) break;
    if (!lot.packFactor) continue;
    const closed =
      Math.min(lot.packCount, Math.floor(lot.quantity / lot.packFactor)) *
      lot.packFactor;
    const units = Math.min(pack, closed);
    if (units) taken.set(lot, units);
    pack -= units;
  }
  let remaining =
    quantity - [...taken.values()].reduce((total, units) => total + units, 0);
  for (const lot of lots) {
    if (!remaining) break;
    const units = Math.min(remaining, lot.quantity - (taken.get(lot) ?? 0));
    if (units) taken.set(lot, (taken.get(lot) ?? 0) + units);
    remaining -= units;
  }
  return lots.flatMap((lot) => {
    const units = taken.get(lot);
    return units ? [{ lot, quantity: units }] : [];
  });
}
