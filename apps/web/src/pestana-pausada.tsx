import { useState, type FormEvent, type ReactElement } from "react";
import { LogIn, PauseCircle, RefreshCw } from "lucide-react";
import { field, primary, secondary } from "./supplier-payables/dialog";

/**
 * Pantalla que bloquea la pestaña cuando en el navegador se inició sesión con
 * otro usuario (SISTEMA-92). Lo que había en la pantalla queda debajo, sin
 * perderse, y no sale ningún pedido hasta que la persona elija.
 */
export function PestanaPausada({
  propioEmail,
  otroEmail,
  onSeguirComoOtro,
  onEntrar,
}: {
  propioEmail: string;
  otroEmail?: string;
  onSeguirComoOtro: () => void;
  /** Vuelve a entrar con el usuario de la pestaña, sin recargar. */
  onEntrar: (password: string) => Promise<void>;
}): ReactElement {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const otro = otroEmail ?? "otro usuario";
  const entrar = async (event: FormEvent) => {
    event.preventDefault();
    if (busy || !password) return;
    setBusy(true);
    setError("");
    try {
      await onEntrar(password);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "No se pudo iniciar sesión.",
      );
      setBusy(false);
    }
  };
  return (
    <div className="fixed inset-0 z-[100] grid place-items-center bg-velo/60 p-4">
      <section
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="pestana-pausada-titulo"
        aria-describedby="pestana-pausada-detalle"
        className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-xl"
      >
        <div className="flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-full bg-amber-100 text-amber-700">
            <PauseCircle size={22} aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h2
              id="pestana-pausada-titulo"
              className="text-lg font-semibold text-slate-900"
            >
              Esta pestaña se pausó
            </h2>
            <p
              id="pestana-pausada-detalle"
              className="mt-1 text-sm break-words text-slate-600"
            >
              En este navegador se inició sesión con otro usuario ({otro}). Esta
              pestaña se pausó para que nada quede a su nombre. Lo que tenías
              cargado sigue acá.
            </p>
          </div>
        </div>
        <form className="mt-5" onSubmit={(event) => void entrar(event)}>
          <p className="mb-1 text-sm font-medium text-slate-700">
            Seguir con tu usuario
          </p>
          <input
            aria-label="Email"
            className={`${field} bg-slate-50`}
            value={propioEmail}
            readOnly
          />
          <input
            aria-label="Contraseña"
            type="password"
            autoComplete="current-password"
            className={`${field} mt-2`}
            placeholder="Tu contraseña"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
          {error && (
            <p role="alert" className="mt-2 text-sm text-red-700">
              {error}
            </p>
          )}
          <div className="mt-4 flex flex-wrap justify-end gap-3">
            <button
              type="button"
              onClick={onSeguirComoOtro}
              className={secondary}
            >
              <RefreshCw size={16} aria-hidden="true" />
              Seguir como {otro}
            </button>
            <button
              type="submit"
              disabled={busy || !password}
              className={primary}
            >
              <LogIn size={16} aria-hidden="true" />
              {busy ? "Entrando…" : `Iniciar sesión como ${propioEmail}`}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
