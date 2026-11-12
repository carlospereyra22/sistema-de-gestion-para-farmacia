import { BadgePercent, Plus } from "lucide-react";
import type { OfertaMotor } from "./lib/ofertas-motor";

/**
 * Ofertas activas y programadas que incluyen al producto (SISTEMA-103), en el
 * editor de Productos, con acceso al apartado Ofertas.
 */
export function ProductOffersCard({
  ofertas,
  onOpen,
  onCreate,
}: {
  ofertas: {
    oferta: OfertaMotor;
    estado: "ACTIVA" | "PROGRAMADA";
    label: string;
  }[];
  onOpen?: () => void;
  onCreate?: () => void;
}) {
  return (
    <section
      aria-label="Ofertas del producto"
      className="rounded-xl border border-rose-100 bg-rose-50/40 p-3"
    >
      <div className="flex flex-wrap items-center gap-2">
        <BadgePercent size={17} className="text-rose-700" />
        <p className="text-sm font-semibold text-slate-800">Ofertas</p>
        <span className="ml-auto flex gap-2">
          {onOpen && (
            <button
              type="button"
              onClick={onOpen}
              className="text-xs font-medium text-teal-700 underline-offset-2 hover:underline"
            >
              Ver en Ofertas
            </button>
          )}
          {onCreate && (
            <button
              type="button"
              onClick={onCreate}
              className="inline-flex items-center gap-1 text-xs font-medium text-teal-700 underline-offset-2 hover:underline"
            >
              <Plus size={13} /> Crear oferta para este producto
            </button>
          )}
        </span>
      </div>
      {ofertas.length ? (
        <ul className="mt-2 space-y-1 text-sm">
          {ofertas.map(({ oferta, estado, label }) => (
            <li key={oferta.id} className="flex flex-wrap items-center gap-2">
              <span className="rounded-md bg-rose-100 px-1.5 py-0.5 text-xs font-bold text-rose-700">
                {label}
              </span>
              <span>{oferta.name}</span>
              <span className="text-xs text-slate-500">
                {estado === "ACTIVA" ? "Vigente" : "Programada"}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-1 text-sm text-slate-500">
          No tiene ofertas vigentes ni programadas.
        </p>
      )}
    </section>
  );
}
