export function filterPendingSales<T extends { saleId: string }>(
  sales: T[],
  query: string,
): T[] {
  const search = query.trim().toLocaleLowerCase("es-AR");
  return search
    ? sales.filter((sale) =>
        sale.saleId.toLocaleLowerCase("es-AR").includes(search),
      )
    : sales;
}
