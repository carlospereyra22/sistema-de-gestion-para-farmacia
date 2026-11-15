import type { ComponentType } from "react";
import { useAvisoFlotante } from "./aviso-flotante";
import { ContenidoAviso } from "./contenido-aviso";

/**
 * Botón de ícono con ayuda al pasar el mouse o con el teclado, con el estilo
 * de los avisos del sistema (el de la barra lateral) en lugar del `title` del
 * navegador: nombre de la acción y qué hace.
 */
export function BotonConAyuda({
  label,
  title,
  description,
  icon: Icono,
  onClick,
  disabled = false,
  tone = "neutral",
}: {
  /** Para lectores de pantalla (puede incluir el nombre de la fila). */
  label: string;
  /** Lo que se ve en el aviso: el nombre corto de la acción. */
  title: string;
  description?: string;
  icon: ComponentType<{ size?: number }>;
  onClick: () => void;
  disabled?: boolean;
  tone?: "neutral" | "danger";
}) {
  const { disparadores, ocultar, aviso } = useAvisoFlotante();
  return (
    <>
      <button
        type="button"
        aria-label={label}
        aria-description={description}
        disabled={disabled}
        onClick={() => {
          ocultar();
          onClick();
        }}
        {...disparadores}
        onKeyDown={(event) => {
          if (event.key === "Escape") ocultar();
        }}
        className={`rounded-lg p-1.5 transition-colors disabled:opacity-40 ${tone === "danger" ? "text-slate-500 hover:bg-rose-50 hover:text-rose-700" : "text-slate-500 hover:bg-teal-50 hover:text-teal-700"}`}
      >
        <Icono size={16} />
      </button>
      {aviso(<ContenidoAviso titulo={title}>{description}</ContenidoAviso>)}
    </>
  );
}
