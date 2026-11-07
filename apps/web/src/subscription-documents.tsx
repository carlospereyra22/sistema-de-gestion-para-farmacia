import { useEffect, useMemo, useState } from "react";
import { Store } from "lucide-react";
import {
  DataTable,
  DataTableCell,
  DataTableEmpty,
  DataTableRow,
  StatusLabel,
} from "./data-table";
import {
  getBranches,
  getSales,
  type BranchListItem,
  type Sale,
} from "./lib/api";
import { usePage } from "./lib/use-page";
import { Pagination } from "./pagination";
import { ProductFilterSelect } from "./product-filter-select";
import { SaleInvoiceDialog } from "./sale-invoice-dialog";
import { ars } from "./supplier-payables/api";

const PAGE_SIZE = 10;

const dateLabel = (value: string | null) =>
  value
    ? new Intl.DateTimeFormat("es-AR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        timeZone: "America/Argentina/Buenos_Aires",
      }).format(new Date(value))
    : "—";

export function SubscriptionInvoicesTable({
  sales,
  onOpen,
}: {
  sales: readonly Sale[];
  onOpen: (saleId: string) => void;
}) {
  const { current, totalPages, setPage, visible } = usePage(sales, PAGE_SIZE);
  return (
    <DataTable
      label="Facturas de la sucursal"
      minWidthClass="min-w-120"
      columns={[
        { label: "Fecha" },
        { label: "Total", align: "right" },
        { label: "Estado" },
        { label: "", align: "right" },
      ]}
      footer={
        sales.length > PAGE_SIZE ? (
          <Pagination
            integrated
            total={sales.length}
            currentPage={current}
            totalPages={totalPages}
            noun="facturas"
            label="Páginas de facturas"
            onChange={setPage}
          />
        ) : undefined
      }
    >
      {visible.length === 0 ? (
        <DataTableEmpty colSpan={4}>
          Esta sucursal no tiene facturas.
        </DataTableEmpty>
      ) : (
        visible.map((sale) => (
          <DataTableRow key={sale.id}>
            <DataTableCell>{dateLabel(sale.completedAt)}</DataTableCell>
            <DataTableCell align="right" numeric>
              {ars(sale.totalMinor)}
            </DataTableCell>
            <DataTableCell>
              <StatusLabel tone={sale.status === "COMPLETED" ? "ok" : "muted"}>
                {sale.status === "COMPLETED" ? "Confirmada" : "Anulada"}
              </StatusLabel>
            </DataTableCell>
            <DataTableCell align="right">
              <button
                type="button"
                className="rounded-lg px-2 py-1 text-sm font-medium text-teal-700 hover:bg-teal-50"
                onClick={() => onOpen(sale.id)}
              >
                Ver factura
              </button>
            </DataTableCell>
          </DataTableRow>
        ))
      )}
    </DataTable>
  );
}

/** Lo que el dueño conserva con la farmacia bloqueada: sus facturas, para consultarlas. */
export function SubscriptionDocuments({
  token,
  organizationId,
}: {
  token: string;
  organizationId: string;
}) {
  const [branches, setBranches] = useState<BranchListItem[]>();
  const [branchId, setBranchId] = useState("");
  const [sales, setSales] = useState<Sale[]>();
  const [error, setError] = useState("");
  const [opened, setOpened] = useState<string>();
  useEffect(() => {
    let active = true;
    getBranches(token, organizationId)
      .then((value) => {
        if (!active) return;
        const usable = value.filter(({ canAccess }) => canAccess !== false);
        setBranches(usable);
        setBranchId(usable[0]?.id ?? "");
      })
      .catch((cause: unknown) => {
        if (active)
          setError(
            cause instanceof Error
              ? cause.message
              : "No se pudieron cargar las sucursales.",
          );
      });
    return () => {
      active = false;
    };
  }, [token, organizationId]);
  useEffect(() => {
    if (!branchId) return;
    let active = true;
    getSales(token, organizationId, branchId)
      .then((value) => {
        if (active) setSales(value);
      })
      .catch((cause: unknown) => {
        if (active)
          setError(
            cause instanceof Error
              ? cause.message
              : "No se pudieron cargar las ventas.",
          );
      });
    return () => {
      active = false;
    };
  }, [token, organizationId, branchId]);
  const invoices = useMemo(
    () =>
      (sales ?? [])
        .filter(({ documentType }) => documentType === "INVOICE")
        .sort((first, second) =>
          (second.completedAt ?? "").localeCompare(first.completedAt ?? ""),
        ),
    [sales],
  );

  return (
    <section className="mt-6">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <h2 className="font-semibold">Facturas</h2>
        {branches && branches.length > 1 && (
          <div className="w-full text-sm sm:w-60">
            <p className="mb-1">Sucursal</p>
            <ProductFilterSelect
              compact
              label="Sucursal"
              value={branchId}
              options={branches.map(({ id, name }) => ({
                value: id,
                label: name,
              }))}
              icon={<Store size={16} />}
              onChange={(value) => {
                setSales(undefined);
                setBranchId(value);
              }}
            />
          </div>
        )}
      </div>
      {error ? (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      ) : sales ? (
        <SubscriptionInvoicesTable sales={invoices} onOpen={setOpened} />
      ) : (
        <p role="status" className="text-sm text-slate-500">
          Cargando facturas…
        </p>
      )}
      {opened && (
        <SaleInvoiceDialog
          token={token}
          organizationId={organizationId}
          branchId={branchId}
          saleId={opened}
          onClose={() => setOpened(undefined)}
        />
      )}
    </section>
  );
}
