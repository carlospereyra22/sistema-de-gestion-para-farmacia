import { argentinaSaleDate } from "./account-debt-statement";
export function statementPeriod(preset: string, now = new Date()) {
  const today = argentinaSaleDate(now.toISOString())!;
  const [year, month] = today.split("-").map(Number);
  const iso = (date: Date) => date.toISOString().slice(0, 10);
  if (preset === "month") return { from: `${today.slice(0, 7)}-01`, to: today };
  if (preset === "previous")
    return {
      from: iso(new Date(Date.UTC(year!, month! - 2, 1))),
      to: iso(new Date(Date.UTC(year!, month! - 1, 0))),
    };
  if (preset === "30")
    return {
      from: iso(
        new Date(new Date(`${today}T12:00:00Z`).getTime() - 29 * 86400000),
      ),
      to: today,
    };
  return { from: "", to: "" };
}
