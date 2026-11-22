import { useCallback, useEffect, useRef, useState } from "react";
import { tocaAnimarReportes } from "./animacion-reportes";

/**
 * Carga de una pestaña. El resultado se guarda con sus filtros: al cambiar un
 * filtro se sigue viendo lo anterior (atenuado, con "Actualizando…") hasta que
 * llega lo nuevo, y números y gráficos van de lo anterior a lo nuevo. De otra
 * organización o con error nunca se muestra lo viejo (SISTEMA-90).
 */
export function useReportResult<T extends object>({
  active,
  organizationId,
  filtros,
  cargar,
  errorPorDefecto,
}: {
  active: boolean;
  organizationId: string;
  /** Todo lo que cambia la consulta: al cambiar, se vuelve a pedir. */
  filtros: readonly unknown[];
  cargar: () => Promise<T>;
  errorPorDefecto: string;
}) {
  const key = JSON.stringify([organizationId, ...filtros]);
  const [result, setResult] = useState<{
    key: string;
    organizationId: string;
    data: T;
  }>();
  const [error, setError] = useState<string>();
  const fresh = result?.key === key;
  const data =
    fresh || (!error && result?.organizationId === organizationId)
      ? result?.data
      : undefined;
  const actualizando = Boolean(data) && !fresh;
  const cargarActual = useRef(cargar);
  cargarActual.current = cargar;
  const load = useCallback(() => {
    let current = true;
    setError(undefined);
    cargarActual
      .current()
      .then((next) => {
        if (current) setResult({ key, organizationId, data: next });
      })
      .catch((cause: unknown) => {
        if (current)
          setError(cause instanceof Error ? cause.message : errorPorDefecto);
      });
    return () => {
      current = false;
    };
  }, [key, organizationId, errorPorDefecto]);
  useEffect(() => {
    if (active) return load();
  }, [active, load]);
  // La entrada animada se decide una sola vez por pantalla, cuando se ve por
  // primera vez con datos: sólo la primera vez de la sesión (SISTEMA-87).
  const decision = useRef<boolean>(undefined);
  const [animar, setAnimar] = useState<boolean>();
  useEffect(() => {
    if (!active || !data) return;
    decision.current ??=
      tocaAnimarReportes() && !(data as { guardadaEl?: number }).guardadaEl;
    setAnimar(decision.current);
  }, [active, data]);
  return { data, error, actualizando, animar, load };
}
