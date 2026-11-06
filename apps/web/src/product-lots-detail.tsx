import { Fragment, useState, type ReactNode } from "react";
import type { StockLot } from "./lib/api";
import { StatusLabel } from "./data-table";
import { lotHasSupplierRows, lotSupplierSummary } from "./lib/inventory-search";
import type { LotReceiptRow } from "./lib/lot-costs";
import { withStockAvailability } from "./lib/stock-availability";

// Lotes que se ven de entrada; el resto queda detrás de "Ver N más".
const VISIBLE_LOTS = 5;

type DetailLot = Pick<
  StockLot,
  | "id"
  | "number"
  | "quantity"
  | "expiresAt"
  | "expiryStatus"
  | "sellableQuantity"
  | "suppliers"
  | "unassignedQuantity"
>;

// Detalle de lotes que se despliega debajo de un producto en la tabla.
export function ProductLotsDetail<T extends DetailLot>({
  productName,
  lots,
  hidden = 0,
  actions,
  receipts,
  supplierActions,
}: {
  productName: string;
  lots: T[];
  // Lotes del producto que no se muestran por los filtros activos.
  hidden?: number;
  // Con acciones, cada lote suma una columna con lo que se puede hacer con él.
  actions?: (lot: T) => ReactNode;
  // Con receipts, cada lote muestra cuándo entró y qué se pagó: un renglón por
  // recepción, porque un mismo lote puede entrar varias veces.
  receipts?: (lot: T) => LotReceiptRow[];
  // Lo que se puede hacer con las unidades de cada proveedor del lote; null es
  // el stock sin proveedor.
  supplierActions?: (
    lot: T,
    supplier: NonNullable<T["suppliers"]>[number] | null,
  ) => ReactNode;
}) {
  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? lots : lots.slice(0, VISIBLE_LOTS);
  const rest = lots.length - visible.length;
  return (
    <div className={receipts ? "w-full" : actions ? "max-w-3xl" : "max-w-xl"}>
      <table aria-label={`Lotes de ${productName}`} className="w-full text-sm">
        <thead className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          <tr>
            <th scope="col" className="py-1.5 pr-4 text-left">
              Lote
            </th>
            {receipts ? (
              <th scope="col" className="py-1.5 pr-4 text-left">
                Recibido
              </th>
            ) : null}
            <th scope="col" className="py-1.5 pr-4 text-left">
              Vence
            </th>
            <th scope="col" className="py-1.5 pr-4 text-right">
              {receipts ? "En stock" : "Unidades"}
            </th>
            {receipts ? (
              <th scope="col" className="py-1.5 pl-6 pr-4 text-left">
                Costo por unidad
              </th>
            ) : null}
            <th scope="col" className="py-1.5 text-left">
              Estado
            </th>
            {actions ? (
              <th scope="col" className="py-1.5 pl-4 text-right">
                <span className="sr-only">Acciones</span>
              </th>
            ) : null}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-200/70">
          {visible.map((original) => {
            const lot = withStockAvailability(original);
            const [first, ...others] = receipts?.(original) ?? [];
            const span = others.length + 1;
            const lotSuppliers = lot.suppliers ?? [];
            // Sin receipts hay columna de unidades: un renglón por proveedor.
            const supplierRows =
              !receipts && lotHasSupplierRows(lot) ? lotSuppliers : [];
            return (
              <Fragment key={lot.id}>
                <tr>
                  <td rowSpan={span} className="py-1.5 pr-4 text-slate-700">
                    {lot.number}
                    {lotSuppliers.length && !supplierRows.length ? (
                      <span className="block text-xs text-slate-500">
                        {lotSupplierSummary(lot)}
                      </span>
                    ) : null}
                  </td>
                  {first ? (
                    <td className="py-1.5 pr-4 tabular-nums text-slate-700">
                      {first.received}
                    </td>
                  ) : null}
                  <td
                    rowSpan={span}
                    className="py-1.5 pr-4 tabular-nums text-slate-700"
                  >
                    {lot.expiresAt
                      ? new Date(lot.expiresAt).toLocaleDateString("es-AR", {
                          timeZone: "UTC",
                        })
                      : "Sin fecha"}
                  </td>
                  <td
                    rowSpan={span}
                    className="py-1.5 pr-4 text-right font-medium tabular-nums text-slate-800"
                  >
                    {lot.quantity}
                  </td>
                  {first ? (
                    <td className="py-1.5 pl-6 pr-4 tabular-nums text-slate-700">
                      {first.cost}
                    </td>
                  ) : null}
                  <td rowSpan={span} className="py-1.5">
                    {lot.expiryStatus === "EXPIRED" ? (
                      <StatusLabel tone="danger">
                        Vencido · no vendible
                      </StatusLabel>
                    ) : lot.expiryStatus === "EXPIRING_SOON" ? (
                      <StatusLabel tone="warning">Por vencer</StatusLabel>
                    ) : (
                      <StatusLabel tone="ok">Disponible</StatusLabel>
                    )}
                  </td>
                  {actions ? (
                    <td rowSpan={span} className="py-1.5 pl-4 text-right">
                      {actions(original)}
                    </td>
                  ) : null}
                </tr>
                {supplierRows.map((supplier) => (
                  <tr key={supplier.id} className="text-xs text-slate-600">
                    <td className="py-1 pl-3 pr-4">{supplier.name}</td>
                    <td className="py-1 pr-4" />
                    <td className="py-1 pr-4 text-right tabular-nums">
                      {supplier.quantity}
                    </td>
                    <td className="py-1" />
                    {actions ? (
                      <td className="py-1 pl-4 text-right">
                        {supplierActions?.(original, supplier)}
                      </td>
                    ) : null}
                  </tr>
                ))}
                {supplierRows.length && lot.unassignedQuantity ? (
                  <tr className="text-xs text-slate-500">
                    <td className="py-1 pl-3 pr-4">Sin proveedor</td>
                    <td className="py-1 pr-4" />
                    <td className="py-1 pr-4 text-right tabular-nums">
                      {lot.unassignedQuantity}
                    </td>
                    <td className="py-1" />
                    {actions ? (
                      <td className="py-1 pl-4 text-right">
                        {supplierActions?.(original, null)}
                      </td>
                    ) : null}
                  </tr>
                ) : null}
                {others.map((row, index) => (
                  <tr key={index}>
                    <td className="py-1.5 pr-4 tabular-nums text-slate-700">
                      {row.received}
                    </td>
                    <td className="py-1.5 pl-6 pr-4 tabular-nums text-slate-700">
                      {row.cost}
                    </td>
                  </tr>
                ))}
              </Fragment>
            );
          })}
        </tbody>
      </table>
      {rest > 0 || showAll ? (
        <button
          type="button"
          onClick={() => setShowAll((current) => !current)}
          className="mt-1.5 text-xs font-medium text-teal-700 hover:underline"
        >
          {showAll
            ? "Ver menos"
            : `Ver ${rest} ${rest === 1 ? "lote" : "lotes"} más`}
        </button>
      ) : null}
      {hidden > 0 ? (
        <p className="mt-1.5 text-xs text-slate-500">
          {hidden === 1
            ? "1 lote más no se muestra por los filtros."
            : `${hidden} lotes más no se muestran por los filtros.`}
        </p>
      ) : null}
    </div>
  );
}
