import { useRef, useState } from "react";
import { closeCashSession, type CashSession } from "./lib/api";
import { cashCountMinor } from "./lib/cash-count";
import { CashDialog } from "./cash-dialog";

const money = (minor: number) =>
  (minor / 100).toLocaleString("es-AR", { style: "currency", currency: "ARS" });

export function CashCloseForm({
  session,
  token,
  organizationId,
  branchId,
  disabled = false,
  onClosed,
}: {
  session: CashSession;
  token: string;
  organizationId: string;
  branchId: string;
  disabled?: boolean;
  onClosed: () => void;
}) {
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
  const minor = cashCountMinor(counted);
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
        <label className="block min-w-0 text-xs">
          Efectivo contado
          <input
            required
            disabled={busy || disabled}
            inputMode="decimal"
            value={counted}
            onChange={(event) => setCounted(event.target.value)}
            placeholder="Importe contado"
            className="mt-1 h-10 w-full min-w-0 border px-3 text-sm"
          />
        </label>
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
                : `${difference < 0 ? "Faltante" : "Sobrante"}: ${money(difference)}`}
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
          <div className="mt-3 rounded-xl border border-amber-100 bg-amber-50 p-4 text-amber-800">
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
