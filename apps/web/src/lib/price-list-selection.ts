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
