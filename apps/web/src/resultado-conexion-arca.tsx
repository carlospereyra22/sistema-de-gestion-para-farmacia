import type { ReactElement } from "react";
import { AlertTriangle, CheckCircle2, WifiOff } from "lucide-react";
import type { ResultadoDeConexion } from "./lib/errores-arca";

/**
 * Resultado de "Probar conexión con ARCA" en palabras simples, con qué hacer
 * y el detalle técnico desplegable (SISTEMA-97).
 */
export function ResultadoConexionArca({
  resultado,
}: {
  resultado: ResultadoDeConexion;
}): ReactElement {
  const ok = resultado.tipo === "conectado";
  const icono = ok ? (
    <CheckCircle2 size={20} aria-hidden="true" />
  ) : resultado.tipo === "sin-conexion" ? (
    <WifiOff size={20} aria-hidden="true" />
  ) : (
    <AlertTriangle size={20} aria-hidden="true" />
  );
  return (
    <div
      role="status"
      className={`mt-4 rounded-xl border p-4 ${ok ? "border-teal-200 bg-teal-50 text-teal-900" : "border-amber-200 bg-amber-50 text-amber-950"}`}
    >
      <p className="flex items-center gap-2 font-semibold">
        {icono}
        {resultado.titulo}
      </p>
      <p className="mt-1 text-sm leading-6">{resultado.queHacer}</p>
      {resultado.detalle && (
        <details className="mt-2 text-xs">
          <summary className="cursor-pointer underline">
            Ver detalle técnico
          </summary>
          <p className="mt-1 break-words opacity-80">{resultado.detalle}</p>
        </details>
      )}
    </div>
  );
}
