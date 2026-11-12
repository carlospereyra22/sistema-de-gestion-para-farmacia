import type { ReactNode } from "react";
import { ShoppingCart, Trash2, WalletCards } from "lucide-react";

const money = (minor: number) =>
  new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS" }).format(
    minor / 100,
  );

export function SaleCurrentPanel({
  lineCount,
  unitCount,
  totalMinor,
  offerSavingsMinor = 0,
  offerControl,
  offerNotice,
  checkoutDisabled,
  submitting,
  headerActions,
  context,
  lines,
  discount,
  onClear,
  onCheckout,
}: {
  lineCount: number;
  unitCount: number;
  totalMinor: number;
  /** Ahorro por ofertas (SISTEMA-103), aparte del descuento general. */
  offerSavingsMinor?: number;
  /** Ver y quitar las ofertas de la venta, junto al ahorro. */
  offerControl?: ReactNode;
  /** "Agregá 1 más y llevás 3x2" y avisos de ofertas que cambiaron. */
  offerNotice?: ReactNode;
  checkoutDisabled: boolean;
  submitting: boolean;
  headerActions?: ReactNode;
  context: ReactNode;
  lines: ReactNode;
  discount: ReactNode;
  onClear: () => void;
  onCheckout: () => void;
}) {
  return (
    <section
      aria-labelledby="sale-current-title"
      className="sale-current-panel flex min-h-[585px] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm lg:h-full lg:min-h-0"
    >
      <header className="flex items-center gap-3 px-5 pb-3 pt-4">
        <span className="grid size-10 shrink-0 place-items-center rounded-[11px] bg-[#e8faf5] text-[#087f70]">
          <ShoppingCart size={20} />
        </span>
        <div className="min-w-0 flex-1">
          <h2
            id="sale-current-title"
            className="text-lg font-semibold leading-6 text-slate-900"
          >
            Venta actual
          </h2>
          <p className="truncate text-xs text-slate-500">
            {lineCount
              ? `${lineCount} producto${lineCount === 1 ? "" : "s"} en el carrito · ${unitCount} unidad${unitCount === 1 ? "" : "es"}`
              : "Agregá productos para comenzar"}
          </p>
        </div>
        {headerActions}
        {lineCount ? (
          <button
            type="button"
            onClick={onClear}
            className="inline-flex h-9 shrink-0 items-center gap-2 whitespace-nowrap rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-600 transition-colors hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700"
          >
            <Trash2 size={15} /> Vaciar venta
          </button>
        ) : null}
      </header>
      <div className="sale-current-context grid grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] gap-3 border-b border-slate-200 px-5 pb-4">
        {context}
      </div>
      {lines}
      {offerNotice}
      {/* Pie en una sola fila: deja el alto disponible para las líneas. */}
      <footer className="sale-current-footer flex shrink-0 flex-wrap items-center gap-x-5 gap-y-3 border-t border-slate-200 bg-slate-50 px-5 py-3">
        {discount}
        {(offerSavingsMinor > 0 || offerControl) && (
          <div className="text-xs font-semibold text-rose-700">
            {offerControl ?? <span>Ahorro por ofertas</span>}
            {offerSavingsMinor > 0 && (
              <span className="block text-base tabular-nums">
                −{money(offerSavingsMinor)}
              </span>
            )}
          </div>
        )}
        <div className="ml-auto text-right">
          <p className="text-xs font-semibold text-slate-600">
            Total a cobrar ({unitCount} unidad{unitCount === 1 ? "" : "es"})
          </p>
          <strong className="sale-current-total block whitespace-nowrap text-[28px] font-bold leading-9 tracking-tight tabular-nums text-[#087f70]">
            {money(totalMinor)}
          </strong>
        </div>
        <button
          type="button"
          disabled={checkoutDisabled}
          onClick={onCheckout}
          // El atajo funciona igual; se muestra como ayuda para no recargar el botón.
          title="Cobrar (Ctrl + Enter)"
          aria-keyshortcuts="Control+Enter"
          className="sale-checkout-button flex min-h-14 items-center justify-center gap-2.5 whitespace-nowrap rounded-xl bg-teal-700 px-6 text-lg font-semibold text-white shadow-sm hover:bg-teal-800 disabled:bg-slate-400"
        >
          <WalletCards size={20} />
          {submitting ? "Confirmando…" : "Cobrar"}
        </button>
      </footer>
    </section>
  );
}
