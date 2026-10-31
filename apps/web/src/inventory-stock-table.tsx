import type { CatalogProduct, StockLot } from "./lib/api";
import { inventoryProductDetail } from "./lib/inventory-search";
import { withStockAvailability } from "./lib/stock-availability";
import { LotMetadataEditor } from "./record-maintenance";

export function InventoryStockTable({
  lots,
  products,
  token,
  organizationId,
  branchId,
  done,
}: {
  lots: StockLot[];
  products: ReadonlyMap<string, CatalogProduct>;
  token: string;
  organizationId: string;
  branchId: string;
  done: () => void;
}) {
  return (
    <div className="overflow-x-auto rounded-b-xl">
      <table
        className="w-full min-w-[620px] table-fixed text-left text-sm"
        aria-label="Existencias por lote"
      >
        <thead className="border-b border-slate-100 bg-slate-50/80 text-[11px] font-medium text-slate-500">
          <tr>
            <th scope="col" className="px-4 py-2.5 font-medium">
              Producto
            </th>
            <th scope="col" className="w-28 px-3 py-2.5 font-medium">
              Lote
            </th>
            <th scope="col" className="w-44 px-3 py-2.5 font-medium">
              Vencimiento
            </th>
            <th scope="col" className="w-24 px-3 py-2.5 text-right font-medium">
              Stock
            </th>
            <th scope="col" className="w-14 px-2 py-2.5">
              <span className="sr-only">Acciones</span>
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {lots.map((original) => {
            const lot = withStockAvailability(original);
            return (
              <tr
                key={lot.id}
                className={
                  lot.expiryStatus === "EXPIRED"
                    ? "bg-rose-50/50 hover:bg-rose-50"
                    : "hover:bg-slate-50/60"
                }
              >
                <td className="px-4 py-2.5 align-middle">
                  <p className="break-words font-medium text-slate-800">
                    {lot.productName}
                  </p>
                  <p className="mt-0.5 break-words text-xs leading-4 text-slate-500">
                    {inventoryProductDetail(products.get(lot.productId))}
                  </p>
                </td>
                <td className="break-words px-3 py-2.5 align-middle text-xs text-slate-600">
                  {lot.number}
                </td>
                <td className="px-3 py-2.5 align-middle">
                  <p className="text-xs tabular-nums text-slate-600">
                    {lot.expiresAt
                      ? new Date(lot.expiresAt).toLocaleDateString("es-AR", {
                          timeZone: "UTC",
                        })
                      : "Sin fecha"}
                  </p>
                  {lot.expiryStatus !== "AVAILABLE" && (
                    <span
                      className={`mt-1 inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium leading-4 ${lot.expiryStatus === "EXPIRED" ? "bg-rose-100 text-rose-700" : "bg-amber-100 text-amber-800"}`}
                    >
                      {lot.expiryStatus === "EXPIRED"
                        ? "Vencido · No vendible"
                        : "Próximo · Hasta 90 días"}
                    </span>
                  )}
                </td>
                <td className="px-3 py-2.5 text-right align-middle tabular-nums">
                  <p className="whitespace-nowrap font-semibold text-slate-800">
                    {lot.quantity}{" "}
                    <span className="text-xs font-normal text-slate-500">
                      un.
                    </span>
                  </p>
                  {lot.sellableQuantity !== lot.quantity && (
                    <p className="mt-0.5 text-[11px] text-rose-700">
                      {lot.sellableQuantity} vendibles
                    </p>
                  )}
                </td>
                <td className="px-2 py-2.5 text-center align-middle">
                  <LotMetadataEditor
                    compact
                    token={token}
                    organizationId={organizationId}
                    branchId={branchId}
                    lot={lot}
                    done={done}
                  />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
