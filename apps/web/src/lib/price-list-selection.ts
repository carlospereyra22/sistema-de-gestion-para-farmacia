/**
 * Lista con la que se cobra, en el mismo orden que la API: la elegida en la
 * venta, la asignada al cliente y, si no hay ninguna, Precio general.
 */
export function effectiveSalePriceListId(
  lists: { id: string; name: string }[],
  selectedId: string,
  customerListId?: string | null,
): string {
  return (
    selectedId ||
    customerListId ||
    lists.find((list) => list.name === "Precio general")?.id ||
    ""
  );
}

/** La lista del cliente siempre se muestra, aunque no llegue en el listado. */
export function salePriceListOptions(
  lists: { id: string; name: string }[],
  activeId: string,
) {
  const options = lists.map((list) => ({ value: list.id, label: list.name }));
  return activeId && !lists.some((list) => list.id === activeId)
    ? [...options, { value: activeId, label: "Lista asignada" }]
    : options;
}

/** A token refresh must never move a draft to another list. */
export function preservePriceListSelection(
  lists: { id: string; name: string }[],
  selectedId: string,
): string {
  return lists.some((list) => list.id === selectedId)
    ? selectedId
    : (lists.find((list) => list.name === "Precio general")?.id ??
        lists[0]?.id ??
        "");
}
