import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronDown, Pill } from "lucide-react";
import {
  getAlfaBetaDetail,
  type AlfaBetaDetail,
  type AlfaBetaMatch,
  type MedicineReference,
} from "./lib/api";
import { referenceMoney } from "./lib/medicine-search";
import {
  MedicinePresentationHeader,
  MedicinePresentationRow,
} from "./medicine-presentation-row";

export function AlfaBetaMedicineCard({
  item,
  token,
  organizationId,
  prefetch = false,
  compact = false,
  onSelect,
}: {
  item: AlfaBetaMatch;
  token: string;
  organizationId: string;
  prefetch?: boolean;
  compact?: boolean;
  onSelect?: (reference: MedicineReference) => void;
}) {
  const [detail, setDetail] = useState<AlfaBetaDetail>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const request = useRef<AbortController | null>(null);
  useEffect(
    () => () => {
      request.current?.abort();
      request.current = null;
    },
    [],
  );
  const load = useCallback(async () => {
    if (detail || request.current) return;
    const controller = new AbortController();
    request.current = controller;
    setLoading(true);
    setError("");
    try {
      const result = await getAlfaBetaDetail(
        token,
        organizationId,
        item.id,
        controller.signal,
      );
      if (!controller.signal.aborted) setDetail(result);
    } catch (cause) {
      if (!controller.signal.aborted)
        setError(
          cause instanceof Error
            ? cause.message
            : "No se pudo consultar el medicamento.",
        );
    } finally {
      if (!controller.signal.aborted) {
        request.current = null;
        setLoading(false);
      }
    }
  }, [detail, token, organizationId, item.id]);
  useEffect(() => {
    if (!prefetch) return;
    const timer = setTimeout(() => void load(), 150);
    return () => clearTimeout(timer);
  }, [prefetch, load]);
  return (
    <div>
      <details
        onToggle={(event) => {
          if (event.currentTarget.open) void load();
        }}
        className={
          compact
            ? "group bg-white open:bg-slate-50/40"
            : "group rounded-xl border border-slate-200 bg-white open:border-emerald-300"
        }
      >
        <summary
          onPointerEnter={() => {
            if (!error) void load();
          }}
          onFocus={() => {
            if (!error) void load();
          }}
          className={`flex cursor-pointer list-none items-center gap-3 p-4 focus-visible:outline-2 focus-visible:outline-emerald-700 ${compact ? "transition hover:bg-slate-50" : "rounded-xl"}`}
        >
          {!compact && (
            <span className="rounded-xl bg-emerald-50 p-3 text-emerald-700">
              <Pill size={22} aria-hidden="true" />
            </span>
          )}
          <span className="min-w-0 flex-1">
            <span className="block font-semibold text-slate-900">
              {item.name}
            </span>
            <span className="mt-1 block text-xs text-slate-500">
              {item.laboratory || "Laboratorio no informado"}
              {!compact && " · Ver presentaciones"}
            </span>
          </span>
          {compact && (
            <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-600">
              {detail
                ? `${detail.presentations.length} ${detail.presentations.length === 1 ? "presentación" : "presentaciones"}`
                : "Ver presentaciones"}
            </span>
          )}
          <ChevronDown
            size={18}
            aria-hidden="true"
            className="shrink-0 text-slate-400 transition-transform group-open:rotate-180"
          />
        </summary>
        <div
          className={
            compact
              ? "border-t border-slate-100 px-4"
              : "border-t border-slate-100 px-4 pb-4"
          }
          aria-busy={loading}
        >
          {loading && (
            <p role="status" className="pt-4 text-sm text-slate-500">
              Consultando presentaciones…
            </p>
          )}
          {error && (
            <div className="pt-4">
              <p role="alert" className="text-sm text-rose-700">
                {error}
              </p>
              <button
                type="button"
                onClick={() => void load()}
                className="mt-2 text-sm font-semibold text-emerald-700 underline"
              >
                Reintentar
              </button>
            </div>
          )}
          {compact && detail && !onSelect ? (
            <div className="w-full py-3">
              <MedicinePresentationHeader />
              {detail.presentations.map((presentation, index) => (
                <MedicinePresentationRow key={index} {...presentation} />
              ))}
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {detail?.presentations.map((presentation, index) => (
                <article
                  key={index}
                  className={
                    compact
                      ? "grid grid-cols-1 gap-2 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:gap-6"
                      : "py-4"
                  }
                >
                  <p className="text-sm font-medium text-slate-800">
                    {presentation.presentation}
                  </p>
                  <div className={compact ? "sm:text-right" : ""}>
                    <p
                      className={
                        compact
                          ? "text-[11px] text-slate-500"
                          : "mt-2 text-xs text-slate-500"
                      }
                    >
                      Precio de referencia · ARS
                    </p>
                    <p
                      className={
                        compact
                          ? "text-lg font-semibold tabular-nums text-emerald-800"
                          : "mt-1 text-xl font-semibold text-emerald-800"
                      }
                    >
                      {referenceMoney(presentation.priceMinor)}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      Fecha informada:{" "}
                      {presentation.updatedAt || "no disponible"}
                    </p>
                  </div>
                  {onSelect && (
                    <button
                      type="button"
                      disabled={presentation.priceMinor === null}
                      className="mt-3 rounded-lg bg-emerald-700 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
                      onClick={() =>
                        onSelect({
                          source: "alfabeta",
                          name: detail.name,
                          presentation: presentation.presentation,
                          laboratory: item.laboratory,
                          priceMinor: presentation.priceMinor,
                          updatedAt: presentation.updatedAt,
                          barcode: "",
                          activeIngredient: "",
                          troquel: "",
                          pamiPriceMinor: null,
                          saleType: "",
                        })
                      }
                    >
                      Vincular esta presentación
                    </button>
                  )}
                </article>
              ))}
            </div>
          )}
        </div>
      </details>
    </div>
  );
}
