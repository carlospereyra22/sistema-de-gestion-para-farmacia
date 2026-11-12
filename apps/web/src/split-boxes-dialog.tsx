import { useRef, useState } from "react";
import { ArrowRight, Minus, Package, PackageOpen, Plus } from "lucide-react";
import {
  PayableDialog,
  field,
  primary,
  secondary,
} from "./supplier-payables/dialog";
import { ProductFilterSelect } from "./product-filter-select";
import { SearchableSaleSelect } from "./searchable-sale-select";
import { splitBoxes, type CatalogProduct, type StockLot } from "./lib/api";
import {
  productLabel,
  splitSummary,
  splitTargetOptions,
  splittableLots,
} from "./lib/split-boxes";

export type SplitTargetOption = {
  id: string;
  label: string;
  /** Unidades por caja conocidas (vínculo o sugerencia); null: se escribe. */
  factor: number | null;
};

export type SplitRequest = {
  requestId: string;
  lotId: string;
  boxes: number;
  targetProductId: string;
  factor: number;
};

// Abrir cajas (SISTEMA-103): N cajas de un lote pasan a otra presentación
// (la del vínculo u otra elegida al abrir), con el mismo lote y vencimiento.
// Sin conexión queda en la PC y se manda al volver.
export function SplitBoxesDialog({
  boxName,
  targets,
  catalog = [],
  lots,
  initialLotId,
  online,
  onSubmit,
  onClose,
}: {
  boxName: string;
  /** Sugeridos: el primero es el del vínculo del producto, si lo tiene. */
  targets: SplitTargetOption[];
  /** El resto del catálogo, para buscar cualquier producto al escribir. */
  catalog?: SplitTargetOption[];
  /** Lotes de la caja con stock vendible. */
  lots: StockLot[];
  initialLotId?: string;
  online: boolean;
  onSubmit: (input: SplitRequest) => Promise<void>;
  onClose: () => void;
}) {
  const [lotId, setLotId] = useState(initialLotId ?? lots[0]?.id ?? "");
  const [boxes, setBoxes] = useState(1);
  const [targetId, setTargetId] = useState(targets[0]?.id ?? "");
  const [factorText, setFactorText] = useState(
    targets[0]?.factor ? String(targets[0].factor) : "",
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const pending = useRef(false);
  // Un mismo intento (lote, cantidad y destino) reusa su clave: reintentar tras
  // perder la respuesta no abre las cajas dos veces.
  const requests = useRef(new Map<string, string>());
  const lot = lots.find((item) => item.id === lotId);
  const target = [...targets, ...catalog].find((item) => item.id === targetId);
  const factor = Number(factorText);
  const factorValid = Number.isInteger(factor) && factor >= 2 && factor <= 1000;
  const maximum = lot?.sellableQuantity ?? 0;
  const boxesValid = !!lot && boxes >= 1 && boxes <= maximum;
  const valid = boxesValid && !!target && factorValid;
  const close = () => {
    if (!pending.current) onClose();
  };
  return (
    <PayableDialog title="Abrir cajas" onClose={close}>
      <p className="flex items-center gap-2 text-sm text-slate-600">
        <PackageOpen size={18} className="text-teal-700" aria-hidden />
        <span>
          Caja: <strong className="text-slate-800">{boxName}</strong>
        </span>
      </p>
      {lots.length ? (
        <>
          <div className="mt-4 grid items-end gap-3 sm:grid-cols-[1fr_10rem]">
            <div className="text-sm text-slate-600">
              <span aria-hidden>Abrir en</span>
              <SearchableSaleSelect
                label="Abrir en"
                value={targetId}
                options={catalog.map((item) => ({
                  value: item.id,
                  label: item.label,
                }))}
                initialOptions={targets.map((item) => ({
                  value: item.id,
                  label: item.label,
                }))}
                maxResults={50}
                onChange={(value) => {
                  setTargetId(value);
                  const known = [...targets, ...catalog].find(
                    (item) => item.id === value,
                  );
                  setFactorText(known?.factor ? String(known.factor) : "");
                }}
                placeholder="Buscá en tu catálogo (ej. blíster x10, shampoo)"
                floatingOptions
              />
            </div>
            <label className="block text-sm text-slate-600">
              Unidades por caja
              <input
                className={`${field} mt-1 text-center tabular-nums`}
                inputMode="numeric"
                aria-label="Unidades por caja"
                placeholder="Ej. 10"
                value={factorText}
                onChange={(event) => setFactorText(event.target.value)}
              />
            </label>
          </div>
          <div className="mt-3 grid items-end gap-3 sm:grid-cols-[1fr_10rem]">
            <ProductFilterSelect
              label="Lote"
              icon={<Package size={18} />}
              value={lotId}
              options={lots.map((item) => ({
                value: item.id,
                label: `${item.number} · ${item.sellableQuantity} ${
                  item.sellableQuantity === 1 ? "caja" : "cajas"
                }${item.expiresAt ? ` · vence ${item.expiresAt.slice(5, 7)}/${item.expiresAt.slice(0, 4)}` : ""}`,
              }))}
              onChange={(value) => {
                setLotId(value);
                setBoxes(1);
              }}
            />
            <label className="block text-sm text-slate-600">
              Cajas a abrir
              <div className="mt-1 flex items-center gap-1">
                <button
                  type="button"
                  className={`${secondary} w-10 shrink-0 px-0`}
                  aria-label="Una caja menos"
                  disabled={boxes <= 1}
                  onClick={() => setBoxes(boxes - 1)}
                >
                  <Minus size={15} />
                </button>
                <input
                  className={`${field} text-center tabular-nums`}
                  inputMode="numeric"
                  aria-label="Cajas a abrir"
                  value={boxes}
                  onChange={(event) =>
                    setBoxes(
                      Math.max(0, Math.trunc(Number(event.target.value) || 0)),
                    )
                  }
                />
                <button
                  type="button"
                  className={`${secondary} w-10 shrink-0 px-0`}
                  aria-label="Una caja más"
                  disabled={boxes >= maximum}
                  onClick={() => setBoxes(boxes + 1)}
                >
                  <Plus size={15} />
                </button>
              </div>
            </label>
          </div>
        </>
      ) : (
        <p className="mt-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
          No hay cajas para abrir en esta sucursal (sin stock o vencidas).
        </p>
      )}
      {lot &&
        (valid && target ? (
          <SplitPreview
            boxName={boxName}
            targetName={target.label}
            lot={lot}
            boxes={boxes}
            factor={factor}
          />
        ) : (
          <p
            aria-live="polite"
            className="mt-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800"
          >
            {!target
              ? "Elegí en qué presentación abrir la caja."
              : !factorValid
                ? "Indicá cuántas unidades trae cada caja (de 2 a 1000)."
                : `Elegí entre 1 y ${maximum} ${maximum === 1 ? "caja" : "cajas"}.`}
          </p>
        ))}
      {!online && (
        <p className="mt-3 text-sm text-slate-600">
          Sin conexión: se guarda en la PC, el stock cambia ya y se manda solo
          al volver internet.
        </p>
      )}
      {error && (
        <p role="alert" className="mt-3 text-sm text-rose-700">
          {error}
        </p>
      )}
      <footer className="mt-6 flex justify-end gap-2">
        <button
          type="button"
          className={secondary}
          disabled={busy}
          onClick={close}
        >
          Cancelar
        </button>
        <button
          type="button"
          className={primary}
          disabled={!valid || busy}
          onClick={async () => {
            if (pending.current || !lot || !target) return;
            const key = `${lot.id}:${boxes}:${target.id}:${factor}`;
            const requestId = requests.current.get(key) ?? crypto.randomUUID();
            requests.current.set(key, requestId);
            pending.current = true;
            setBusy(true);
            setError("");
            try {
              await onSubmit({
                requestId,
                lotId: lot.id,
                boxes,
                targetProductId: target.id,
                factor,
              });
            } catch (cause) {
              setError(
                cause instanceof Error
                  ? cause.message
                  : "No se pudieron abrir las cajas.",
              );
            } finally {
              pending.current = false;
              setBusy(false);
            }
          }}
        >
          <PackageOpen size={16} />
          {busy
            ? "Abriendo…"
            : `Abrir ${boxes === 1 ? "1 caja" : `${boxes} cajas`}`}
        </button>
      </footer>
    </PayableDialog>
  );
}

/** Qué sale y qué entra al abrir, con el lote que se conserva. */
function SplitPreview({
  boxName,
  targetName,
  lot,
  boxes,
  factor,
}: {
  boxName: string;
  targetName: string;
  lot: StockLot;
  boxes: number;
  factor: number;
}) {
  const vence = lot.expiresAt
    ? `vence ${lot.expiresAt.slice(5, 7)}/${lot.expiresAt.slice(0, 4)}`
    : "sin vencimiento";
  const badge =
    "shrink-0 rounded-md px-1.5 py-0.5 text-xs font-semibold tabular-nums";
  return (
    <div
      aria-live="polite"
      className="mt-4 rounded-lg border border-teal-100 bg-teal-50/50 px-3 py-2"
    >
      <p className="sr-only">
        {splitSummary(boxName, targetName, lot, boxes, factor)}
      </p>
      <div aria-hidden className="flex min-w-0 items-center gap-2 text-sm">
        <span
          className={`${badge} bg-white text-slate-700 ring-1 ring-slate-200`}
        >
          −{boxes}
        </span>
        <span className="min-w-0 truncate text-slate-700" title={boxName}>
          {boxName}
        </span>
        <ArrowRight size={15} className="shrink-0 text-teal-600" />
        <span className={`${badge} bg-teal-700 text-white`}>
          +{boxes * factor}
        </span>
        <span className="min-w-0 truncate text-slate-800" title={targetName}>
          {targetName}
        </span>
      </div>
      <p aria-hidden className="mt-1 text-xs text-slate-500">
        Lote {lot.number} · {vence} · se conserva
      </p>
    </div>
  );
}

/**
 * El diálogo armado para un producto: en qué se puede abrir (el vínculo
 * primero), sus lotes vendibles y la llamada a la API. Se usa desde
 * Inventario y Productos.
 */
export function ProductSplitDialog({
  token,
  organizationId,
  branchId,
  product,
  products,
  stock,
  initialLotId,
  onDone,
  onClose,
}: {
  token: string;
  organizationId: string;
  branchId: string;
  product: CatalogProduct;
  products: readonly CatalogProduct[];
  stock: readonly StockLot[];
  initialLotId?: string;
  onDone: (message: string) => void;
  onClose: () => void;
}) {
  const targets = splitTargetOptions(product, products);
  const catalog = products
    .filter((p) => p.id !== product.id && p.active)
    .map((p) => ({ id: p.id, label: productLabel(p), factor: null }));
  return (
    <SplitBoxesDialog
      boxName={productLabel(product)}
      targets={targets}
      catalog={catalog}
      lots={splittableLots(stock, product.id)}
      initialLotId={initialLotId}
      online={typeof navigator === "undefined" || navigator.onLine}
      onClose={onClose}
      onSubmit={async (input) => {
        const result = await splitBoxes(token, organizationId, branchId, input);
        const label =
          [...targets, ...catalog].find(
            (item) => item.id === input.targetProductId,
          )?.label ?? "";
        const cajas = result.boxes === 1 ? "1 caja" : `${result.boxes} cajas`;
        onDone(
          result.enLaPc
            ? `Guardado en la PC: ${cajas} abiertas (+${result.units} ${label}). Se manda al volver la conexión.`
            : `Se abrieron ${cajas}: +${result.units} ${label}.`,
        );
      }}
    />
  );
}
