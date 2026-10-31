import type { HistoryRow } from "../operation-history";
export function filterHistory(
  rows: HistoryRow[],
  query: string,
  status: string,
  from: string,
  to: string,
) {
  const normalized = (value: string) =>
    value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();
  return rows.filter((row) => {
    const date = new Intl.DateTimeFormat("sv-SE", {
      timeZone: "America/Argentina/Buenos_Aires",
    }).format(new Date(row.date));
    return (
      (!status || row.status === status) &&
      (!from || date >= from) &&
      (!to || date <= to) &&
      normalized([row.title, row.id, ...row.detail].join(" ")).includes(
        normalized(query.trim()),
      )
    );
  });
}
