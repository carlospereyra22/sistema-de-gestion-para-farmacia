import {
  createContext,
  lazy,
  Suspense,
  useContext,
  type CSSProperties,
  type ReactElement,
  type ReactNode,
} from "react";
import { Info, RefreshCw } from "lucide-react";
import type { EChartsCoreOption, ECElementEvent } from "echarts/core";
import type { TipoAnimacionGrafico } from "./lib/animacion-reportes";
import { useEntrada, type EstadoEntrada } from "./lib/use-reportes-movimiento";
import { reportCardClass } from "./report-states";

/**
 * Piezas comunes de las pestañas de Reportes (SISTEMA-115): todas se ven y se
 * mueven igual que el Resumen (SISTEMA-87, SISTEMA-90).
 */

const ReportChart = lazy(() => import("./report-chart"));

/**
 * Entrada del panel que contiene a un gráfico: el gráfico se monta (y se dibuja)
 * recién cuando el panel entra en pantalla.
 */
const EntradaPanel = createContext<{ animar: boolean; estado: EstadoEntrada }>({
  animar: false,
  estado: "lista",
});

/**
 * Tarjeta de un widget. Con la entrada animada aparece la primera vez que
 * entra en pantalla, no todas juntas al cargar. `action` va a la derecha del
 * título (por ejemplo, un selector Día / Semana / Mes).
 */
export function ReportPanel({
  title,
  icon,
  hint,
  action,
  orden = 0,
  animar = false,
  className = "",
  children,
}: {
  title: string;
  icon: ReactNode;
  hint?: ReactNode;
  action?: ReactNode;
  /** Orden de aparición dentro de su fila. */
  orden?: number;
  animar?: boolean;
  className?: string;
  children: ReactNode;
}): ReactElement {
  const [ref, estado] = useEntrada<HTMLElement>(animar);
  return (
    <section
      ref={ref}
      data-entrada={estado}
      className={`${reportCardClass} reportes-entrada reportes-panel min-w-0 p-4 ${className}`}
      style={{ "--orden": orden } as CSSProperties}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-800">
            <span className="text-marca-535">{icon}</span>
            {title}
          </h2>
          {hint ? (
            <p className="mt-0.5 text-[11px] text-slate-500">{hint}</p>
          ) : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      <div className="mt-3">
        <EntradaPanel.Provider value={{ animar, estado }}>
          {children}
        </EntradaPanel.Provider>
      </div>
    </section>
  );
}

/** Gráfico dentro de un `ReportPanel`: espera a que el panel entre en pantalla. */
export function ReportPanelChart({
  option,
  label,
  height = 260,
  tipo,
  onSelect,
}: {
  option: EChartsCoreOption;
  label: string;
  height?: number;
  tipo: TipoAnimacionGrafico;
  onSelect?: (event: ECElementEvent) => void;
}): ReactElement {
  const { animar, estado } = useContext(EntradaPanel);
  // Mismo alto mientras espera: nada salta cuando el gráfico aparece.
  const lugar = <div style={{ height }} />;
  if (estado === "pendiente") return lugar;
  return (
    <Suspense fallback={lugar}>
      <ReportChart
        option={option}
        label={label}
        height={height}
        animacion={tipo}
        animarEntrada={animar}
        onSelect={onSelect}
      />
    </Suspense>
  );
}

/**
 * Selector compacto de opciones excluyentes (Día / Semana / Mes, Importe /
 * Unidades), con el mismo estilo de las pestañas de Reportes.
 */
export function ReportSegmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: readonly { id: T; label: string }[];
  onChange: (value: T) => void;
}): ReactElement {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="inline-flex gap-0.5 rounded-lg border border-niebla-913 bg-white p-0.5"
    >
      {options.map((option) => {
        const active = option.id === value;
        return (
          <button
            key={option.id}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(option.id)}
            className={`inline-flex h-7 items-center rounded-md px-2.5 transition-[background-color,color] duration-200 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500/30 ${
              active
                ? "bg-marca-970 text-marca-535 ring-1 ring-inset ring-marca-908"
                : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
            }`}
          >
            {/* La letra va en el span: `button { font: inherit }` le gana a la clase. */}
            <span className="text-xs font-medium">{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}

/** Aclaraciones sobre los datos, como nota sobria debajo de las tarjetas. */
export function ReportWarnings({
  warnings,
}: {
  warnings: readonly string[];
}): ReactElement | null {
  if (!warnings.length) return null;
  return (
    <ul className="space-y-1.5" aria-label="Aclaraciones sobre los datos">
      {warnings.map((warning) => (
        <li
          key={warning}
          className="flex items-start gap-2.5 rounded-xl border border-niebla-913 bg-slate-50 px-3.5 py-2.5 text-xs leading-5 text-slate-600"
        >
          <span className="grid size-5 shrink-0 place-items-center rounded-full bg-marca-970 text-marca-535">
            <Info size={12} aria-hidden />
          </span>
          <span>
            <strong className="font-semibold text-slate-800">
              Para tener en cuenta:
            </strong>{" "}
            {warning}
          </span>
        </li>
      ))}
    </ul>
  );
}

/** Marco de una pestaña ya cargada: "Actualizando…" mientras llega lo nuevo. */
export function ReportUpdatingFrame({
  actualizando,
  children,
}: {
  actualizando: boolean;
  children: ReactNode;
}): ReactElement {
  return (
    <div className="relative" aria-busy={actualizando}>
      {actualizando ? (
        <p
          role="status"
          className="reportes-actualizando pointer-events-none absolute -top-2.5 right-3 z-10 inline-flex items-center gap-1.5 rounded-full border border-marca-908 bg-white px-2.5 py-0.5 text-[11px] font-semibold text-marca-535 shadow-sm"
        >
          <RefreshCw
            size={11}
            className="motion-safe:animate-spin"
            aria-hidden
          />
          Actualizando…
        </p>
      ) : null}
      <div
        className={`transition-opacity duration-200 ${actualizando ? "opacity-70 delay-150" : ""}`}
      >
        {children}
      </div>
    </div>
  );
}

export type ReportInsightItem = {
  icon: ReactNode;
  title: string;
  value: string;
  detail?: ReactNode;
  tone?: "good" | "bad" | "neutral";
};

/** Lectura rápida: tarjetas chicas con lo que más conviene mirar del período. */
export function ReportInsightList({
  items,
}: {
  items: readonly ReportInsightItem[];
}): ReactElement {
  return (
    <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
      {items.map((item, index) => (
        <li
          key={item.title}
          className="reportes-fila flex min-w-0 items-start gap-3 rounded-lg border border-slate-100 px-3 py-2.5"
          style={{ "--fila": index } as CSSProperties}
        >
          <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-marca-970 text-marca-535">
            {item.icon}
          </span>
          <span className="min-w-0">
            <span className="block text-[11px] text-slate-500">
              {item.title}
            </span>
            <span
              className="block truncate text-sm font-semibold text-slate-800 tabular-nums"
              title={item.value}
            >
              {item.value}
            </span>
            {item.detail ? (
              <span
                className={`block text-[11px] tabular-nums ${
                  item.tone === "good"
                    ? "text-emerald-700"
                    : item.tone === "bad"
                      ? "text-rose-600"
                      : "text-slate-500"
                }`}
              >
                {item.detail}
              </span>
            ) : null}
          </span>
        </li>
      ))}
    </ul>
  );
}

export type ReportColumn<T> = {
  label: string;
  /** Montos y cantidades a la derecha. */
  numeric?: boolean;
  render: (row: T) => ReactNode;
  /** Clase extra de la celda (color de mora, por ejemplo). */
  tone?: (row: T) => string;
};

/**
 * Tabla de reportes: encabezado suave, filas que aparecen en la primera
 * entrada, montos alineados a la derecha y desplazamiento horizontal en
 * pantallas chicas.
 */
export function ReportTable<T>({
  rows,
  columns,
  rowKey,
  minWidth = 560,
  empty,
}: {
  rows: readonly T[];
  columns: readonly ReportColumn<T>[];
  rowKey: (row: T) => string;
  minWidth?: number;
  empty: string;
}): ReactElement {
  if (!rows.length)
    return <p className="py-6 text-center text-sm text-slate-500">{empty}</p>;
  return (
    <div className="max-h-[420px] overflow-auto">
      <table className="w-full text-sm" style={{ minWidth }}>
        <thead className="sticky top-0 z-[1] bg-slate-50 text-left text-[11px] uppercase text-slate-500">
          <tr>
            {columns.map((column) => (
              <th
                key={column.label}
                className={`px-3 py-2 font-semibold ${column.numeric ? "text-right" : ""}`}
              >
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr
              key={rowKey(row)}
              className="reportes-fila border-t border-slate-100 transition-colors duration-150 hover:bg-slate-50"
              style={{ "--fila": Math.min(index, 12) } as CSSProperties}
            >
              {columns.map((column) => (
                <td
                  key={column.label}
                  className={`px-3 py-2 ${column.numeric ? "text-right tabular-nums" : "text-slate-800"} ${column.tone?.(row) ?? ""}`}
                >
                  {column.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
