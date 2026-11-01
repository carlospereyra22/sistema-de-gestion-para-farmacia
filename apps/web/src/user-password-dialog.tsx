import { useEffect, useRef, useState } from "react";
import { Eye, EyeOff, X } from "lucide-react";
import { resetUserPassword, type UserListItem } from "./lib/api";

const MIN_LENGTH = 12;

/**
 * Restablecer la contrasena de otro usuario. La API valida permisos, duenos y
 * usuarios de varias farmacias, y cierra las sesiones abiertas del usuario.
 */
export function UserPasswordDialog({
  token,
  organizationId,
  user,
  onDone,
  onClose,
}: {
  token: string;
  organizationId: string;
  user: UserListItem;
  onDone: (message: string) => void;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const pending = useRef(false);
  const [password, setPassword] = useState("");
  const [repeat, setRepeat] = useState("");
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    const dialog = dialogRef.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);
  const save = async () => {
    if (pending.current) return;
    if (password.length < MIN_LENGTH)
      return setError(`Usá al menos ${MIN_LENGTH} caracteres.`);
    if (password !== repeat) return setError("Las contraseñas no coinciden.");
    pending.current = true;
    setBusy(true);
    setError("");
    try {
      await resetUserPassword(token, organizationId, user.user.id, password);
      onDone(
        `Contraseña restablecida para ${user.user.email}. Sus sesiones abiertas se cerraron.`,
      );
      onClose();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "No se pudo restablecer la contraseña.",
      );
    } finally {
      pending.current = false;
      setBusy(false);
    }
  };
  const field = "mt-1 h-10 w-full rounded-lg border px-3 pr-10";
  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="user-password-title"
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
            <h2 id="user-password-title" className="text-lg font-semibold">
              Restablecer contraseña
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
          <label className="mt-4 block text-sm">
            Nueva contraseña
            <span className="relative block">
              <input
                type={visible ? "text" : "password"}
                autoComplete="new-password"
                minLength={MIN_LENGTH}
                maxLength={256}
                required
                value={password}
                disabled={busy}
                onChange={(event) => setPassword(event.target.value)}
                className={field}
              />
              <button
                type="button"
                onClick={() => setVisible(!visible)}
                aria-label={
                  visible ? "Ocultar contraseña" : "Mostrar contraseña"
                }
                className="absolute inset-y-0 right-0 mt-1 grid w-10 place-items-center text-slate-500"
              >
                {visible ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </span>
          </label>
          <label className="mt-4 block text-sm">
            Repetir contraseña
            <input
              type={visible ? "text" : "password"}
              autoComplete="new-password"
              minLength={MIN_LENGTH}
              maxLength={256}
              required
              value={repeat}
              disabled={busy}
              onChange={(event) => setRepeat(event.target.value)}
              className={field}
            />
          </label>
          <p className="mt-3 text-xs text-slate-500">
            Mínimo {MIN_LENGTH} caracteres. Al guardar se cierran las sesiones
            abiertas de este usuario. Pasale la contraseña en persona o por un
            medio seguro.
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
            {busy ? "Guardando…" : "Restablecer contraseña"}
          </button>
        </footer>
      </form>
    </dialog>
  );
}
