export function scrollSaleIntoView(
  container: Pick<HTMLElement, "scrollTop" | "getBoundingClientRect">,
  sale: Pick<HTMLElement, "getBoundingClientRect">,
) {
  container.scrollTop = Math.max(
    0,
    container.scrollTop +
      sale.getBoundingClientRect().top -
      container.getBoundingClientRect().top,
  );
}
