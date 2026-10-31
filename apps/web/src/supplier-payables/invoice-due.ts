export function supplierInvoiceDue(
  supplier:
    { accountEnabled?: boolean; accountTermDays?: number | null } | undefined,
  issuedOn: string,
): { mode: "date" | "none"; dueOn: string } {
  const days = supplier?.accountTermDays;
  const date = new Date(`${issuedOn}T00:00:00Z`);
  if (
    !supplier?.accountEnabled ||
    days == null ||
    !Number.isInteger(days) ||
    days < 0 ||
    days > 3650 ||
    !Number.isFinite(date.getTime())
  )
    return { mode: "none", dueOn: "" };
  date.setUTCDate(date.getUTCDate() + days);
  return { mode: "date", dueOn: date.toISOString().slice(0, 10) };
}
