import type { ButtonHTMLAttributes, ReactNode } from "react";

/**
 * Botón de la barra de arriba de cada pantalla (SISTEMA-110): ícono en su
 * recuadro y dos líneas (de qué es y qué abre), igual que la tarjeta de la
 * caja en Ventas. Mismo alto, borde y radio que esa tarjeta.
 */
export function BotonEncabezado({
  icono,
  sobre,
  titulo,
  className = "",
  ...props
}: {
  icono: ReactNode;
  /** Línea chica de arriba: la sección ("Ventas", "Compras"). */
  sobre: string;
  /** Lo que abre ("Historial"). */
  titulo: string;
} & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      {...props}
      // Con !: la barra de arriba achica los botones en notebooks.
      className={`group flex h-11! min-h-11! shrink-0 items-center gap-2.5 rounded-xl! border border-slate-200 bg-white pl-1.5! pr-3.5! text-left shadow-sm transition-colors hover:border-marca-908 hover:bg-marca-970 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-600 disabled:opacity-50 ${className}`}
    >
      <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-slate-50 text-teal-700 transition-colors group-hover:bg-white">
        {icono}
      </span>
      {/* En spans: "font: inherit" de los botones pisaría el tamaño. */}
      <span className="leading-tight">
        <span className="block text-[11px] font-medium text-slate-500">
          {sobre}
        </span>
        <span className="block text-sm font-semibold text-slate-800">
          {titulo}
        </span>
      </span>
    </button>
  );
}
