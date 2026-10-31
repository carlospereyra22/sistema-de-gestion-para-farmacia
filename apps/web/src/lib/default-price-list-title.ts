export function defaultPriceListTitle(date = new Date()): string {
  const parts = new Intl.DateTimeFormat("es-AR", {
    month: "long",
    year: "numeric",
    timeZone: "America/Argentina/Buenos_Aires",
  }).formatToParts(date);
  return `Lista ${parts.find((part) => part.type === "month")?.value} ${parts.find((part) => part.type === "year")?.value}`;
}
