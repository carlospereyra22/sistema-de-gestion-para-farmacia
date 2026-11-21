import { PanelLeftClose, PanelLeftOpen } from "lucide-react";

/**
 * Ícono propio del botón del menú (SISTEMA-110), en el estilo de los íconos
 * del menú lateral: línea fina con detalle. Una ventana con el panel del menú
 * (tres renglones) y una flecha hacia donde va: a la izquierda cierra, a la
 * derecha abre.
 */
function IconoMenuLateral({
  abierto,
  size = 22,
}: {
  abierto: boolean;
  size?: number;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.35}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {/* Ventana */}
      <rect x="2.75" y="4" width="18.5" height="16" rx="2.6" />
      {/* Panel del menú, apenas sombreado */}
      <path
        d="M9.25 4.4v15.2H5.35a2.2 2.2 0 0 1-2.2-2.2V6.6a2.2 2.2 0 0 1 2.2-2.2Z"
        fill="currentColor"
        fillOpacity={0.12}
        stroke="none"
      />
      <path d="M9.25 4v16" />
      {/* Renglones del menú */}
      <path d="M5.1 8.2h2.2M5.1 11h2.2M5.1 13.8h2.2" />
      <circle cx="6.2" cy="16.9" r="0.55" fill="currentColor" stroke="none" />
      {/* Flecha hacia donde va el menú */}
      {abierto ? (
        <path d="M16.6 9.1 13.7 12l2.9 2.9" />
      ) : (
        <path d="M13.9 9.1 16.8 12l-2.9 2.9" />
      )}
    </svg>
  );
}

export function SidebarToggle({
  expanded,
  onToggle,
  enLaMarca = false,
}: {
  expanded: boolean;
  onToggle: () => void;
  /**
   * Dentro de la marca, arriba del menú lateral (SISTEMA-110): abierto va a la
   * derecha del nombre; cerrado aparece sobre el logo al pasar el mouse.
   */
  enLaMarca?: boolean;
}) {
  const label = expanded ? "Contraer barra lateral" : "Expandir barra lateral";
  const Icon = expanded ? PanelLeftClose : PanelLeftOpen;
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-expanded={expanded}
      aria-controls="workspace-navigation"
      onClick={onToggle}
      className={
        enLaMarca
          ? "sidebar-toggle-marca grid size-8 shrink-0 place-items-center rounded-lg text-slate-500 transition-colors hover:bg-marca-970 hover:text-marca-535 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-600"
          : "grid size-9 shrink-0 place-items-center rounded-lg text-slate-500 transition-colors hover:bg-slate-100 hover:text-teal-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-600"
      }
    >
      {enLaMarca ? (
        <IconoMenuLateral abierto={expanded} size={26} />
      ) : (
        <Icon size={20} aria-hidden="true" />
      )}
    </button>
  );
}
