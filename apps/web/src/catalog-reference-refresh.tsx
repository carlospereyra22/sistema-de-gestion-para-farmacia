import { useId, useRef, useState } from "react";
import { RefreshCw } from "lucide-react";
import { refreshCatalogPriceReferences, type CatalogProduct } from "./lib/api";
import { StatusToast } from "./status-toast";

export function CatalogReferenceRefresh({
  token,
  organizationId,
  products,
  done,
  error,
  compact = false,
}: {
  token: string;
  organizationId: string;
  products: Pick<
    CatalogProduct,
    | "externalReferenceSource"
    | "externalReferenceName"
    | "externalReferenceCheckedAt"
  >[];
  done: () => void;
  error: (message: string) => void;
  compact?: boolean;
}) {
  const tooltipId = useId();
  const refreshGate = useRef(false);
  const [priceRefreshLoading, setPriceRefreshLoading] = useState(false);
  const [priceRefreshResult, setPriceRefreshResult] = useState("");
  const refreshPriceReferences = async () => {
    if (refreshGate.current) return;
    refreshGate.current = true;
    setPriceRefreshLoading(true);
    setPriceRefreshResult("");
    try {
      const result = await refreshCatalogPriceReferences(token, organizationId);
      done();
      setPriceRefreshResult(
        result.skipped
          ? "Ya hay una actualización de precios en curso."
          : `Actualización completada. ${result.checked} ${result.checked === 1 ? "producto revisado" : "productos revisados"} · ${result.updated === 0 ? "Sin cambios de precio" : `${result.updated} ${result.updated === 1 ? "precio actualizado" : "precios actualizados"}`}.`,
      );
    } catch (cause) {
      error(
        cause instanceof Error
          ? cause.message
          : "No se pudieron actualizar las referencias de precios.",
      );
    } finally {
      refreshGate.current = false;
      setPriceRefreshLoading(false);
    }
  };
  const trackedProducts = products.filter(
    (product) =>
      product.externalReferenceSource && product.externalReferenceName,
  );
  const lastReferenceCheck = trackedProducts
    .map((product) => product.externalReferenceCheckedAt)
    .filter(
      (value): value is string =>
        Boolean(value) && Number.isFinite(Date.parse(value!)),
    )
    .sort((a, b) => Date.parse(a) - Date.parse(b))
    .at(-1);
  const lastReviewLabel = lastReferenceCheck
    ? new Date(lastReferenceCheck).toLocaleString("es-AR", {
        timeZone: "America/Argentina/Buenos_Aires",
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      })
    : undefined;

  return (
    <>
      {compact ? (
        <div className="group relative flex shrink-0 items-center gap-2">
          <div className="hidden w-[112px] text-right leading-tight sm:block">
            <p className="text-xs font-medium text-slate-700">
              Última actualización
            </p>
            <p
              aria-live="polite"
              className="mt-1 whitespace-nowrap text-[11px] tabular-nums text-slate-500"
            >
              {priceRefreshLoading
                ? "Revisando precios…"
                : lastReviewLabel
                  ? new Date(lastReferenceCheck!).toLocaleDateString("es-AR", {
                      timeZone: "America/Argentina/Buenos_Aires",
                      day: "2-digit",
                      month: "2-digit",
                      year: "numeric",
                    })
                  : "Sin registro"}
            </p>
          </div>
          <button
            type="button"
            aria-label={
              priceRefreshLoading
                ? "Revisando precios de referencia"
                : "Actualizar precios de referencia"
            }
            aria-describedby={tooltipId}
            onClick={() => void refreshPriceReferences()}
            disabled={priceRefreshLoading}
            aria-busy={priceRefreshLoading}
            className="grid size-10 shrink-0 place-items-center rounded-xl border border-slate-200 bg-white text-slate-500 shadow-sm transition-colors hover:border-teal-200 hover:bg-teal-50/50 hover:text-teal-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:ring-offset-2 disabled:cursor-wait disabled:text-teal-600"
          >
            <RefreshCw
              size={17}
              className={priceRefreshLoading ? "animate-spin" : ""}
            />
          </button>
          <div
            id={tooltipId}
            role="tooltip"
            className="pointer-events-none absolute right-0 top-full z-50 mt-2 w-60 rounded-xl border border-slate-200 bg-white p-3 text-xs text-slate-600 shadow-lg invisible group-hover:visible group-focus-within:visible"
          >
            <p className="font-semibold text-slate-800">
              Precios de referencia
            </p>
            <p className="mt-1">
              {lastReferenceCheck
                ? `Última revisión: ${new Date(lastReferenceCheck).toLocaleString("es-AR", { timeZone: "America/Argentina/Buenos_Aires" })}`
                : "Sin revisión registrada"}
            </p>
            <p className="mt-1">
              {trackedProducts.length} productos vinculados
            </p>
            <p className="mt-1">
              Revisión automática: 09:00 y 17:00 (Argentina), con el servidor
              encendido.
            </p>
            <p className="mt-2 border-t border-slate-100 pt-2 text-[11px] leading-relaxed text-slate-500">
              Es la revisión más reciente de los productos vinculados; no
              implica que todos se hayan revisado ni que sus precios hayan
              cambiado.
            </p>
          </div>
        </div>
      ) : (
        <div className="workspace-reference-action flex h-11 items-center gap-2 rounded-lg border border-slate-200 bg-white px-2.5 shadow-sm">
          <span className="grid size-6 place-items-center rounded-md bg-teal-50 text-teal-700">
            <RefreshCw
              size={14}
              className={priceRefreshLoading ? "animate-spin" : ""}
            />
          </span>
          <div className="hidden leading-tight md:block">
            <p className="text-[9px] font-bold uppercase tracking-wide text-slate-500">
              Precios de referencia
            </p>
            <p className="text-[11px] text-slate-600">
              {lastReferenceCheck
                ? `Última revisión · ${lastReviewLabel}`
                : `${trackedProducts.length} vinculados · 09:00 / 17:00`}
            </p>
          </div>
          <button
            type="button"
            onClick={() => void refreshPriceReferences()}
            disabled={priceRefreshLoading}
            className="border-l border-slate-200 pl-2 text-xs font-semibold text-teal-800 hover:text-teal-600 disabled:cursor-wait disabled:opacity-60"
          >
            {priceRefreshLoading ? "Actualizando..." : "Actualizar"}
          </button>
        </div>
      )}
      {priceRefreshResult && (
        <StatusToast
          message={priceRefreshResult}
          onClose={() => setPriceRefreshResult("")}
        />
      )}
    </>
  );
}
