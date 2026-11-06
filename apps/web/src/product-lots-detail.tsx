import { ChevronRight } from "lucide-react";
import { Fragment, useId, useState, type ReactNode } from "react";
import type { StockLot } from "./lib/api";
import { StatusLabel } from "./data-table";
import {
  lotHasSupplierRows,
  lotStockOrigins,
  lotSupplierSummary,
} from "./lib/inventory-search";
import {
  lotHistoryEntries,
  lotLastCost,
  lotMovementGroups,
  type LotReceiptRow,
} from "./lib/lot-costs";
import { withStockAvailability } from "./lib/stock-availability";
import { ReportHelp } from "./report-states";

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

const lotExpiry = (lot: Pick<DetailLot, "expiresAt">) =>
  lot.expiresAt
    ? new Date(lot.expiresAt).toLocaleDateString("es-AR", { timeZone: "UTC" })
    : "Sin fecha";

function LotStatus({ lot }: { lot: Pick<DetailLot, "expiryStatus"> }) {
  if (lot.expiryStatus === "EXPIRED")
    return <StatusLabel tone="danger">Vencido · no vendible</StatusLabel>;
  if (lot.expiryStatus === "EXPIRING_SOON")
    return <StatusLabel tone="warning">Por vencer</StatusLabel>;
  return <StatusLabel tone="ok">Disponible</StatusLabel>;
}

// Una fila por lote. Un clic en cualquier parte abre cada proveedor con sus
// movimientos, para que se vea de quién es cada uno.
export function ProductLotRow({
  lot,
  rows,
  open,
  onToggle,
}: {
  lot: DetailLot;
  rows: LotReceiptRow[];
  open: boolean;
  onToggle: () => void;
}) {
  const detailId = useId();
  const groups = lotMovementGroups(lotStockOrigins(lot), rows);
  const count = lotHistoryEntries(rows).length;
  const expandable = groups.length > 0;
  return (
    <>
      <tr
        onClick={expandable ? onToggle : undefined}
        className={`${open ? "border-b-0" : ""} ${expandable ? "cursor-pointer hover:bg-teal-50/40" : ""}`}
      >
        <td className="py-2 pr-4 text-slate-700">
          <span className="flex items-center gap-1">
            {expandable ? (
              <button
                type="button"
                aria-expanded={open}
                aria-controls={open ? detailId : undefined}
                aria-label={`${open ? "Ocultar" : "Ver"} detalle del lote ${lot.number}`}
                className="grid size-5 shrink-0 place-items-center rounded text-slate-400 hover:text-teal-700 focus-visible:outline-2 focus-visible:outline-teal-600"
              >
                <ChevronRight
                  size={15}
                  aria-hidden
                  className={`transition-transform ${open ? "rotate-90" : ""}`}
                />
              </button>
            ) : (
              <span aria-hidden className="size-5 shrink-0" />
            )}
            {lot.number}
          </span>
        </td>
        <td className="py-2 pr-4 tabular-nums text-slate-700">
          {lotExpiry(lot)}
        </td>
        <td className="py-2 pr-4">
          <LotStatus lot={lot} />
        </td>
        <td className="py-2 pr-6 font-medium tabular-nums text-slate-800">
          Total {lot.quantity}
        </td>
        <td className="border-l border-slate-200 py-2 pl-6 pr-4 text-slate-600">
          {count
            ? `${count} ${count === 1 ? "movimiento" : "movimientos"}`
            : "Sin movimientos"}
        </td>
        <td className="whitespace-nowrap py-2 tabular-nums text-slate-700">
          {lotLastCost(rows)}
        </td>
      </tr>
      {open
        ? groups.map((group, index) => (
            <tr
              key={group.key}
              id={index === 0 ? detailId : undefined}
              className="align-top bg-slate-50/70"
            >
              <td colSpan={3} />
              <td className="py-1.5 pr-6">
                <div className="flex items-baseline justify-between gap-6">
                  <span className="font-medium text-slate-700">
                    {group.name}
                  </span>
                  <span className="font-medium tabular-nums text-slate-800">
                    {group.quantity}
                  </span>
                </div>
              </td>
              <td className="border-l border-slate-200 py-1.5 pl-6 pr-4 tabular-nums text-slate-700">
                {group.rows.map((row, line) => (
                  <p key={line} className="whitespace-nowrap py-0.5">
                    {row.received}
                    {row.adjustment ? (
                      <span className="ml-2 inline-flex items-center gap-1 text-xs text-slate-500">
                        {row.adjustment.returned ? "Devolución" : "Ajuste"}
                        {row.adjustment.reason ? (
                          <ReportHelp
                            floating
                            title={
                              row.adjustment.returned
                                ? "Motivo de la devolución"
                                : "Motivo del ajuste"
                            }
                            text={row.adjustment.reason}
                          />
                        ) : null}
                      </span>
                    ) : null}
                  </p>
                ))}
              </td>
              <td className="py-1.5 tabular-nums text-slate-700">
                {group.rows.map((row, line) => (
                  <p key={line} className="whitespace-nowrap py-0.5">
                    {row.cost}
                  </p>
                ))}
              </td>
            </tr>
          ))
        : null}
    </>
  );
}

function ProductLotEntry({
  lot,
  rows,
}: {
  lot: DetailLot;
  rows: LotReceiptRow[];
}) {
  const [open, setOpen] = useState(false);
  return (
    <ProductLotRow
      lot={lot}
      rows={rows}
      open={open}
      onToggle={() => setOpen((value) => !value)}
    />
  );
}

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
  // Con receipts, cada lote es una fila que despliega lo que tiene cada
  // proveedor y su historial: un lote puede entrar varias veces.
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
    <div
      className={
        receipts ? "w-full overflow-x-auto" : actions ? "max-w-5xl" : "max-w-xl"
      }
    >
      <table aria-label={`Lotes de ${productName}`} className="w-full text-sm">
        <thead className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          {receipts ? (
            <tr>
              <th scope="col" className="py-1.5 pr-4 text-left">
                Lote
              </th>
              <th scope="col" className="py-1.5 pr-4 text-left">
                Vence
              </th>
              <th scope="col" className="py-1.5 pr-4 text-left">
                Estado
              </th>
              <th scope="col" className="min-w-52 py-1.5 pr-6 text-left">
                Stock actual
              </th>
              <th
                scope="col"
                className="border-l border-slate-200 py-1.5 pl-6 pr-4 text-left"
              >
                Historial
              </th>
              <th scope="col" className="py-1.5 text-left">
                Último costo
              </th>
            </tr>
          ) : (
            <tr>
              <th scope="col" className="py-1.5 pr-4 text-left">
                Lote
              </th>
              <th scope="col" className="py-1.5 pr-4 text-left">
                Vence
              </th>
              <th scope="col" className="py-1.5 pr-4 text-right">
                Unidades
              </th>
              <th scope="col" className="py-1.5 text-left">
                Estado
              </th>
              {actions ? (
                <th scope="col" className="py-1.5 pl-4 text-right">
                  <span className="sr-only">Acciones</span>
                </th>
              ) : null}
            </tr>
          )}
        </thead>
        <tbody className="divide-y divide-slate-200/70">
          {visible.map((original) => {
            const lot = withStockAvailability(original);
            if (receipts)
              return (
                <ProductLotEntry
                  key={lot.id}
                  lot={lot}
                  rows={receipts(original)}
                />
              );
            const summary = lotSupplierSummary(lot);
            // Hay columna de unidades: un renglón por origen.
            const originRows = lotHasSupplierRows(lot)
              ? lotStockOrigins(lot)
              : [];
            return (
              <Fragment key={lot.id}>
                <tr>
                  <td className="py-2.5 pr-4 text-slate-700">
                    {lot.number}
                    {summary && !originRows.length ? (
                      <span className="block text-[13px] text-slate-500">
                        {summary}
                      </span>
                    ) : null}
                  </td>
                  <td className="py-2.5 pr-4 tabular-nums text-slate-700">
                    {lotExpiry(lot)}
                  </td>
                  <td className="py-2.5 pr-4 text-right font-medium tabular-nums text-slate-800">
                    {lot.quantity}
                  </td>
                  <td className="py-2.5">
                    <LotStatus lot={lot} />
                  </td>
                  {actions ? (
                    <td className="py-2.5 pl-4 text-right">
                      {actions(original)}
                    </td>
                  ) : null}
                </tr>
                {originRows.map((origin) => (
                  <tr key={origin.key} className="text-slate-600">
                    <td className="py-2 pl-3 pr-4">{origin.name}</td>
                    <td className="py-2 pr-4" />
                    <td className="py-2 pr-4 text-right tabular-nums">
                      {origin.quantity}
                    </td>
                    <td className="py-2" />
                    {actions ? (
                      <td className="py-2 pl-4 text-right">
                        {supplierActions?.(original, origin.supplier)}
                      </td>
                    ) : null}
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
