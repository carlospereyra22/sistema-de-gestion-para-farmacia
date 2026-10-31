export function historyPages(
  current: number,
  total: number,
): (number | string)[] {
  const pages = Array.from(
    new Set([1, current - 1, current, current + 1, total]),
  )
    .filter((page) => page >= 1 && page <= total)
    .sort((a, b) => a - b);
  return pages.flatMap((page, index) =>
    index && page - pages[index - 1] > 1 ? [`gap-${page}`, page] : [page],
  );
}
