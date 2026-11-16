import { useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Eye, EyeOff, LogIn, Store } from "lucide-react";

import type { ContextoCatalogo } from "./catalogo";
import { ingresarAlCatalogo } from "./lib/api";

const campo =
  "mt-1.5 h-12 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-[15px] outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100";

/** Ingreso de un cliente al catálogo con su usuario del portal (SISTEMA-107). */
export function CatalogoPublicoIngresar({
  contexto,
}: {
  contexto: ContextoCatalogo;
}) {
  const { slug, portada, recargar } = contexto;
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [ver, setVer] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [falla, setFalla] = useState("");

  const enviar = async (event: FormEvent) => {
    event.preventDefault();
    setEnviando(true);
    setFalla("");
    try {
      await ingresarAlCatalogo(slug, email, password);
      await recargar();
      navigate(
        params.get("volver") === "carrito" ? `/${slug}/carrito` : `/${slug}`,
      );
    } catch (cause) {
      setFalla(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="flex justify-center py-4 sm:py-10">
      <form
        onSubmit={(event) => void enviar(event)}
        className="flex w-full max-w-sm flex-col gap-4 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8"
      >
        <span className="flex size-12 items-center justify-center rounded-2xl bg-gradient-to-br from-teal-600 to-teal-800 text-white">
          <Store size={24} aria-hidden />
        </span>
        <div>
          <h1 className="text-2xl font-bold">Ingresá</h1>
          <p className="mt-1 text-sm text-slate-600">
            Con el usuario que te dio {portada.name} vas a ver tus precios y
            hacer pedidos.
          </p>
        </div>
        <label className="text-sm font-medium">
          Correo
          <input
            type="email"
            inputMode="email"
            required
            autoComplete="username"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="tu@correo.com"
            className={campo}
          />
        </label>
        <label className="text-sm font-medium">
          Contraseña
          <span className="relative block">
            <input
              type={ver ? "text" : "password"}
              required
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className={`${campo} pr-11`}
            />
            <button
              type="button"
              aria-label={ver ? "Ocultar contraseña" : "Mostrar contraseña"}
              onClick={() => setVer(!ver)}
              className="absolute right-2 top-[calc(50%+3px)] -translate-y-1/2 rounded-lg p-1.5 text-slate-400 hover:text-slate-700"
            >
              {ver ? (
                <EyeOff size={18} aria-hidden />
              ) : (
                <Eye size={18} aria-hidden />
              )}
            </button>
          </span>
        </label>
        {falla ? (
          <p
            role="alert"
            className="rounded-xl bg-rose-50 p-3 text-sm text-rose-800"
          >
            {falla}
          </p>
        ) : null}
        <button
          type="submit"
          disabled={enviando}
          className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-teal-700 px-4 text-[15px] font-semibold text-white shadow-sm hover:bg-teal-800 disabled:opacity-60"
        >
          <LogIn size={18} aria-hidden />
          {enviando ? "Ingresando…" : "Ingresar"}
        </button>
        <p className="text-center text-xs text-slate-500">
          ¿No tenés usuario? Pedíselo a la farmacia.
        </p>
        {!portada.requireLogin ? (
          <Link
            to={`/${slug}`}
            className="text-center text-sm font-medium text-teal-700 hover:text-teal-900"
          >
            Ver el catálogo sin ingresar
          </Link>
        ) : null}
      </form>
    </div>
  );
}
