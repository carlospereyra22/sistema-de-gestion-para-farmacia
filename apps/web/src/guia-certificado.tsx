import { useState, type ReactElement, type ReactNode } from "react";
import { ExternalLink } from "lucide-react";

export type PasoDeLaGuia = {
  titulo: string;
  /** Una línea, sin jerga. */
  resumen: string;
  /** El detalle, con las siglas entre paréntesis. */
  verMas?: ReactNode;
  /** Botón o formulario del paso. */
  accion?: ReactNode;
};

export const ENLACE_ARCA =
  "https://auth.afip.gob.ar/contribuyente_/login.xhtml";

export function EnlaceExterno({
  href,
  children,
}: {
  href: string;
  children: ReactNode;
}): ReactElement {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 text-teal-700 underline"
    >
      {children}
      <ExternalLink size={13} aria-hidden="true" />
    </a>
  );
}

/**
 * Guía numerada para conseguir el certificado la primera vez (SISTEMA-97).
 * Las casillas son una ayuda visual para la persona: no guardan nada ni
 * marcan la configuración como hecha (eso lo dice el servidor).
 */
export function GuiaPrimeraVez({
  pasos,
}: {
  pasos: PasoDeLaGuia[];
}): ReactElement {
  const [hechos, setHechos] = useState<boolean[]>(() => pasos.map(() => false));
  return (
    <ol
      aria-label="Guía para conseguir el certificado"
      className="mt-4 space-y-3"
    >
      {pasos.map((paso, indice) => (
        <li
          key={paso.titulo}
          className={`rounded-xl border p-4 ${hechos[indice] ? "border-teal-200 bg-teal-50/50" : "border-slate-200 bg-white"}`}
        >
          <div className="flex items-start gap-3">
            <input
              type="checkbox"
              aria-label={`Marcar como hecho: ${paso.titulo}`}
              className="mt-1 size-4 shrink-0 accent-teal-700"
              checked={hechos[indice] ?? false}
              onChange={(event) =>
                setHechos((actuales) =>
                  actuales.map((valor, i) =>
                    i === indice ? event.target.checked : valor,
                  ),
                )
              }
            />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-slate-900">
                {indice + 1}. {paso.titulo}
              </p>
              <p className="mt-0.5 text-sm text-slate-600">{paso.resumen}</p>
              {paso.accion && <div className="mt-3">{paso.accion}</div>}
              {paso.verMas && (
                <details className="mt-2 text-sm">
                  <summary className="cursor-pointer text-teal-700">
                    Ver más
                  </summary>
                  <div className="mt-2 space-y-2 leading-6 text-slate-600">
                    {paso.verMas}
                  </div>
                </details>
              )}
            </div>
          </div>
        </li>
      ))}
    </ol>
  );
}
