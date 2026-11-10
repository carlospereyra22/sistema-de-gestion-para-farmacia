import { apiFetch as fetch, guardadaEl, SinConexionError } from "./api-fetch";
import {
  ALL_BRANCHES,
  REPORT_DEFAULTS,
  type ReportFilterOptions,
  type ReportOverview,
} from "@gestion/contracts";
import {
  argentineToday,
  branchChoices,
  presetRange,
  resolveBranchId,
} from "./report-view";
import { apiBaseUrl } from "./api";

/** Mensaje de la API (400/402/403 en español) o uno genérico. */
async function reportError(response: Response, fallback: string) {
  const body = (await response.json().catch(() => null)) as {
    message?: string | string[];
  } | null;
  const message = Array.isArray(body?.message)
    ? body.message[0]
    : body?.message;
  return new Error(
    [400, 402, 403].includes(response.status)
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

/**
 * Resumen de reportes. Sin conexión (SISTEMA-80, decisión del usuario) se
 * muestra la copia que la PC guardó del servidor, con la hora de esos datos
 * (`guardadaEl`): no incluye lo hecho sin conexión.
 */
export async function getReportOverview(
  token: string,
  organizationId: string,
  view: Parameters<typeof reportQuery>[0],
): Promise<ReportOverview & { guardadaEl?: number }> {
  let response: Response;
  try {
    response = await fetch(
      `${apiBaseUrl}/organizations/${organizationId}/reports/overview?${reportQuery(view)}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
  } catch (cause) {
    if (cause instanceof SinConexionError)
      throw new SinConexionError(
        "Sin conexión: este período no está guardado en la PC. Probá con Hoy, Ayer, Últimos 7 días, Últimos 30 días o Este mes.",
      );
    throw cause;
  }
  if (!response.ok)
    throw await reportError(response, "No se pudo cargar el Resumen.");
  const guardada = guardadaEl(response);
  return {
    ...((await response.json()) as ReportOverview),
    ...(guardada ? { guardadaEl: guardada } : {}),
  };
}

/** Períodos que la PC guarda para ver reportes sin conexión. */
export const PERIODOS_GUARDADOS = [
  "today",
  "yesterday",
  "last7",
  "last30",
  "thisMonth",
] as const;

/**
 * Con conexión, deja guardados en la PC los reportes de los períodos
 * habituales, de todas las sucursales y de la actual (SISTEMA-80). De a uno,
 * para no competir con lo que se está usando.
 */
export async function precargarReportes(
  token: string,
  organizationId: string,
  branchId: string,
  hoy = argentineToday(),
) {
  const opciones = await getReportFilterOptions(token, organizationId);
  const sucursales = new Set(
    [resolveBranchId(ALL_BRANCHES, opciones.branches), branchId].filter((id) =>
      branchChoices(opciones.branches).some((c) => c.id === id),
    ),
  );
  for (const periodo of PERIODOS_GUARDADOS)
    for (const sucursal of sucursales)
      await getReportOverview(token, organizationId, {
        ...presetRange(periodo, hoy),
        branchId: sucursal,
        comparison: REPORT_DEFAULTS.comparison,
      }).catch(() => undefined);
}
