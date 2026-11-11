import type { PlatformOrganization } from "./platform-api";
import type { SubscriptionStage } from "./platform-subscription";

/**
 * Resúmenes del panel de plataforma (SISTEMA-89): la barra de estados de
 * Farmacias y los meses del gráfico de Pagos. Son vistas de lo que ya calcula
 * la API; no deciden nada.
 */

export type GrupoDeEstado = "al-dia" | "aviso" | "cortadas" | "sin-cobro";

export const gruposDeEstado: {
  grupo: GrupoDeEstado;
  etiqueta: string;
  descripcion: string;
  etapas: SubscriptionStage[];
}[] = [
  {
    grupo: "al-dia",
    etiqueta: "Al día o en prueba",
    descripcion: "Usan el sistema completo",
    etapas: ["ACTIVE", "TRIAL"],
  },
  {
    grupo: "aviso",
    etiqueta: "Con aviso",
    descripcion: "En gracia o con prórroga",
    etapas: ["GRACE", "EXTENDED"],
  },
  {
    grupo: "cortadas",
    etiqueta: "Cortadas",
    descripcion: "Solo lectura, bloqueadas o suspendidas",
    etapas: ["READ_ONLY", "BLOCKED", "SUSPENDED"],
  },
  {
    grupo: "sin-cobro",
    etiqueta: "Exentas o de baja",
    descripcion: "No pagan abono",
    etapas: ["EXEMPT", "CANCELLED"],
  },
];

/** Cuántas farmacias hay en cada grupo de estado (las sin plan, aparte). */
export function farmaciasPorEstado(
  farmacias: readonly Pick<PlatformOrganization, "subscription">[],
) {
  return gruposDeEstado.map(({ grupo, etiqueta, descripcion, etapas }) => ({
    grupo,
    etiqueta,
    descripcion,
    cantidad: farmacias.filter(
      ({ subscription }) => subscription && etapas.includes(subscription.stage),
    ).length,
  }));
}

const meses = [
  "ene",
  "feb",
  "mar",
  "abr",
  "may",
  "jun",
  "jul",
  "ago",
  "sep",
  "oct",
  "nov",
  "dic",
];

/** "2026-11" → "nov"; enero muestra el año para ubicarse: "ene 26". */
export function etiquetaDeMes(mes: string): string {
  const [anio, numero] = mes.split("-");
  const nombre = meses[Number(numero) - 1] ?? mes;
  return numero === "01" ? `${nombre} ${anio?.slice(2)}` : nombre;
}
