import { useEffect, useRef } from "react";
import {
  BadgePercent,
  ChartColumn,
  ClipboardList,
  HandCoins,
  LayoutDashboard,
  LogOut,
  Settings,
  ShoppingCart,
  Store,
  Truck,
} from "lucide-react";

import { cambiarTema } from "./lib/tema";
import { SECCIONES, type SeccionPreventa } from "./lib/preventa";
import type { ContextoPreventa } from "./lib/preventa-api";
import { TemaSwitch } from "./tema-switch";
import { useTema } from "./use-tema";

/** Ícono y color de cada sección (fondo suave + ícono del mismo tono). */
const ICONOS_SECCION: Record<
  SeccionPreventa,
  { icono: typeof Store; clases: string }
> = {
  nuevo: { icono: ShoppingCart, clases: "bg-emerald-100 text-emerald-700" },
  pedidos: { icono: ClipboardList, clases: "bg-sky-100 text-sky-700" },
  clientes: { icono: Store, clases: "bg-violet-100 text-violet-700" },
  reparto: { icono: Truck, clases: "bg-amber-100 text-amber-700" },
  ofertas: { icono: BadgePercent, clases: "bg-rose-100 text-rose-700" },
  comisiones: { icono: HandCoins, clases: "bg-teal-100 text-teal-700" },
  resumen: { icono: ChartColumn, clases: "bg-indigo-100 text-indigo-700" },
  configuracion: { icono: Settings, clases: "bg-slate-200 text-slate-700" },
};

const GRUPOS: { titulo: string | null; secciones: SeccionPreventa[] }[] = [
  { titulo: null, secciones: ["nuevo", "pedidos", "clientes"] },
  { titulo: "Entregas", secciones: ["reparto"] },
  {
    titulo: "Gestión",
    secciones: ["ofertas", "comisiones", "resumen", "configuracion"],
  },
];

function rol(permisos: ContextoPreventa["permisos"]) {
  if (permisos.administrar) return "Administra la preventa";
  if (permisos.vender && permisos.repartir) return "Preventista y repartidor";
  return permisos.vender ? "Preventista" : "Repartidor";
}

/**
 * Menú lateral de la preventa en el celular (SISTEMA-108), como el de la app
 * de preventistas: farmacia y rol arriba, secciones agrupadas, modo oscuro,
 * ir a la gestión y cerrar sesión.
 */
export function PreventaMenuLateral({
  abierto,
  contexto,
  organizationName,
  visibles,
  actual,
  pendientes,
  onIr,
  onCerrar,
  onIrAGestion,
  onLogout,
}: {
  abierto: boolean;
  contexto: ContextoPreventa;
  organizationName?: string;
  visibles: SeccionPreventa[];
  actual: SeccionPreventa;
  pendientes: number;
  onIr: (seccion: SeccionPreventa) => void;
  onCerrar: () => void;
  onIrAGestion?: () => void;
  onLogout?: () => void;
}) {
  const tema = useTema();
  const panel = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!abierto) return;
    const tecla = (evento: KeyboardEvent) => {
      if (evento.key === "Escape") onCerrar();
    };
    document.addEventListener("keydown", tecla);
    panel.current?.focus();
    return () => document.removeEventListener("keydown", tecla);
  }, [abierto, onCerrar]);
  const farmacia = organizationName || contexto.comprobante.farmacia;
  return (
    <div
      className={`fixed inset-0 z-50 transition-opacity ${
        abierto ? "opacity-100" : "pointer-events-none opacity-0"
      }`}
      aria-hidden={!abierto}
    >
      <button
        type="button"
        aria-label="Cerrar menú"
        tabIndex={abierto ? 0 : -1}
        onClick={onCerrar}
        className="absolute inset-0 bg-velo/40"
      />
      <nav
        ref={panel}
        tabIndex={-1}
        aria-label="Menú de la preventa"
        className={`absolute inset-y-0 left-0 flex w-[min(82vw,320px)] flex-col overflow-y-auto bg-white shadow-2xl outline-none transition-transform ${
          abierto ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="grid justify-items-center gap-1 bg-teal-700 px-5 pb-5 pt-8 text-center text-white">
          <span className="grid size-20 place-items-center rounded-full bg-white text-2xl font-bold text-teal-700 shadow-md ring-4 ring-white/30">
            {farmacia
              .split(/\s+/)
              .filter(Boolean)
              .slice(0, 2)
              .map((p) => p[0]?.toUpperCase())
              .join("")}
          </span>
          <p className="mt-2 text-lg font-bold leading-tight">{farmacia}</p>
          <p className="text-sm text-white/85">{contexto.usuario.nombre}</p>
          <p className="text-xs text-white/70">{rol(contexto.permisos)}</p>
        </div>
        <div className="flex-1 px-3 py-3">
          {GRUPOS.map((grupo) => {
            const propias = grupo.secciones.filter((s) => visibles.includes(s));
            if (!propias.length) return null;
            return (
              <div
                key={grupo.titulo ?? "principal"}
                className="border-b border-slate-100 py-2 last:border-0"
              >
                {grupo.titulo ? (
                  <p className="px-3 pb-1 pt-1 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                    {grupo.titulo}
                  </p>
                ) : null}
                <ul className="grid gap-0.5">
                  {propias.map((s) => {
                    const { icono: Icono, clases } = ICONOS_SECCION[s];
                    const activa = s === actual;
                    return (
                      <li key={s}>
                        <button
                          type="button"
                          tabIndex={abierto ? 0 : -1}
                          aria-current={activa ? "page" : undefined}
                          onClick={() => onIr(s)}
                          className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-[15px] font-semibold ${
                            activa
                              ? "bg-teal-50 text-teal-800 ring-1 ring-teal-200"
                              : "text-slate-700 hover:bg-slate-50"
                          }`}
                        >
                          <span
                            className={`grid size-9 place-items-center rounded-xl ${clases}`}
                          >
                            <Icono size={19} aria-hidden />
                          </span>
                          <span className="flex-1">{SECCIONES[s].label}</span>
                          {s === "pedidos" && pendientes ? (
                            <span className="rounded-full bg-amber-400 px-2 text-xs font-bold text-slate-900">
                              {pendientes}
                            </span>
                          ) : null}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </div>
        <div className="grid gap-2 border-t border-slate-100 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <div className="rounded-xl border border-slate-200">
            <TemaSwitch tema={tema} onChange={cambiarTema} />
          </div>
          {onIrAGestion ? (
            <button
              type="button"
              tabIndex={abierto ? 0 : -1}
              onClick={onIrAGestion}
              className="flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              <LayoutDashboard size={17} aria-hidden /> Ir a la gestión
            </button>
          ) : null}
          {onLogout ? (
            <button
              type="button"
              tabIndex={abierto ? 0 : -1}
              onClick={onLogout}
              className="flex min-h-11 items-center justify-center gap-2 rounded-xl border-2 border-rose-300 text-sm font-bold text-rose-600 hover:bg-rose-50"
            >
              <LogOut size={17} aria-hidden /> Cerrar sesión
            </button>
          ) : null}
        </div>
      </nav>
    </div>
  );
}
