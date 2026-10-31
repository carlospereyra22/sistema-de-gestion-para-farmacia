import { useEffect, useId, useRef, useState } from "react";
import { parseAccountDelivery } from "./lib/account-delivery";
import { accountTotalIncrease } from "./lib/account-total-increase";

export function AccountDebtIncrease({
  name,
  pendingMinor,
  disabled,
  onSave,
  onCancel,
  total = false,
}: {
  name: string;
  pendingMinor: string;
  disabled: boolean;
  onSave: (input: {
    expectedPendingMinor: number;
    nextPendingMinor: number;
    reason: string;
    clientOperationId: string;
  }) => Promise<void>;
  onCancel: () => void;
  total?: boolean;
}) {
  const id = useId();
  const [amount, setAmount] = useState(
    (Number(pendingMinor) / 100).toFixed(2).replace(".", ","),
  );
  const reason = "Actualización manual del saldo pendiente";
  const [mode, setMode] = useState<"amount" | "percent">("amount");
  const [percent, setPercent] = useState("");
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current;
    const previous = document.activeElement;
    element?.showModal();
    return () => {
      element?.close();
      if (previous instanceof HTMLElement && previous.isConnected)
        previous.focus();
    };
  }, []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const lock = useRef(false);
  const request = useRef<{ key: string; id: string } | undefined>(undefined);
  const current = Number(pendingMinor);
  const next =
    mode === "amount"
      ? parseAccountDelivery(amount)
      : accountTotalIncrease(current, mode, percent);
  const money = (minor: number) =>
    (minor / 100).toLocaleString("es-AR", {
      style: "currency",
      currency: "ARS",
    });
  const valid =
    Number.isSafeInteger(current) && next !== null && next > current;
  const save = async () => {
    if (!valid || next === null || lock.current || disabled) return;
    lock.current = true;
    setBusy(true);
    setError("");
    const key = JSON.stringify([current, next, reason.trim()]);
    if (request.current?.key !== key)
      request.current = { key, id: crypto.randomUUID() };
    try {
      await onSave({
        expectedPendingMinor: current,
        nextPendingMinor: next,
        reason: reason.trim(),
        clientOperationId: request.current.id,
      });
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "No se pudo guardar el aumento.",
      );
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  return (
    <dialog
      ref={dialog}
      aria-labelledby={`${id}-title`}
      onCancel={(event) => {
        event.preventDefault();
        if (!lock.current && !disabled) onCancel();
      }}
      className="fixed inset-0 m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-sm overflow-y-auto rounded-2xl border border-slate-200 bg-white p-0 shadow-xl backdrop:bg-slate-900/30"
    >
      <fieldset
        disabled={disabled || busy}
        className="min-w-0 p-5"
        aria-label="Aumentar deuda"
      >
        <h4
          id={`${id}-title`}
          className="break-words text-base font-semibold text-slate-800"
        >
          {name}
        </h4>
        {total && (
          <>
            <p className="mt-2 text-xs leading-5 text-slate-500">
              Sobre todo el saldo pendiente de la cuenta. No modifica lo ya
              pagado ni registra un cobro.
            </p>
            <div className="mt-4 flex gap-1 rounded-lg bg-slate-50 p-1 text-xs">
              {(
                [
                  ["amount", "Nuevo total"],
                  ["percent", "Porcentaje"],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={mode === value}
                  onClick={() => setMode(value)}
                  className={`flex-1 rounded-md px-3 py-2 ${mode === value ? "bg-white text-teal-700 shadow-sm" : "text-slate-500"}`}
                >
                  {label}
                </button>
              ))}
            </div>
          </>
        )}
        <div className="mt-5">
          <label
            htmlFor={`${id}-amount`}
            className="text-xs font-medium text-slate-700"
          >
            {mode === "percent" ? "Aumento (%)" : "Nuevo saldo pendiente ($)"}
            <input
              id={`${id}-amount`}
              autoFocus
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  event.stopPropagation();
                  void save();
                }
              }}
              onFocus={(event) => event.target.select()}
              inputMode="decimal"
              maxLength={30}
              value={mode === "percent" ? percent : amount}
              onChange={(event) =>
                mode === "percent"
                  ? setPercent(event.target.value)
                  : setAmount(event.target.value)
              }
              placeholder={mode === "percent" ? "Ej. 10" : "Ej. 1.200"}
              className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm"
            />
          </label>
        </div>
        {total && (
          <div className="mt-4 space-y-2 rounded-xl bg-slate-50 p-3 text-xs">
            <p className="flex justify-between">
              <span>Saldo actual</span>
              <span>{money(current)}</span>
            </p>
            <p className="flex justify-between">
              <span>Aumento</span>
              <span>{valid ? money(next! - current) : "—"}</span>
            </p>
            <p className="flex justify-between border-t border-slate-200 pt-2 font-semibold text-teal-700">
              <span>Nuevo saldo</span>
              <span>{valid ? money(next!) : "—"}</span>
            </p>
            <p className="pt-1 text-[11px] leading-4 text-slate-500">
              Se distribuye proporcionalmente entre los artículos pendientes.
              Los vencimientos se conservan.
            </p>
          </div>
        )}
        {next !== null && next < current && (
          <p role="alert" className="mt-2 text-xs text-rose-700">
            El nuevo saldo debe ser mayor al actual.
          </p>
        )}
        {error && (
          <p role="alert" className="mt-2 text-xs text-rose-700">
            {error}
          </p>
        )}
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={!valid}
            onClick={() => void save()}
            className="rounded-lg bg-teal-700 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            {busy ? "Guardando…" : total ? "Confirmar aumento" : "Guardar"}
          </button>
        </div>
      </fieldset>
    </dialog>
  );
}
