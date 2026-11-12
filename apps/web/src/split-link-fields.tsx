import { OptionToggle } from "./option-toggle";
import { SearchableSaleSelect } from "./searchable-sale-select";
import type { CatalogProduct } from "./lib/api";
import { suggestSplitTargets } from "./lib/split-link";

// Abrir cajas (SISTEMA-103): esta caja (ej. Buscapina x100) se abre en otro
// producto del catálogo (Buscapina blíster x10). No toca el stock al guardar.

type SplitLinkProps = {
  enabled: boolean;
  /** El producto que se está editando (o el borrador del alta). */
  product: Pick<
    CatalogProduct,
    "id" | "name" | "presentation" | "laboratory" | "active"
  >;
  products: readonly CatalogProduct[];
  targetId: string;
  factor: string;
  disabled: boolean;
  onEnabled: (value: boolean) => void;
  onTarget: (id: string) => void;
  onFactor: (value: string) => void;
};

export const SPLIT_LINK_OPTIONS_ID = "opciones-abrir-cajas";

export function SplitLinkToggle({
  enabled,
  disabled,
  onEnabled,
}: Pick<SplitLinkProps, "enabled" | "disabled" | "onEnabled">) {
  return (
    <OptionToggle
      label="Se abre en unidades"
      hint="Ej.: caja x100 en blísteres x10, o pack x24 en unidades."
      tone="teal"
      checked={enabled}
      disabled={disabled}
      controls={SPLIT_LINK_OPTIONS_ID}
      onChange={onEnabled}
    />
  );
}

const etiqueta = (p: Pick<CatalogProduct, "name" | "presentation">) =>
  [p.name, p.presentation].filter(Boolean).join(" · ");

export function SplitLinkOptions({
  enabled,
  product,
  products,
  targetId,
  factor,
  disabled,
  onTarget,
  onFactor,
}: SplitLinkProps) {
  if (!enabled) return null;
  const suggestions = suggestSplitTargets(product, products);
  // Antes de escribir se ofrecen sólo las otras presentaciones del mismo
  // producto (Buscapina Duo x10 o x20, nunca Buscapina Perlas). Al escribir
  // se busca en todo el catálogo (ej. caja de 24 shampoos -> el shampoo).
  const current = products.find((p) => p.id === targetId);
  const initial = [
    ...(current && !suggestions.some((s) => s.product.id === current.id)
      ? [current]
      : []),
    ...suggestions.map((s) => s.product),
  ].map((p) => ({ value: p.id, label: etiqueta(p) }));
  const options = products
    .filter((p) => p.id !== product.id && (p.active || p.id === targetId))
    .map((p) => ({ value: p.id, label: etiqueta(p) }));
  return (
    <fieldset
      id={SPLIT_LINK_OPTIONS_ID}
      disabled={disabled}
      className="space-y-3 rounded-xl border border-teal-100 bg-teal-50/40 p-3"
    >
      <legend className="sr-only">Se abre en unidades</legend>
      <p className="text-xs font-semibold uppercase tracking-wide text-teal-800">
        Abrir cajas
      </p>
      {suggestions.length > 0 && !targetId && (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="text-slate-600">Sugerido:</span>
          {suggestions.slice(0, 3).map(({ product: p, factor: f }) => (
            <button
              key={p.id}
              type="button"
              onClick={() => {
                onTarget(p.id);
                if (f) onFactor(String(f));
              }}
              className="rounded-full border border-teal-200 bg-white px-2.5 py-1 font-medium text-teal-800 hover:bg-teal-50"
            >
              {etiqueta(p)}
              {f ? ` · ${f} por caja` : ""}
            </button>
          ))}
        </div>
      )}
      <div className="grid items-end gap-3 sm:grid-cols-[1fr_10rem]">
        <div className="text-xs font-medium text-slate-600">
          <span aria-hidden>Producto que se arma al abrir</span>
          <SearchableSaleSelect
            label="Producto que se arma al abrir"
            value={targetId}
            options={options}
            onChange={onTarget}
            placeholder="Buscá en tu catálogo (ej. blíster x10, shampoo)"
            initialOptions={initial}
            maxResults={50}
            floatingOptions
          />
        </div>
        <label className="block text-xs font-medium text-slate-600">
          Unidades por caja
          <input
            className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-normal disabled:bg-slate-100"
            inputMode="numeric"
            value={factor}
            onChange={(event) => onFactor(event.target.value)}
            placeholder="Ej. 10"
            aria-label="Unidades por caja"
          />
        </label>
      </div>
    </fieldset>
  );
}
