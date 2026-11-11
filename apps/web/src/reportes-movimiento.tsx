import { type ReactElement } from "react";
import { useNumeroAnimado } from "./lib/use-reportes-movimiento";

// Número animado de Reportes (SISTEMA-90). Sólo presentación: el valor final es
// siempre el dato del sistema, formateado tal cual.

/**
 * Texto de un número animado. `valor` es el dato del sistema (centavos o
 * unidades en string) y `formato` lo presenta: los cuadros intermedios se
 * redondean al centavo/unidad y el último muestra el dato original exacto. El
 * lector de pantalla lee sólo el valor final, no cada cuadro.
 */
export function NumeroAnimado({
  valor,
  formato,
  entrada,
  listo,
  retraso,
  duracionEntrada,
  decimales = false,
}: {
  valor: string;
  formato: (valor: string) => string;
  entrada: boolean;
  listo?: boolean;
  retraso?: number;
  duracionEntrada?: number;
  /** El valor admite decimales (porcentajes); si no, se redondea. */
  decimales?: boolean;
}): ReactElement {
  const destino = Number(valor);
  const mostrado = useNumeroAnimado(destino, {
    entrada,
    listo,
    retraso,
    duracionEntrada,
  });
  const final = formato(valor);
  if (mostrado === destino) return <>{final}</>;
  const intermedio = decimales ? mostrado : Math.round(mostrado);
  return (
    <>
      <span aria-hidden>
        {formato(String(intermedio === 0 ? 0 : intermedio))}
      </span>
      <span className="sr-only">{final}</span>
    </>
  );
}
