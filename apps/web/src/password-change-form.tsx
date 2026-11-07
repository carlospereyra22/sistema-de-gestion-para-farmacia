import { useRef, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { changeOwnPassword } from "./lib/api";
import {
  PASSWORD_MIN_LENGTH,
  passwordChangeError,
} from "./lib/password-change";

const field = "mt-1 h-10 w-full rounded-lg border px-3 pr-10";

/** Formulario del cambio de la propia contraseña; la API revalida todo. */
export function PasswordChangeForm({
  token,
  submitLabel,
  secondaryLabel,
  onSecondary,
  onBusyChange,
  onDone,
}: {
  token: string;
  submitLabel: string;
  secondaryLabel: string;
  onSecondary: () => void;
  onBusyChange?: (busy: boolean) => void;
  onDone: (revokedSessions: number) => void;
}) {
  const pending = useRef(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [repeat, setRepeat] = useState("");
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const updateBusy = (value: boolean) => {
    pending.current = value;
    setBusy(value);
    onBusyChange?.(value);
  };
  const save = async () => {
    if (pending.current) return;
    const invalid = passwordChangeError({
      currentPassword,
      newPassword,
      repeat,
    });
    if (invalid) return setError(invalid);
    updateBusy(true);
    setError("");
    try {
      const result = await changeOwnPassword(token, {
        currentPassword,
        newPassword,
      });
      onDone(result.revokedSessions);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "No se pudo cambiar la contraseña.",
      );
    } finally {
      updateBusy(false);
    }
  };
  const type = visible ? "text" : "password";
  return (
    <form
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      <label className="mt-4 block text-sm">
        Contraseña actual
        <span className="relative block">
          <input
            type={type}
            autoComplete="current-password"
            maxLength={256}
            required
            value={currentPassword}
            disabled={busy}
            onChange={(event) => setCurrentPassword(event.target.value)}
            className={field}
          />
          <button
            type="button"
            onClick={() => setVisible(!visible)}
            aria-label={visible ? "Ocultar contraseñas" : "Mostrar contraseñas"}
            className="absolute inset-y-0 right-0 mt-1 grid w-10 place-items-center text-slate-500"
          >
            {visible ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </span>
      </label>
      <label className="mt-4 block text-sm">
        Contraseña nueva
        <input
          type={type}
          autoComplete="new-password"
          minLength={PASSWORD_MIN_LENGTH}
          maxLength={256}
          required
          value={newPassword}
          disabled={busy}
          onChange={(event) => setNewPassword(event.target.value)}
          className={field}
        />
      </label>
      <label className="mt-4 block text-sm">
        Repetir contraseña nueva
        <input
          type={type}
          autoComplete="new-password"
          minLength={PASSWORD_MIN_LENGTH}
          maxLength={256}
          required
          value={repeat}
          disabled={busy}
          onChange={(event) => setRepeat(event.target.value)}
          className={field}
        />
      </label>
      <p className="mt-3 text-xs text-slate-500">
        Mínimo {PASSWORD_MIN_LENGTH} caracteres. Al guardar se cierran tus otras
        sesiones abiertas.
      </p>
      {error && (
        <p role="alert" className="mt-3 text-sm text-red-700">
          {error}
        </p>
      )}
      <div className="mt-5 flex justify-end gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={onSecondary}
          className="rounded-lg border px-4 py-2 text-sm"
        >
          {secondaryLabel}
        </button>
        <button
          disabled={busy}
          className="rounded-lg bg-teal-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          {busy ? "Guardando…" : submitLabel}
        </button>
      </div>
    </form>
  );
}
