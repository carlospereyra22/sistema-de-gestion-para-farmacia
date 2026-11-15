import { useRef, useState } from "react";
import { ShieldCheck } from "lucide-react";
import {
  confirmPlatformCode,
  enrollPlatformCode,
  verifyPlatformCode,
  type PlatformEnrollment,
} from "./lib/platform-api";
import { qrCells } from "./lib/platform-qr";

function EnrollmentQr({ uri }: { uri: string }) {
  const { size, cells } = qrCells(uri);
  const margin = 4;
  const total = size + margin * 2;
  return (
    <svg
      role="img"
      aria-label="Código QR para la aplicación del celular"
      viewBox={`0 0 ${total} ${total}`}
      className="mx-auto mt-4 size-52 rounded-lg border bg-white"
      shapeRendering="crispEdges"
    >
      {cells.map(({ x, y }) => (
        <rect
          key={`${x}-${y}`}
          x={x + margin}
          y={y + margin}
          width="1"
          height="1"
        />
      ))}
    </svg>
  );
}

/** Configura el código la primera vez y lo pide en cada ingreso. */
export function PlatformAccess({
  token,
  email,
  enrolled,
  initialEnrollment,
  onVerified,
  onLogout,
}: {
  token: string;
  email: string;
  enrolled: boolean;
  initialEnrollment?: PlatformEnrollment;
  onVerified: () => void;
  onLogout: () => void;
}) {
  const pending = useRef(false);
  const [enrollment, setEnrollment] = useState(initialEnrollment);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const run = async (action: () => Promise<void>) => {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "No se pudo completar.",
      );
      setCode("");
    } finally {
      pending.current = false;
      setBusy(false);
    }
  };
  const submit = () => {
    if (code.length !== 6) return setError("Ingresá los 6 dígitos del código.");
    void run(async () => {
      await (enrolled ? verifyPlatformCode : confirmPlatformCode)(token, code);
      onVerified();
    });
  };
  const asksCode = enrolled || enrollment;
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-fondo bg-[radial-gradient(var(--color-niebla-900)_1px,transparent_1px)] px-4 py-6 [background-size:22px_22px] sm:px-6">
      <p className="mb-5 flex items-center gap-2.5 text-petroleo-333">
        <img
          src="/icons/app-192.png"
          alt=""
          className="size-9 rounded-lg border border-niebla-913 bg-white p-0.5"
        />
        <span className="text-lg font-bold">Farmatec</span>
        <span className="rounded-full border border-marca-908 bg-white px-2.5 py-0.5 text-xs font-semibold text-marca-535">
          Plataforma
        </span>
      </p>
      <section className="w-full max-w-sm rounded-2xl border border-niebla-913 bg-white p-7 shadow-[0_12px_40px_-20px_rgba(35,58,66,0.35)]">
        <span className="grid size-11 place-items-center rounded-full bg-niebla-958 text-petroleo-517">
          <ShieldCheck size={20} aria-hidden="true" />
        </span>
        <h1 className="mt-4 text-xl font-bold text-slate-900">
          {enrolled ? "Ingresá tu código" : "Configurá tu código"}
        </h1>
        <p className="mt-1 break-all text-sm text-slate-500">{email}</p>
        {enrolled && (
          <p className="mt-3 text-sm text-slate-600">
            Abrí tu aplicación de autenticación y escribí el código de 6
            dígitos.
          </p>
        )}
        {!enrolled && !enrollment && (
          <>
            <p className="mt-3 text-sm text-slate-600">
              Esta cuenta controla todas las farmacias, así que además de la
              contraseña necesita un código que cambia cada 30 segundos. Vas a
              necesitar una aplicación de autenticación en el celular, como
              Google Authenticator.
            </p>
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                void run(async () =>
                  setEnrollment(await enrollPlatformCode(token)),
                )
              }
              className="mt-5 inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-petroleo-517 text-sm font-semibold text-white shadow-sm hover:bg-petroleo-452 disabled:opacity-60"
            >
              {busy ? "Preparando…" : "Empezar"}
            </button>
          </>
        )}
        {enrollment && !enrolled && (
          <>
            <p className="mt-3 text-sm text-slate-600">
              Escaneá este QR con la aplicación. Se muestra una sola vez.
            </p>
            <EnrollmentQr uri={enrollment.uri} />
            <p className="mt-3 text-xs text-slate-500">
              Si no podés escanearlo, cargá esta clave a mano:
            </p>
            <p className="mt-1 break-all rounded-lg border border-niebla-935 bg-slate-50 p-2.5 font-mono text-sm text-slate-700">
              {enrollment.secret}
            </p>
          </>
        )}
        {asksCode && (
          <form
            noValidate
            onSubmit={(event) => {
              event.preventDefault();
              submit();
            }}
          >
            <label className="mt-5 block text-sm font-medium text-slate-700">
              Código de 6 dígitos
              <input
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                autoFocus
                value={code}
                disabled={busy}
                onChange={(event) =>
                  setCode(event.target.value.replace(/\D/g, "").slice(0, 6))
                }
                className="mt-1.5 h-12 w-full rounded-lg border border-niebla-913 bg-white px-3 text-center font-mono text-xl tracking-[0.5em] text-slate-900 shadow-sm focus:border-petroleo-558 focus:outline-none focus:ring-2 focus:ring-petroleo-558/20"
              />
            </label>
            <button
              disabled={busy}
              className="mt-5 inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-petroleo-517 text-sm font-semibold text-white shadow-sm hover:bg-petroleo-452 disabled:opacity-60"
            >
              {busy ? "Verificando…" : enrolled ? "Entrar" : "Confirmar"}
            </button>
          </form>
        )}
        {error && (
          <p
            role="alert"
            className="mt-4 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700"
          >
            {error}
          </p>
        )}
        <button
          type="button"
          disabled={busy}
          onClick={onLogout}
          className="mt-3 inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg border border-niebla-900 text-sm font-semibold text-petroleo-517 hover:bg-slate-100 disabled:opacity-60"
        >
          Cerrar sesión
        </button>
      </section>
    </main>
  );
}
