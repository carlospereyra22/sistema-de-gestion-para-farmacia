import type { ReportFilterOptions, ReportOverview } from "@gestion/contracts";
import { apiBaseUrl } from "./api";

/** Mensaje de la API (400/403 en espanol) o uno generico. */
async function reportError(response: Response, fallback: string) {
  const body = (await response.json().catch(() => null)) as {
    message?: string | string[];
  } | null;
  const message = Array.isArray(body?.message)
    ? body.message[0]
    : body?.message;
  return new Error(
    response.status === 403 || response.status === 400
      ? (message ?? fallback)
      : fallback,
  );
}

export async function getReportFilterOptions(
  token: string,
  organizationId: string,
): Promise<ReportFilterOptions> {
  const response = await fetch(
    `${apiBaseUrl}/organizations/${organizationId}/reports/filter-options`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!response.ok)
    throw await reportError(
      response,
      "No se pudieron cargar los filtros de reportes.",
    );
  return (await response.json()) as ReportFilterOptions;
}

/** Filtros comunes que viajan en la URL de cada reporte. */
export function reportQuery(view: {
  from: string;
  to: string;
  branchId: string;
  comparison: string;
}) {
  return new URLSearchParams({
    from: view.from,
    to: view.to,
    branchId: view.branchId,
    comparison: view.comparison,
  }).toString();
}

export async function getReportOverview(
  token: string,
  organizationId: string,
  view: Parameters<typeof reportQuery>[0],
): Promise<ReportOverview> {
  const response = await fetch(
    `${apiBaseUrl}/organizations/${organizationId}/reports/overview?${reportQuery(view)}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!response.ok)
    throw await reportError(response, "No se pudo cargar el Resumen.");
  return (await response.json()) as ReportOverview;
}
