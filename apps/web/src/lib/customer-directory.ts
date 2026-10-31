import type { Party } from "./api";
export function filterCustomers(
  items: Party[],
  query: string,
  listId: string,
  archived: boolean,
  generalId?: string,
) {
  const normalize = (s: string) =>
    s
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();
  const needle = normalize(query.trim());
  return items.filter(
    (c) =>
      (c.active || archived) &&
      (listId === "all" ||
        (listId === "general"
          ? !c.priceListId || c.priceListId === generalId
          : c.priceListId === listId)) &&
      normalize(
        [
          c.name,
          c.document,
          c.billingTaxId,
          c.billingEmail,
          c.billingPhone,
          c.id.slice(0, 8),
        ].join(" "),
      ).includes(needle),
  );
}
