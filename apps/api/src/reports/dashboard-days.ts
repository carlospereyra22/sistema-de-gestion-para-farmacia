export function dashboardDays(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const date = ["year", "month", "day"]
    .map((key) => parts.find((part) => part.type === key)!.value)
    .join("-");
  const today = new Date(`${date}T00:00:00-03:00`).getTime();
  return Array.from({ length: 7 }, (_, index) => {
    const start = new Date(today - (6 - index) * 86400000);
    return {
      date: new Date(start.getTime() - 3 * 3600000).toISOString().slice(0, 10),
      start,
      end: new Date(start.getTime() + 86400000),
    };
  });
}
