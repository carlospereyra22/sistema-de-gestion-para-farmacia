import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { saveUserDisplayName, type UserListItem } from "./lib/api";

export function UserTicketNameField({
  value,
  onChange,
  disabled = false,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  return (
    <label className="mt-4 block text-sm">
      Nombre
      <input
        maxLength={120}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 h-10 w-full rounded-lg border px-3"
      />
    </label>
  );
}

export function UserTicketNameDialog({
  token,
  organizationId,
  user,
  onDone,
  onClose,
}: {
  token: string;
  organizationId: string;
  user: UserListItem;
  onDone: () => void;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const pending = useRef(false);
  const [name, setName] = useState(user.displayName ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    const dialog = dialogRef.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);
  const save = async () => {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError("");
    try {
      await saveUserDisplayName(token, organizationId, user.user.id, name);
      onDone();
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo guardar.");
    } finally {
      pending.current = false;
      setBusy(false);
    }
  };
  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="user-name-title"
      onCancel={(event) => {
        event.preventDefault();
        if (!pending.current) onClose();
      }}
      className="m-auto w-[calc(100%-2rem)] max-w-lg rounded-2xl border border-slate-200 bg-white p-0 shadow-xl backdrop:bg-slate-950/35 backdrop:backdrop-blur-sm"
    >
      <form
        className="flex max-h-[85dvh] flex-col"
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        <header className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-100 bg-teal-50/60 p-5">
          <div className="min-w-0">
            <h2 id="user-name-title" className="text-lg font-semibold">
              Editar usuario
            </h2>
            <p className="break-all text-sm text-slate-500">
              {user.user.email}
            </p>
          </div>
          <button
            type="button"
            disabled={busy}
            aria-label="Cerrar"
            onClick={onClose}
            className="rounded-lg p-2"
          >
            <X size={18} />
          </button>
        </header>
        <div className="min-h-0 overflow-y-auto px-5 pb-5">
          <UserTicketNameField
            value={name}
            onChange={setName}
            disabled={busy}
          />
          <p className="mt-3 text-xs text-slate-500">
            Este cambio no modifica credenciales, roles ni sucursales.
          </p>
          {error && (
            <p role="alert" className="mt-3 text-sm text-red-700">
              {error}
            </p>
          )}
        </div>
        <footer className="flex shrink-0 justify-end gap-2 border-t border-slate-100 p-5">
          <button
            type="button"
            disabled={busy}
            onClick={onClose}
            className="rounded-lg border px-4 py-2 text-sm"
          >
            Cancelar
          </button>
          <button
            disabled={busy}
            className="rounded-lg bg-teal-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            {busy ? "Guardando…" : "Guardar nombre"}
          </button>
        </footer>
      </form>
    </dialog>
  );
}
