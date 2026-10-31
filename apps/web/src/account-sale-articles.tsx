import { Package } from "lucide-react";
import type { DueSaleDetail } from "./lib/account-due-sale";

const money = (value: string) =>
  (Number(value) / 100).toLocaleString("es-AR", {
    style: "currency",
    currency: "ARS",
  });
export function AccountSaleArticles({ data }: { data: DueSaleDetail }) {
  return (
    <section
      className="account-sale-articles"
      aria-label="Artículos de la venta"
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-slate-800">
          Artículos de la venta
        </h3>
        <span className="text-xs text-slate-400">
          {data.items.length}{" "}
          {data.items.length === 1 ? "artículo" : "artículos"}
        </span>
      </div>
      <ol className="space-y-2.5">
        {data.items.map((item, index) => (
          <li
            key={item.id}
            className="rounded-xl border border-slate-200 bg-white px-3 py-3"
          >
            <div className="flex items-start gap-2.5">
              <span
                aria-hidden="true"
                className="flex size-6 shrink-0 items-center justify-center rounded-md bg-slate-100 text-[10px] font-medium text-slate-500"
              >
                {String(index + 1).padStart(2, "0")}
              </span>
              <h4 className="min-w-0 break-words pt-0.5 text-[12px] font-semibold leading-[18px] text-slate-800">
                {item.name}
              </h4>
            </div>
            <div className="mt-2 flex flex-wrap items-center justify-between gap-x-2 gap-y-1 border-t border-slate-100 pt-2">
              <p className="text-xs leading-5 text-slate-600">
                <span
                  aria-label={`${item.quantity} ${item.quantity === 1 ? "unidad" : "unidades"}`}
                  className="font-semibold text-slate-700"
                >
                  {item.quantity} un.
                </span>
                <span className="px-1 text-slate-400">×</span>
                <span className="font-medium text-slate-700">
                  {money(item.unitPriceMinor)}
                </span>
                <span className="ml-1 text-[10px] text-slate-500">c/u</span>
              </p>
              <strong
                aria-label={`Total: ${money(item.totalMinor)}`}
                className="ml-auto whitespace-nowrap text-[13px] font-semibold tabular-nums text-slate-800"
              >
                {money(item.totalMinor)}
              </strong>
            </div>
            {BigInt(item.discountMinor) > 0n && (
              <p className="mt-1 text-[10px] text-teal-700">
                Descuento aplicado: −{money(item.discountMinor)}
              </p>
            )}
          </li>
        ))}
      </ol>
      {!data.items.length && (
        <div className="py-8 text-center text-slate-400">
          <Package size={24} className="mx-auto mb-2" />
          <p className="text-sm">No hay artículos disponibles.</p>
        </div>
      )}
      <div
        className="mt-4 flex items-center justify-between gap-3 rounded-xl border border-teal-100 bg-teal-50/70 p-3"
        title="Importes originales de la venta, sin modificar por cobros o ajustes de deuda."
      >
        <span className="text-xs font-medium text-teal-800">
          Total original de la venta
        </span>
        <strong className="whitespace-nowrap text-base font-semibold tabular-nums text-teal-800">
          {money(data.totalMinor)}
        </strong>
      </div>
    </section>
  );
}
