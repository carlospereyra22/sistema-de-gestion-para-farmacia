import { Fragment } from "react";
import { Check, Plus, X } from "lucide-react";
import type { CatalogProduct, Purchase } from "./lib/api";
import {
  purchasePending,
  receiptLotMax,
  type ReceiptDraft,
} from "./lib/purchases";
import { ProductThumbnail } from "./product-image";

const inputClass =
  "h-9 w-full rounded-md border border-slate-200 bg-white px-2.5 text-sm text-slate-800 outline-none focus:border-teal-500";

function receivedPercent(item: Purchase["items"][number]) {
  if (item.orderedQuantity <= 0) return 0;
  return Math.round(
    Math.min(
      100,
      Math.max(0, (item.receivedQuantity / item.orderedQuantity) * 100),
    ),
  );
}

function productDetail(product: CatalogProduct | undefined) {
  if (!product) return "";
  const unit =
    product.saleUnit === "BOX"
      ? "Caja"
      : product.saleUnit === "BLISTER"
        ? "Blíster"
        : "Unidad";
  return [product.laboratory?.name, product.presentation, unit]
    .filter(Boolean)
    .join(" · ");
}

export function PurchaseReceiptTable({
  token,
  organizationId,
  items,
  products,
  lots,
  search,
  onLotsChange,
  onAddLot,
}: {
  token: string;
  organizationId: string;
  items: Purchase["items"];
  products: CatalogProduct[];
  lots: ReceiptDraft[];
  search: string;
  onLotsChange: (lots: ReceiptDraft[]) => void;
  onAddLot: (itemId: string) => void;
}) {
  const visible = items.filter((item) => {
    const product = products.find((entry) => entry.id === item.productId);
    return (
      !search ||
      `${product?.name ?? "Producto histórico"} ${product?.barcodes.map((barcode) => barcode.code).join(" ") ?? ""}`
        .toLocaleLowerCase("es-AR")
        .includes(search.trim().toLocaleLowerCase("es-AR"))
    );
  });
  const setQuantity = (key: string, quantity: string) =>
    onLotsChange(
      lots.map((row) => (row.key === key ? { ...row, quantity } : row)),
    );
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
      <table className="w-full min-w-[1040px] border-collapse text-left text-sm">
        <thead className="bg-slate-50 text-[11px] font-semibold text-slate-600">
          <tr>
            <th scope="col" className="w-[30%] px-3 py-3">
              Producto
            </th>
            <th scope="col" className="w-[8%] px-2 py-3 text-center">
              Cant. ordenada
            </th>
            <th scope="col" className="w-[8%] px-2 py-3 text-center">
              Ya recibida
            </th>
            <th scope="col" className="w-[8%] px-2 py-3 text-center">
              Pendiente
            </th>
            <th scope="col" className="w-[9%] px-2 py-3">
              Lote
            </th>
            <th scope="col" className="w-[15%] px-2 py-3">
              Vencimiento
            </th>
            <th scope="col" className="w-[12%] px-2 py-3">
              Cant. recibida
            </th>
            <th scope="col" className="w-[10%] px-2 py-3">
              Recepción
            </th>
            <th scope="col" className="w-9 px-1 py-3">
              <span className="sr-only">Acciones</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {visible.map((item) => {
            const product = products.find(
              (entry) => entry.id === item.productId,
            );
            const name = product?.name ?? "Producto histórico";
            const detail = productDetail(product);
            const itemLots = lots.filter((lot) => lot.itemId === item.id);
            const pending = purchasePending(item);
            const percentage = receivedPercent(item);
            const progress =
              item.receivedQuantity >= item.orderedQuantity ? (
                <span className="inline-flex items-center gap-1.5 text-xs font-medium text-teal-700">
                  <Check size={16} aria-hidden="true" /> Recibido
                </span>
              ) : (
                <div className="min-w-20">
                  <div
                    role="progressbar"
                    aria-label={`Recepción de ${name}`}
                    aria-valuemin={0}
                    aria-valuemax={item.orderedQuantity || 1}
                    aria-valuenow={Math.min(
                      item.receivedQuantity,
                      item.orderedQuantity,
                    )}
                    className="h-1.5 overflow-hidden rounded-full bg-slate-200"
                  >
                    <span
                      className="block h-full rounded-full bg-teal-500"
                      style={{ width: `${percentage}%` }}
                    />
                  </div>
                  <span className="mt-1 block text-[11px] tabular-nums text-slate-500">
                    {percentage}% recibido
                  </span>
                </div>
              );
            const productCells = (additional = false) => (
              <>
                <td className="px-3 py-2">
                  {additional ? (
                    <span className="pl-3 text-sm font-medium text-slate-600">
                      Lote adicional
                    </span>
                  ) : (
                    <div className="flex min-w-0 items-center gap-2.5">
                      <ProductThumbnail
                        token={token}
                        organizationId={organizationId}
                        productId={item.productId}
                        name={name}
                        version={product?.image?.updatedAt}
                        preview={false}
                      />
                      <div className="min-w-0">
                        <strong className="block truncate font-semibold leading-5 text-slate-900">
                          {name}
                        </strong>
                        {detail && (
                          <span className="block truncate text-xs text-slate-500">
                            {detail}
                          </span>
                        )}
                      </div>
                    </div>
                  )}
                </td>
                <td className="px-2 py-2 text-center tabular-nums text-slate-700">
                  {additional ? "" : item.orderedQuantity}
                </td>
                <td className="px-2 py-2 text-center tabular-nums text-slate-700">
                  {additional ? "" : item.receivedQuantity}
                </td>
                <td className="px-2 py-2 text-center">
                  {!additional && (
                    <span
                      className={`inline-flex min-w-11 justify-center rounded-full px-2 py-1 text-xs font-semibold tabular-nums ${pending === 0 ? "bg-teal-50 text-teal-700" : "bg-amber-50 text-amber-800"}`}
                    >
                      {pending}
                    </span>
                  )}
                </td>
              </>
            );
            return (
              <Fragment key={item.id}>
                {itemLots.map((lot, index) => {
                  const lotMax = receiptLotMax(item, lots, lot.key);
                  return (
                    <tr
                      key={lot.key}
                      className={`border-t border-slate-200 ${index > 0 ? "bg-slate-50/60" : pending === 0 ? "bg-teal-50/30" : ""}`}
                    >
                      {productCells(index > 0)}
                      <td className="px-2 py-2">
                        <input
                          aria-label={`Número de lote de ${name}, lote ${index + 1}`}
                          className={`${inputClass} !w-32 max-w-full`}
                          maxLength={100}
                          value={lot.lotNumber}
                          onChange={(event) =>
                            onLotsChange(
                              lots.map((row) =>
                                row.key === lot.key
                                  ? { ...row, lotNumber: event.target.value }
                                  : row,
                              ),
                            )
                          }
                        />
                      </td>
                      <td className="px-2 py-2">
                        <input
                          aria-label={`Vencimiento de ${name}, lote ${index + 1}`}
                          type="date"
                          className={inputClass}
                          value={lot.expiresAt}
                          onChange={(event) =>
                            onLotsChange(
                              lots.map((row) =>
                                row.key === lot.key
                                  ? { ...row, expiresAt: event.target.value }
                                  : row,
                              ),
                            )
                          }
                        />
                      </td>
                      <td className="px-2 py-2">
                        <div className="relative w-[88px] max-w-full">
                          <input
                            aria-label={`Cantidad que recibo de ${name}, lote ${index + 1}`}
                            className={`${inputClass} pr-9 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none`}
                            type="number"
                            min="0"
                            step="1"
                            value={lot.quantity}
                            onChange={(event) =>
                              setQuantity(lot.key, event.target.value)
                            }
                          />
                          {lotMax > 0 && Number(lot.quantity) !== lotMax && (
                            <button
                              type="button"
                              aria-label={`Recibir el máximo de ${name}, lote ${index + 1}`}
                              title={`Completar con ${lotMax}`}
                              className="absolute inset-y-0 right-2 text-[11px] font-medium text-slate-400 hover:text-teal-700"
                              onClick={() =>
                                setQuantity(lot.key, String(lotMax))
                              }
                            >
                              máx
                            </button>
                          )}
                        </div>
                      </td>
                      <td className="px-2 py-2">{index === 0 && progress}</td>
                      <td className="px-1 py-2 text-center">
                        <button
                          type="button"
                          aria-label={`Quitar lote ${index + 1} de ${name}`}
                          className="grid size-8 place-items-center rounded-md text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                          onClick={() =>
                            onLotsChange(
                              lots.filter((row) => row.key !== lot.key),
                            )
                          }
                        >
                          <X size={15} aria-hidden="true" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
                {itemLots.length === 0 && (
                  <tr className="border-t border-slate-200">
                    {productCells()}
                    <td
                      colSpan={3}
                      className="px-2 py-2 text-xs text-slate-500"
                    >
                      {pending > 0
                        ? "Agregá un lote para recibir."
                        : "Sin unidades pendientes."}
                    </td>
                    <td className="px-2 py-2">{progress}</td>
                    <td />
                  </tr>
                )}
                {pending > 0 && (
                  <tr className="border-t border-slate-100">
                    <td colSpan={9} className="px-3 py-1.5">
                      <button
                        type="button"
                        aria-label={`Agregar lote a ${name}`}
                        className="inline-flex items-center gap-1.5 px-1 py-1 text-xs font-medium text-slate-500 hover:text-slate-800"
                        onClick={() => onAddLot(item.id)}
                      >
                        <Plus size={14} strokeWidth={1.7} aria-hidden="true" />
                        {itemLots.length ? "Otro lote" : "Agregar lote"}
                      </button>
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
          {visible.length === 0 && (
            <tr>
              <td
                colSpan={9}
                className="px-4 py-10 text-center text-sm text-slate-500"
              >
                No hay productos de esta compra que coincidan con la búsqueda.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
