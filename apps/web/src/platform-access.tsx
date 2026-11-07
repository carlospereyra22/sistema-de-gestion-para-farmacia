import { useRef, useState } from "react";
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
    <main className="flex min-h-screen items-center justify-center bg-slate-100 px-4 py-6 sm:px-6">
      <section className="w-full max-w-md rounded-xl border bg-white p-6 shadow-sm">
        <h1 className="text-xl font-semibold">
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
              className="mt-4 w-full rounded-lg bg-teal-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
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
            <p className="mt-1 break-all rounded-lg bg-slate-50 p-2 font-mono text-sm">
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
            <label className="mt-4 block text-sm">
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
                className="mt-1 h-11 w-full rounded-lg border px-3 text-center font-mono text-lg tracking-[0.4em]"
              />
            </label>
            <button
              disabled={busy}
              className="mt-4 w-full rounded-lg bg-teal-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              {busy ? "Verificando…" : enrolled ? "Entrar" : "Confirmar"}
            </button>
          </form>
        )}
        {error && (
          <p role="alert" className="mt-3 text-sm text-red-700">
            {error}
          </p>
        )}
        <button
          type="button"
          disabled={busy}
          onClick={onLogout}
          className="mt-3 w-full rounded-lg border px-4 py-2 text-sm"
        >
          Cerrar sesión
        </button>
      </section>
    </main>
  );
}
