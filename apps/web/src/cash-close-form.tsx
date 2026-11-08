import { useRef, useState } from "react";
import {
  CashCloseRejected,
  closeCashSession,
  type CashSession,
} from "./lib/api";
import { typedCashMinor } from "./lib/cash-count";
import { CashDialog } from "./cash-dialog";
import { MoneyInput } from "./money-input";
import { guardarOperacionCaja } from "./lib/caja-sin-conexion";

const money = (minor: number) =>
  (minor / 100).toLocaleString("es-AR", { style: "currency", currency: "ARS" });

export function CashCloseForm({
  session,
  token,
  organizationId,
  branchId,
  disabled: disabledProp = false,
  pendingCollections = 0,
  ventasSinEnviar = 0,
  sinConexion = false,
  onClosed,
  onRejected,
}: {
  session: CashSession;
  token: string;
  organizationId: string;
  branchId: string;
  disabled?: boolean;
  /** Cobros asignados a esta caja que todavía no entraron a la sesión. */
  pendingCollections?: number;
  /** Ventas cobradas sin conexión que faltan enviar: mientras haya, no se cierra. */
  ventasSinEnviar?: number;
  /** Sin conexión el cierre se guarda en la PC y se confirma al volver (SISTEMA-67). */
  sinConexion?: boolean;
  onClosed: () => void;
  onRejected?: () => void;
}) {
  // Una venta sin enviar es plata que ya está en el cajón pero todavía no en
  // la caja del servidor: cerrar ahora daría un faltante falso.
  // Con conexión, una venta sin enviar es plata que todavía no figura en la
  // caja del servidor. Sin conexión no hace falta esperar: el cierre se manda
  // después de esas ventas, en orden.
  const bloqueadoPorVentas = !sinConexion && ventasSinEnviar > 0;
  const disabled = disabledProp || bloqueadoPorVentas;
  const pending = useRef(false);
  const [busy, setBusy] = useState(false);
  const [counted, setCounted] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [confirmation, setConfirmation] = useState<{
    minor: number;
    expected: number;
    reason: string;
  }>();
  const minor = typedCashMinor(counted);
  const expected = Number(session.expectedAmountMinor);
  const difference = minor === null ? null : minor - expected;
  const save = async (snapshot: {
    minor: number;
    expected: number;
    reason: string;
  }) => {
    if (pending.current || disabled) return;
    pending.current = true;
    setBusy(true);
    setError("");
    try {
      if (sinConexion) {
        await guardarOperacionCaja(organizationId, branchId, {
          tipo: "CIERRE",
          sessionId: session.id,
          // Para mostrarlo como "Último cierre" mientras no llega.
          cashRegisterId: session.cashRegisterId,
          closingAmountMinor: snapshot.minor,
          expectedAmountMinor: snapshot.expected,
          ...(snapshot.minor !== snapshot.expected
            ? { reason: snapshot.reason }
            : {}),
        });
        setConfirmation(undefined);
        onClosed();
        return;
      }
      await closeCashSession(
        token,
        organizationId,
        branchId,
        session.id,
        snapshot.minor,
        snapshot.minor !== snapshot.expected ? snapshot.reason : undefined,
        snapshot.expected,
      );
      setConfirmation(undefined);
      onClosed();
    } catch (cause) {
      // Se vuelve al conteo con la sesión actualizada: lo contado se conserva.
      if (cause instanceof CashCloseRejected) {
        setConfirmation(undefined);
        onRejected?.();
      }
      setError(
        cause instanceof Error ? cause.message : "No se pudo cerrar la caja.",
      );
    } finally {
      pending.current = false;
      setBusy(false);
    }
  };
  return (
    <form
      aria-label="Cerrar caja"
      className="mt-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (pending.current || disabled) return;
        if (minor === null || !Number.isSafeInteger(expected)) {
          setError(
            "Ingresá un efectivo contado válido, con hasta dos decimales.",
          );
          return;
        }
        if (difference !== 0 && reason.trim().length < 3) {
          setError(
            "Explicá la diferencia con un motivo de al menos 3 caracteres.",
          );
          return;
        }
        setError("");
        const snapshot = { minor, expected, reason: reason.trim() };
        setConfirmation(snapshot);
      }}
    >
      <div className="grid grid-cols-2 items-start gap-3">
        <MoneyInput
          label="Efectivo contado"
          labelClassName="block min-w-0 text-xs"
          disabled={busy || disabled}
          value={counted}
          onChange={setCounted}
        />
        <div className="min-w-0 text-xs">
          <span>Diferencia</span>
          <div
            aria-live="polite"
            className={`mt-1 flex min-h-10 items-center rounded-lg px-3 py-2 text-xs break-words ${difference === null ? "bg-slate-50 text-slate-500" : difference === 0 ? "bg-teal-50 text-teal-700" : "bg-amber-50 text-amber-800"}`}
          >
            {difference === null
              ? "—"
              : difference === 0
                ? "$ 0,00 · Coincide"
                : `${difference < 0 ? "Faltante" : "Sobrante"}: ${money(Math.abs(difference))}`}
          </div>
        </div>
      </div>
      <label className="mt-3 block text-xs">
        Motivo de diferencia
        <input
          required={difference !== null && difference !== 0}
          minLength={3}
          maxLength={300}
          disabled={busy || disabled || difference === null || difference === 0}
          value={difference !== null && difference !== 0 ? reason : ""}
          onChange={(event) => setReason(event.target.value)}
          placeholder={
            difference !== null && difference !== 0
              ? "Indicá el motivo"
              : "No corresponde"
          }
          className="mt-1 h-10 w-full border px-3 text-sm disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400"
        />
      </label>
      {sinConexion && (
        <p
          role="status"
          className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600"
        >
          Sin conexión: el cierre queda guardado en la PC y se confirma solo
          cuando vuelva internet.
        </p>
      )}
      {bloqueadoPorVentas && (
        <p
          role="status"
          className="mt-3 rounded-xl border border-amber-100 bg-amber-50 p-3 text-xs text-amber-800"
        >
          {ventasSinEnviar === 1
            ? "Hay 1 venta cobrada sin conexión que todavía no se envió."
            : `Hay ${ventasSinEnviar} ventas cobradas sin conexión que todavía no se enviaron.`}{" "}
          Se envían solas; cuando lleguen vas a poder cerrar la caja.
        </p>
      )}
      {error && (
        <p role="alert" className="mt-3 text-sm text-rose-600">
          {error}
        </p>
      )}
      <footer className="mt-3 flex justify-end gap-2">
        <button
          disabled={busy || disabled || minor === null}
          className="w-full rounded-lg bg-teal-700 px-4 py-2 text-sm text-white disabled:opacity-50"
        >
          {busy ? "Cerrando…" : "Confirmar cierre"}
        </button>
      </footer>
      {confirmation && (
        <CashDialog
          title="Confirmar cierre de caja"
          busy={busy}
          onClose={() => setConfirmation(undefined)}
        >
          <p className="text-sm text-slate-500">
            Revisá el conteo antes de cerrar esta sesión.
          </p>
          <dl className="mt-4 space-y-3 rounded-xl bg-slate-50 p-4 text-sm">
            <div className="flex justify-between">
              <dt>Efectivo esperado</dt>
              <dd>{money(confirmation.expected)}</dd>
            </div>
            <div className="flex justify-between">
              <dt>Efectivo contado</dt>
              <dd>{money(confirmation.minor)}</dd>
            </div>
          </dl>
          {pendingCollections > 0 && (
            <p
              role="alert"
              className="mt-3 rounded-xl border border-amber-100 bg-amber-50 p-3 text-xs text-amber-800"
            >
              {pendingCollections === 1
                ? "Esta caja tiene 1 cobro asignado sin incorporar."
                : `Esta caja tiene ${pendingCollections} cobros asignados sin incorporar.`}{" "}
              Si cerrás ahora, no entran en este cierre.
            </p>
          )}
          <div
            className={`mt-3 rounded-xl border p-4 ${confirmation.minor === confirmation.expected ? "border-teal-100 bg-teal-50 text-teal-800" : "border-amber-100 bg-amber-50 text-amber-800"}`}
          >
            <p className="text-xs">
              {confirmation.minor === confirmation.expected
                ? "Sin diferencia"
                : confirmation.minor < confirmation.expected
                  ? "Faltante"
                  : "Sobrante"}
            </p>
            <p className="mt-1 text-xl font-semibold">
              {money(Math.abs(confirmation.minor - confirmation.expected))}
            </p>
            <p className="mt-2 break-words text-sm">{confirmation.reason}</p>
          </div>
          {error && (
            <p role="alert" className="mt-3 text-sm text-rose-700">
              {error}
            </p>
          )}
          <footer className="mt-5 flex justify-end gap-3">
            <button
              type="button"
              disabled={busy}
              onClick={() => setConfirmation(undefined)}
              className="rounded-xl border border-slate-200 px-4 py-2 text-sm"
            >
              Volver al conteo
            </button>
            <button
              type="button"
              disabled={busy || disabled}
              onClick={() => void save(confirmation)}
              className="rounded-xl bg-teal-700 px-4 py-2 text-sm text-white disabled:opacity-50"
            >
              {busy
                ? "Cerrando…"
                : confirmation.minor === confirmation.expected
                  ? "Confirmar cierre"
                  : "Cerrar con diferencia"}
            </button>
          </footer>
        </CashDialog>
      )}
    </form>
  );
}
