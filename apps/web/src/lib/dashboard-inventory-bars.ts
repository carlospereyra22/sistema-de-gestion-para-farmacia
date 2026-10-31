export function dashboardInventoryBars(
  products: { id: string; category: { name: string } | null }[],
  stock: { productId: string; expiresAt: string | null }[],
  now = Date.now(),
) {
  const categories = new Map<string, number>();
  for (const product of products.filter(
    (p) => !stock.some((l) => l.productId === p.id),
  )) {
    const name = product.category?.name ?? "Sin categoría";
    categories.set(name, (categories.get(name) ?? 0) + 1);
  }
  const sorted = [...categories].sort(
    (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
  );
  const missing = sorted
    .slice(0, 4)
    .map(([label, value]) => ({ label, value }));
  if (sorted.length > 4)
    missing.push({
      label: "Otras categorías",
      value: sorted.slice(4).reduce((sum, row) => sum + row[1], 0),
    });
  const expiry = [
    "Vencidos",
    "Hasta 7 días",
    "8 a 14 días",
    "15 a 21 días",
    "22 a 30 días",
  ].map((label) => ({ label, value: 0 }));
  for (const lot of stock) {
    if (!lot.expiresAt) continue;
    const days = (new Date(lot.expiresAt).getTime() - now) / 86400000;
    if (days < 30)
      expiry[
        days < 0 ? 0 : days <= 7 ? 1 : days <= 14 ? 2 : days <= 21 ? 3 : 4
      ]!.value++;
  }
  return {
    missing: missing.length ? missing : [{ label: "Sin faltantes", value: 0 }],
    expiry,
  };
}
