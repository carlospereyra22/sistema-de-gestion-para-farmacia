import type { ReactNode } from "react";

/** Título y detalle del aviso, con la tipografía del sistema. */
export function ContenidoAviso({
  titulo,
  children,
}: {
  titulo: string;
  children?: ReactNode;
}) {
  return (
    <>
      <p className="text-[13px] font-semibold leading-[18px] text-[#115e59]">
        {titulo}
      </p>
      {children && (
        <div className="mt-0.5 text-xs leading-4 text-slate-600">
          {children}
        </div>
      )}
    </>
  );
}
