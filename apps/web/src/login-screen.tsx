import { useState, type FormEvent, type ReactElement } from "react";
import {
  ArrowLeft,
  CalendarClock,
  Eye,
  EyeOff,
  KeyRound,
  LogIn,
  ReceiptText,
  Wallet,
} from "lucide-react";

/** Nombre comercial provisorio, el mismo de la landing. */
const BRAND = "Farmatec";

/** Landing comercial ("Pedi una demo"). Sin VITE_LANDING_URL en produccion no se muestra. */
const landingUrl: string | undefined =
  import.meta.env.VITE_LANDING_URL ??
  (import.meta.env.DEV ? "http://localhost:5174" : undefined);

const moments = [
  {
    icon: ReceiptText,
    title: "Venta registrada",
    text: "Stock descontado por lote y ticket listo para imprimir.",
  },
  {
    icon: CalendarClock,
    title: "Lote por vencer",
    text: "Te avisa con tiempo para venderlo o devolverlo.",
  },
  {
    icon: Wallet,
    title: "Cierre de caja",
    text: "Efectivo esperado, contado y diferencia registrados.",
  },
];

const features = [
  "Punto de venta",
  "Stock por lote",
  "Alertas de vencimiento",
  "Varias sucursales",
];

const field =
  "mt-1.5 h-11 w-full rounded-lg border border-[#dce7ef] bg-white px-3 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-[#3d7f8a] focus:outline-none focus:ring-2 focus:ring-[#3d7f8a]/20";

/**
 * Pantalla de ingreso: panel con el mensaje del producto y tarjeta de acceso.
 * La sucursal se elige despues de entrar. "La olvidaste?" explica como recuperar
 * el acceso: un administrador la restablece desde Usuarios (no hay envio de email).
 */
export function LoginScreen({
  email,
  password,
  message,
  onEmailChange,
  onPasswordChange,
  onSubmit,
}: {
  email: string;
  password: string;
  message?: string;
  onEmailChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => Promise<void>;
}): ReactElement {
  const [visible, setVisible] = useState(false);
  const [forgot, setForgot] = useState(false);
  const [busy, setBusy] = useState(false);

  return (
    <main className="grid min-h-screen bg-[#f4f8fa] lg:grid-cols-[1.05fr_1fr]">
      <section className="relative flex flex-col justify-between overflow-hidden bg-gradient-to-br from-[#3d7f8a] via-[#2c6470] to-[#233a42] px-6 py-6 text-white sm:px-10 lg:px-14 lg:py-12">
        {/* Textura: brillo difuso y cruz del logo como marca de agua. */}
        <div
          aria-hidden
          className="pointer-events-none absolute -left-32 -top-32 size-[28rem] rounded-full bg-white/10 blur-3xl"
        />
        <svg
          aria-hidden
          viewBox="0 0 100 100"
          className="pointer-events-none absolute -bottom-24 -right-24 hidden size-[34rem] text-white/[0.06] lg:block"
        >
          <path
            fill="currentColor"
            d="M36 6h28a6 6 0 0 1 6 6v18h18a6 6 0 0 1 6 6v28a6 6 0 0 1-6 6H70v18a6 6 0 0 1-6 6H36a6 6 0 0 1-6-6V70H12a6 6 0 0 1-6-6V36a6 6 0 0 1 6-6h18V12a6 6 0 0 1 6-6Z"
          />
        </svg>
        <div className="relative flex items-center gap-2.5">
          <img
            src="/icons/app-192.png"
            alt=""
            className="size-9 rounded-lg bg-white/90 p-0.5"
          />
          <span className="text-lg font-bold">{BRAND}</span>
        </div>
        <div className="relative mt-6 hidden lg:block">
          <h1 className="max-w-md text-4xl font-bold leading-tight tracking-tight">
            Tu farmacia, ordenada desde el mostrador hasta el depósito.
          </h1>
          <p className="mt-4 max-w-md text-base leading-relaxed text-white/80">
            Ventas, stock por lote y vencimiento, caja, cuentas corrientes y
            facturación electrónica en un solo lugar, para una o varias
            sucursales.
          </p>
          {/* Situaciones del dia a dia, sin cifras: ilustran, no son datos. */}
          <ul className="mt-10 max-w-md space-y-3">
            {moments.map(({ icon: Icon, title, text }) => (
              <li
                key={title}
                className="flex items-center gap-3 rounded-xl bg-white/10 px-4 py-3 shadow-[0_10px_30px_-12px_rgba(0,0,0,0.35)] ring-1 ring-inset ring-white/15 backdrop-blur-sm"
              >
                <span className="grid size-9 shrink-0 place-items-center rounded-full bg-white/15">
                  <Icon size={17} aria-hidden />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold">{title}</span>
                  <span className="block text-xs text-white/75">{text}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
        <ul className="relative mt-6 hidden flex-wrap gap-2 lg:flex">
          {features.map((feature) => (
            <li
              key={feature}
              className="rounded-full bg-white/10 px-3 py-1.5 text-xs font-medium text-white/90 ring-1 ring-inset ring-white/15"
            >
              {feature}
            </li>
          ))}
        </ul>
      </section>

      <section className="flex flex-col bg-[radial-gradient(#d3e1e6_1px,transparent_1px)] px-4 py-5 [background-size:22px_22px] sm:px-8">
        <div className="flex min-h-9 justify-end">
          {landingUrl ? (
            <a
              href={landingUrl}
              className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm font-medium text-slate-600 hover:bg-white hover:text-[#2c7380]"
            >
              <ArrowLeft size={15} aria-hidden />
              Volver al sitio
            </a>
          ) : null}
        </div>
        <div className="flex flex-1 flex-col items-center justify-center py-8">
          <div className="w-full max-w-sm rounded-2xl border border-[#dce7ef] bg-white p-7 shadow-[0_12px_40px_-20px_rgba(35,58,66,0.35)]">
            {forgot ? (
              <div>
                <span className="grid size-11 place-items-center rounded-full bg-[#eaf3f5] text-[#2c7380]">
                  <KeyRound size={20} aria-hidden />
                </span>
                <h2 className="mt-4 text-xl font-bold text-slate-900">
                  ¿Olvidaste tu contraseña?
                </h2>
                <p className="mt-3 text-sm leading-relaxed text-slate-600">
                  Pedile al dueño o al administrador de tu farmacia que te
                  asigne una nueva desde{" "}
                  <strong>Administración → Usuarios</strong>. Por seguridad, al
                  cambiarla se cierran tus sesiones abiertas.
                </p>
                <p className="mt-3 text-sm leading-relaxed text-slate-600">
                  Si sos el dueño y no podés ingresar, escribinos
                  {landingUrl ? (
                    <>
                      {" "}
                      desde{" "}
                      <a
                        href={`${landingUrl}#contacto`}
                        className="font-semibold text-[#2c7380] underline-offset-2 hover:underline"
                      >
                        el sitio
                      </a>
                    </>
                  ) : null}
                  .
                </p>
                <button
                  type="button"
                  onClick={() => setForgot(false)}
                  className="mt-6 inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg border border-[#cfe2e6] text-sm font-semibold text-[#2c7380] hover:bg-[#f1f7f8]"
                >
                  <ArrowLeft size={16} aria-hidden />
                  Volver a ingresar
                </button>
              </div>
            ) : (
              <form
                onSubmit={(event) => {
                  setBusy(true);
                  void onSubmit(event).finally(() => setBusy(false));
                }}
              >
                <h2 className="text-2xl font-bold text-[#233a42]">Ingresar</h2>
                <p className="mt-1 text-sm text-slate-500">
                  Accedé con tu usuario de la farmacia.
                </p>
                <label className="mt-6 block text-sm font-medium text-slate-700">
                  Correo electrónico
                  <input
                    required
                    type="email"
                    autoComplete="username"
                    placeholder="nombre@farmacia.com"
                    value={email}
                    onChange={(event) => onEmailChange(event.target.value)}
                    className={field}
                  />
                </label>
                <div className="mt-5">
                  <div className="flex items-center justify-between gap-2">
                    <label
                      htmlFor="login-password"
                      className="text-sm font-medium text-slate-700"
                    >
                      Contraseña
                    </label>
                    <button
                      type="button"
                      onClick={() => setForgot(true)}
                      className="text-xs font-semibold text-[#2c7380] hover:underline"
                    >
                      ¿La olvidaste?
                    </button>
                  </div>
                  <div className="relative">
                    <input
                      id="login-password"
                      required
                      type={visible ? "text" : "password"}
                      autoComplete="current-password"
                      minLength={12}
                      value={password}
                      onChange={(event) => onPasswordChange(event.target.value)}
                      className={`${field} pr-11`}
                    />
                    <button
                      type="button"
                      onClick={() => setVisible(!visible)}
                      aria-label={
                        visible ? "Ocultar contraseña" : "Mostrar contraseña"
                      }
                      className="absolute inset-y-0 right-0 mt-1.5 grid w-11 place-items-center text-slate-500 hover:text-[#2c7380]"
                    >
                      {visible ? (
                        <EyeOff size={17} aria-hidden />
                      ) : (
                        <Eye size={17} aria-hidden />
                      )}
                    </button>
                  </div>
                </div>
                {message ? (
                  <p
                    role="alert"
                    className="mt-4 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700"
                  >
                    {message}
                  </p>
                ) : null}
                <button
                  type="submit"
                  disabled={busy}
                  className="mt-6 inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-[#2c7380] text-sm font-semibold text-white shadow-sm hover:bg-[#245f6a] disabled:opacity-60"
                >
                  <LogIn size={16} aria-hidden />
                  {busy ? "Ingresando…" : "Ingresar"}
                </button>
                {landingUrl ? (
                  <p className="mt-5 text-center text-xs text-slate-500">
                    ¿Nueva farmacia?{" "}
                    <a
                      href={`${landingUrl}#contacto`}
                      className="font-semibold text-[#2c7380] underline underline-offset-2"
                    >
                      Pedí una demo
                    </a>
                  </p>
                ) : null}
              </form>
            )}
          </div>
        </div>
        <p className="text-center text-xs text-slate-500">
          © {new Date().getFullYear()} {BRAND} · Sistema de gestión para
          farmacias
        </p>
      </section>
    </main>
  );
}
