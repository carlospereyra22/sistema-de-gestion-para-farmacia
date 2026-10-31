/** Restore the prior icon on organization change or logout; never retain another tenant's logo. */
export function applyOrganizationFavicon(
  src: string,
  page: Document = document,
) {
  const existing = page.querySelector<HTMLLinkElement>('link[rel="icon"]');
  const icon = existing ?? page.createElement("link");
  const previousHref = icon.getAttribute("href");
  const previousType = icon.getAttribute("type");
  icon.rel = "icon";
  icon.href = src;
  icon.type = src.startsWith("data:image/svg+xml,")
    ? "image/svg+xml"
    : "image/png";
  if (!existing) page.head.appendChild(icon);
  return () => {
    if (!existing) {
      icon.remove();
      return;
    }
    if (previousHref === null) icon.removeAttribute("href");
    else icon.setAttribute("href", previousHref);
    if (previousType === null) icon.removeAttribute("type");
    else icon.setAttribute("type", previousType);
  };
}
