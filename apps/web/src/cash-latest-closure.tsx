import { useEffect, useState } from "react";
import { getLatestCashClosure, type CashClosure } from "./lib/api";
import { cashResponsibleLabel } from "./lib/cash-responsible";

export function CashLatestClosure({
  token,
  organizationId,
  branchId,
  registerId,
  refreshKey,
  onView,
}: {
  token: string;
  organizationId: string;
  branchId: string;
  registerId: string;
  refreshKey: unknown;
  onView: (id: string) => void;
}) {
  const [result, setResult] = useState<{
    registerId: string;
    closure: CashClosure | null;
  }>();
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let cancelled = false;
    setResult(undefined);
    setError("");
    void getLatestCashClosure(token, organizationId, branchId, registerId)
      .then((closure) => {
        if (!cancelled) setResult({ registerId, closure });
      })
      .catch((cause: unknown) => {
        if (!cancelled)
          setError(
            cause instanceof Error
              ? cause.message
              : "No se pudo consultar el último cierre.",
          );
      });
    return () => {
      cancelled = true;
    };
  }, [token, organizationId, branchId, registerId, refreshKey, retry]);
  const closure =
    result?.registerId === registerId ? result.closure : undefined;
  return (
    <div className="mt-4 border-t border-teal-100 pt-3 text-xs text-slate-500">
      <div className="flex items-center justify-between gap-3">
        <p className="font-medium text-slate-700">Último cierre</p>
        {closure && (
          <button
            type="button"
            className="shrink-0 rounded-md px-2 py-1 text-teal-700 hover:bg-teal-100/60 focus-visible:outline-2 focus-visible:outline-teal-600"
            onClick={() => onView(closure.id)}
          >
            Ver cierre →
          </button>
        )}
      </div>
      {error ? (
        <p role="alert" className="mt-1">
          {error}{" "}
          <button
            type="button"
            onClick={() => setRetry((value) => value + 1)}
            className="text-teal-700 underline"
          >
            Reintentar
          </button>
        </p>
      ) : closure === undefined ? (
        <p role="status" className="mt-1">
          Consultando último cierre…
        </p>
      ) : closure === null ? (
        <p className="mt-1">Sin cierres visibles para esta caja.</p>
      ) : (
        <>
          <div className="mt-2 flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
            <div>
              <p className="text-[11px]">Efectivo contado</p>
              <p className="mt-0.5 text-xl font-semibold leading-tight text-teal-700">
                {(Number(closure.closingAmountMinor) / 100).toLocaleString(
                  "es-AR",
                  { style: "currency", currency: "ARS" },
                )}
              </p>
            </div>
            <p className="text-[11px]">
              {new Date(closure.closedAt!).toLocaleString("es-AR", {
                dateStyle: "short",
                timeStyle: "short",
              })}
            </p>
          </div>
          <p
            className="mt-2 truncate text-[11px]"
            title={cashResponsibleLabel(closure)}
          >
            Responsable: {cashResponsibleLabel(closure)}
          </p>
        </>
      )}
    </div>
  );
}
