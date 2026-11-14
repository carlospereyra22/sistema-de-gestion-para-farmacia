import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { PasswordChangeForm } from "./password-change-form";

/** Cambiar la propia contraseña desde el menú de la cuenta. */
export function OwnPasswordDialog({
  token,
  email,
  onDone,
  onClose,
}: {
  token: string;
  email: string;
  onDone: (revokedSessions: number) => void;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const dialog = dialogRef.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);
  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="own-password-title"
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onClose();
      }}
      className="m-auto w-[calc(100%-2rem)] max-w-lg rounded-2xl border border-slate-200 bg-white p-0 shadow-xl backdrop:bg-velo/35 backdrop:backdrop-blur-sm"
    >
      <header className="flex items-center justify-between gap-3 border-b border-slate-100 bg-teal-50/60 p-5">
        <div className="min-w-0">
          <h2 id="own-password-title" className="text-lg font-semibold">
            Cambiar contraseña
          </h2>
          <p className="break-all text-sm text-slate-500">{email}</p>
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
      <div className="max-h-[70dvh] overflow-y-auto px-5 pb-5">
        <PasswordChangeForm
          token={token}
          submitLabel="Cambiar contraseña"
          secondaryLabel="Cancelar"
          onSecondary={onClose}
          onBusyChange={setBusy}
          onDone={onDone}
        />
      </div>
    </dialog>
  );
}
