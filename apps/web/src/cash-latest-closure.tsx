import { useEffect, useState } from "react";
import { getLatestCashClosure, type CashClosure } from "./lib/api";
import { cashResponsibleLabel } from "./lib/cash-responsible";
import { cashDifferenceView, cashMoney } from "./lib/cash-session-view";

/** Con la caja cerrada ocupa la misma fila que los totales de una sesión abierta. */
export function CashLatestClosure({
  token,
  organizationId,
  branchId,
  registerId,
  refreshKey,
  onView,
  onLoaded,
  cierreLocal,
}: {
  token: string;
  organizationId: string;
  branchId: string;
  registerId: string;
  refreshKey: unknown;
  onView: (id: string) => void;
  onLoaded?: (closure: CashClosure | null) => void;
  /** Cierre hecho sin conexión que todavía no llegó: se muestra primero. */
  cierreLocal?: CashClosure;
}) {
  const [result, setResult] = useState<{
    registerId: string;
    closure: CashClosure | null;
  }>();
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let cancelled = false;
    // Lo anterior queda a la vista mientras llega lo nuevo: al volver a la
    // ventana se renueva el token y vaciarlo hacía parpadear los importes.
    setError("");
    void getLatestCashClosure(token, organizationId, branchId, registerId)
      .then((closure) => {
        if (cancelled) return;
        setResult({ registerId, closure });
        onLoaded?.(closure);
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
  }, [
    token,
    organizationId,
    branchId,
    registerId,
    refreshKey,
    retry,
    onLoaded,
  ]);
  const closure =
    cierreLocal ??
    (result?.registerId === registerId ? result.closure : undefined);
  const difference = closure
    ? cashDifferenceView(closure.differenceMinor)
    : null;
  return (
    <div className="cash-metrics">
      <div className="cash-metric is-main">
        <p className="cash-metric-label">Último cierre</p>
        <strong>
          {closure ? cashMoney(closure.closingAmountMinor ?? "0") : "—"}
        </strong>
        {error ? (
          <p role="alert" className="cash-metric-note">
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
          <p role="status" className="cash-metric-note">
            Consultando último cierre…
          </p>
        ) : closure === null ? (
          <p className="cash-metric-note">
            Sin cierres visibles para esta caja.
          </p>
        ) : closure.sinEnviar ? (
          <p className="cash-metric-note">
            Efectivo contado · se confirma al volver internet
          </p>
        ) : (
          <p className="cash-metric-note">
            Efectivo contado ·{" "}
            <button
              type="button"
              className="text-teal-700 hover:underline focus-visible:outline-2 focus-visible:outline-teal-600"
              onClick={() => onView(closure.id)}
            >
              Ver cierre →
            </button>
          </p>
        )}
      </div>
      <div className="cash-metric">
        <p className="cash-metric-label">Diferencia</p>
        <strong
          className={difference ? `cash-difference is-${difference.tone}` : ""}
        >
          {difference ? difference.amount : "—"}
        </strong>
        <p className="cash-metric-note">
          {difference?.label ?? "Del último cierre"}
        </p>
      </div>
      <div className="cash-metric">
        <p className="cash-metric-label">Fecha de cierre</p>
        <strong className="is-text">
          {closure
            ? new Date(closure.closedAt!).toLocaleDateString("es-AR")
            : "—"}
        </strong>
        <p className="cash-metric-note">
          {closure
            ? new Date(closure.closedAt!).toLocaleTimeString("es-AR", {
                hour: "2-digit",
                minute: "2-digit",
              })
            : "Del último cierre"}
        </p>
      </div>
      <div className="cash-metric">
        <p className="cash-metric-label">Responsable</p>
        <strong
          className="is-text truncate"
          title={closure ? cashResponsibleLabel(closure) : undefined}
        >
          {closure ? cashResponsibleLabel(closure) : "—"}
        </strong>
        <p className="cash-metric-note">Del último cierre</p>
      </div>
    </div>
  );
}
