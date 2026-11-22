import { useState, type ReactElement, type ReactNode } from "react";
import type { ReportTrendUnit } from "@gestion/contracts";
import { getReportTab, type ReportTabResponses } from "./lib/reports-api";
import { useReportResult } from "./lib/use-report-result";
import type { ReportView } from "./lib/report-view";
import { ReportUpdatingFrame } from "./report-panel";
import { ReportErrorState, ReportSkeleton } from "./report-states";

/**
 * Carga de una pestaña de Reportes (SISTEMA-116): esqueleto, error con
 * reintento y "Actualizando…" al cambiar filtros, igual que el Resumen. La
 * agrupación temporal (Día / Semana / Mes) la elige la pestaña.
 */
export function ReportTabLoader<K extends keyof ReportTabResponses>({
  tab,
  token,
  organizationId,
  view,
  active,
  children,
}: {
  tab: K;
  token: string;
  organizationId: string;
  view: ReportView;
  active: boolean;
  children: (props: {
    data: ReportTabResponses[K];
    animar: boolean;
    onGranularity: (unit: ReportTrendUnit) => void;
  }) => ReactNode;
}): ReactElement {
  const { from, to, branchId, comparison } = view;
  const [granularity, setGranularity] = useState<ReportTrendUnit>();
  const { data, error, actualizando, animar, load } = useReportResult({
    active,
    organizationId,
    filtros: [tab, from, to, branchId, comparison, granularity],
    cargar: () =>
      getReportTab(tab, token, organizationId, {
        from,
        to,
        branchId,
        comparison,
        granularity,
      }),
    errorPorDefecto: "No se pudo cargar el reporte.",
  });
  if (!data || animar === undefined)
    return error ? (
      <ReportErrorState message={error} onRetry={load} />
    ) : (
      <ReportSkeleton />
    );
  return (
    <ReportUpdatingFrame actualizando={actualizando}>
      {children({ data, animar, onGranularity: setGranularity })}
    </ReportUpdatingFrame>
  );
}
