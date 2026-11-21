import type { ButtonHTMLAttributes, ReactNode } from "react";

export type VarianteBoton = "primario" | "secundario" | "suave" | "peligro";

// Sello del sistema (SISTEMA-110): el ícono va en su recuadro, como en el
// menú activo, la tarjeta de la caja y Venta actual; y la tecla, a la vista,
// como "Agregar Enter" en Ventas. Así un botón no se ve genérico.
const ESTILOS: Record<
  VarianteBoton,
  { boton: string; icono: string; tecla: string }
> = {
  primario: {
    boton:
      "bg-teal-700 text-white shadow-[inset_0_1px_0_rgb(255_255_255/0.18),0_6px_14px_-6px_rgb(8_127_112/0.6)] hover:bg-teal-800",
    icono: "bg-white/15 text-white",
    tecla: "border-white/40 text-teal-50",
  },
  secundario: {
    boton:
      "border border-slate-200 bg-white text-slate-700 shadow-sm hover:border-marca-908 hover:bg-marca-970 hover:text-marca-535",
    icono: "bg-slate-50 text-teal-700 group-hover:bg-white",
    tecla: "border-slate-300 text-slate-500",
  },
  suave: {
    boton:
      "border border-marca-908 bg-marca-970 text-marca-535 hover:border-teal-300 hover:bg-white",
    icono: "bg-white text-teal-700 group-hover:bg-marca-970",
    tecla: "border-teal-300 text-teal-700",
  },
  peligro: {
    boton:
      "border border-rose-200 bg-white text-rose-700 shadow-sm hover:bg-rose-50",
    icono: "bg-rose-50 text-rose-600 group-hover:bg-white",
    tecla: "border-rose-200 text-rose-600",
  },
};

/**
 * Botón del sistema. Siempre con ícono (de lucide, 15-16 px). `tecla` muestra
 * el atajo ("Esc", "Enter") cuando lo hay. Ver .agents/skills/diseno-sistema.
 */
export function Boton({
  variante = "secundario",
  icono,
  tecla,
  alto = "h-10",
  className = "",
  children,
  ...props
}: {
  variante?: VarianteBoton;
  icono: ReactNode;
  tecla?: string;
  /** h-10 en formularios y diálogos; h-12 en una fila de filtros. */
  alto?: "h-10" | "h-12";
  children: ReactNode;
} & ButtonHTMLAttributes<HTMLButtonElement>) {
  const estilo = ESTILOS[variante];
  return (
    <button
      type="button"
      {...props}
      className={`group inline-flex shrink-0 items-center gap-2 whitespace-nowrap rounded-xl pl-1.5 ${tecla ? "pr-2.5" : "pr-3.5"} ${alto} transition-[background-color,border-color,color,box-shadow] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-600 disabled:cursor-not-allowed disabled:opacity-50 ${estilo.boton} ${className}`}
    >
      <span
        aria-hidden
        className={`grid size-7 shrink-0 place-items-center rounded-lg transition-colors ${estilo.icono}`}
      >
        {icono}
      </span>
      {/* En spans: "font: inherit" de los botones pisaría el tamaño. */}
      <span className="text-sm font-semibold">{children}</span>
      {tecla && (
        <kbd
          className={`rounded-md border px-1.5 text-[10px] font-semibold leading-4 ${estilo.tecla}`}
        >
          {tecla}
        </kbd>
      )}
    </button>
  );
}
