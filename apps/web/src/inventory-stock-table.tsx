import { ChevronRight } from "lucide-react";
import { Fragment, useState, type ReactNode } from "react";
import {
  CellText,
  DataTable,
  DataTableCell,
  DataTableDetailRow,
  DataTableRow,
  StatusLabel,
  type DataTableColumn,
} from "./data-table";
import type { StockLot } from "./lib/api";
import { NO_SUPPLIER, lotHasSupplierRows } from "./lib/inventory-search";
import type { InventoryRow } from "./lib/inventory-products";
import { inventoryProductDetail } from "./lib/inventory-search";
import { ProductLotsDetail } from "./product-lots-detail";
import { LotMetadataEditor } from "./record-maintenance";

const columns: DataTableColumn[] = [
  { label: "Producto", className: "min-w-60" },
  { label: "Lotes", align: "center", className: "w-16" },
  { label: "Stock", align: "right", className: "w-20" },
  {
    label: "Vendibles",
    align: "right",
    className: "w-24",
    hint: {
      title: "Vendibles",
      text: "Unidades disponibles para vender, sumando todos los lotes del producto. No incluye las vencidas.",
    },
  },
  { label: "Próx. venc.", className: "w-28" },
  { label: "Estado", className: "w-32" },
];

const lotButton =
  "rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-600 transition hover:border-teal-300 hover:bg-teal-50 hover:text-teal-800 focus-visible:outline-2 focus-visible:outline-teal-600";

export function InventoryStockTable({
  rows,
  lotQuery,
  token,
  organizationId,
  branchId,
  done,
  onAdjust,
  onReturn,
  footer,
}: {
  rows: InventoryRow[];
  lotQuery: string;
  token: string;
  organizationId: string;
  branchId: string;
  done: () => void;
  onAdjust: (lot: StockLot) => void;
  onReturn: (lot: StockLot, supplierId?: string) => void;
  footer?: ReactNode;
}) {
  // Al buscar por lote el detalle arranca abierto: estar en toggled significa
  // que el usuario lo cerró, igual que en Productos.
  const [toggled, setToggled] = useState<ReadonlySet<string>>(new Set());
  const searchingLot = Boolean(lotQuery.trim());
  const toggle = (id: string) =>
    setToggled((current) => {
      const next = new Set(current);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  return (
    <DataTable
      label="Existencias por producto"
      columns={columns}
      minWidthClass="min-w-190"
      footer={footer}
    >
      {rows.map((row) => {
        const canExpand = row.lots.length > 0;
        const open =
          canExpand &&
          (searchingLot
            ? !toggled.has(row.productId)
            : toggled.has(row.productId));
        const lotsId = `inventario-lotes-${row.productId}`;
        const nextExpiry = row.leading?.expiresAt;
        return (
          <Fragment key={row.productId}>
            <DataTableRow
              onToggle={canExpand ? () => toggle(row.productId) : undefined}
            >
              <DataTableCell>
                <span className="flex min-w-0 items-start gap-2">
                  {canExpand ? (
                    <button
                      type="button"
                      aria-expanded={open}
                      aria-controls={open ? lotsId : undefined}
                      aria-label={`${open ? "Ocultar" : "Ver"} lotes de ${row.name}`}
                      onClick={() => toggle(row.productId)}
                      className="mt-0.5 grid size-5 shrink-0 place-items-center rounded text-slate-400 hover:bg-teal-50 hover:text-teal-700 focus-visible:outline-2 focus-visible:outline-teal-600"
                    >
                      <ChevronRight
                        size={16}
                        className={`transition-transform ${open ? "rotate-90" : ""}`}
                      />
                    </button>
                  ) : (
                    <span aria-hidden="true" className="size-5 shrink-0" />
                  )}
                  <span className="min-w-0 break-words">
                    <CellText
                      primary={row.name}
                      secondary={inventoryProductDetail(row.product)}
                    />
                  </span>
                </span>
              </DataTableCell>
              <DataTableCell align="center" numeric>
                {row.lots.length + row.hiddenLots}
              </DataTableCell>
              <DataTableCell align="right" numeric>
                <span className="font-semibold text-slate-800">
                  {row.physical}
                </span>{" "}
                <span className="text-xs text-slate-500">un.</span>
              </DataTableCell>
              <DataTableCell align="right" numeric>
                <span
                  className={
                    row.sellable === row.physical
                      ? "text-slate-700"
                      : "font-medium text-rose-700"
                  }
                >
                  {row.sellable}
                </span>
              </DataTableCell>
              <DataTableCell numeric>
                {nextExpiry
                  ? new Date(nextExpiry).toLocaleDateString("es-AR", {
                      timeZone: "UTC",
                    })
                  : row.leading
                    ? "Sin fecha"
                    : "—"}
              </DataTableCell>
              <DataTableCell>
                <StatusLabel tone={row.status.tone}>
                  {row.status.label}
                </StatusLabel>
                {row.status.expiredLots ? (
                  <span className="mt-0.5 block whitespace-nowrap text-xs text-rose-600">
                    {row.status.expiredLots === 1
                      ? "1 lote vencido"
                      : `${row.status.expiredLots} lotes vencidos`}
                  </span>
                ) : null}
              </DataTableCell>
            </DataTableRow>
            {open ? (
              <DataTableDetailRow id={lotsId} colSpan={columns.length}>
                <ProductLotsDetail
                  productName={row.name}
                  lots={row.lots}
                  hidden={row.hiddenLots}
                  actions={(lot) => (
                    <span className="inline-flex items-center justify-end gap-1.5">
                      <LotMetadataEditor
                        compact
                        token={token}
                        organizationId={organizationId}
                        branchId={branchId}
                        lot={lot}
                        done={done}
                      />
                      <button
                        type="button"
                        aria-label={`Ajustar lote ${lot.number} de ${row.name}`}
                        onClick={() => onAdjust(lot)}
                        className={lotButton}
                      >
                        Ajustar
                      </button>
                      {lotHasSupplierRows(lot) ? null : (
                        <button
                          type="button"
                          aria-label={`Devolver lote ${lot.number} de ${row.name}`}
                          onClick={() => onReturn(lot)}
                          className={lotButton}
                        >
                          Devolver
                        </button>
                      )}
                    </span>
                  )}
                  supplierActions={(lot, supplier) =>
                    supplier?.quantity === 0 ? null : (
                      <button
                        type="button"
                        aria-label={`Devolver ${supplier ? `a ${supplier.name}` : "sin proveedor"} lote ${lot.number} de ${row.name}`}
                        onClick={() =>
                          onReturn(lot, supplier?.id ?? NO_SUPPLIER)
                        }
                        className={lotButton}
                      >
                        Devolver
                      </button>
                    )
                  }
                />
              </DataTableDetailRow>
            ) : null}
          </Fragment>
        );
      })}
    </DataTable>
  );
}
