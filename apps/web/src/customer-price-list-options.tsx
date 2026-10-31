export function CustomerPriceListOptions({
  priceListId,
  lists,
}: {
  priceListId: string;
  lists: readonly { id: string; name: string }[];
}) {
  const assignedGeneral = lists.some(
    (list) => list.id === priceListId && list.name === "Precio general",
  );
  return (
    <>
      <option value={assignedGeneral ? priceListId : ""}>Precio general</option>
      {priceListId && !lists.some((list) => list.id === priceListId) && (
        <option value={priceListId}>Lista asignada</option>
      )}
      {lists
        .filter((list) => list.name !== "Precio general")
        .map((list) => (
          <option key={list.id} value={list.id}>
            {list.name}
          </option>
        ))}
    </>
  );
}
