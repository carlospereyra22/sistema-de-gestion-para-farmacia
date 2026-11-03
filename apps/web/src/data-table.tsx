import type { ReactNode } from "react";
import { ReportHelp } from "./report-states";

// Estilo único de tablas del sistema. Productos es el modelo; el resto de las
// tablas se pasa a este componente de a poco.
// Escala: 14 px para el dato principal, 12 px para lo secundario y encabezados.

type Align = "left" | "right" | "center";

const alignClass: Record<Align, string> = {
  left: "text-left",
  right: "text-right",
  center: "text-center",
};

export type DataTableColumn = {
  label: ReactNode;
  align?: Align;
  className?: string;
  // Explicación de la columna con el mismo ícono y globo de ayuda de Reportes.
  hint?: { title: string; text: string };
};

export function DataTable({
  label,
  columns,
  minWidthClass = "",
  footer,
  children,
}: {
  label: string;
  columns: DataTableColumn[];
  // Clase de Tailwind con el ancho mínimo antes de desplazar, por ejemplo "min-w-235".
  minWidthClass?: string;
  footer?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <div className="overflow-x-auto">
        <table
          aria-label={label}
          className={`w-full text-sm text-slate-700 ${minWidthClass}`}
        >
          <thead className="border-b border-slate-200 bg-[#f3f7f8] text-xs font-semibold uppercase tracking-wide text-slate-500">
            <tr>
              {columns.map((column, index) => (
                <th
                  key={index}
                  scope="col"
                  className={`whitespace-nowrap px-4 py-3 ${alignClass[column.align ?? "left"]} ${column.className ?? ""}`}
                >
                  {column.label}
                  {column.hint ? (
                    // El encabezado va en mayúsculas; el globo, en texto normal.
                    <span className="ml-1 inline-flex align-middle normal-case tracking-normal whitespace-normal">
                      <ReportHelp {...column.hint} />
                    </span>
                  ) : null}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">{children}</tbody>
        </table>
      </div>
      {footer}
    </section>
  );
}

// Con onToggle, tocar cualquier parte de la fila despliega su detalle, salvo
// botones, enlaces, campos y celdas marcadas con ignoreRowClick.
export function DataTableRow({
  onToggle,
  children,
}: {
  onToggle?: () => void;
  children: ReactNode;
}) {
  return (
    <tr
      className={`hover:bg-[#f6faf9] ${onToggle ? "cursor-pointer" : ""}`}
      onClick={
        onToggle
          ? (event) => {
              const target = event.target as Element;
              if (
                target.closest(
                  "button, a, input, select, textarea, label, [data-row-ignore]",
                ) ||
                window.getSelection()?.toString()
              )
                return;
              onToggle();
            }
          : undefined
      }
    >
      {children}
    </tr>
  );
}

export function DataTableCell({
  align = "left",
  numeric = false,
  className = "",
  ignoreRowClick = false,
  children,
}: {
  align?: Align;
  // Números con ancho parejo para que las columnas se lean alineadas.
  numeric?: boolean;
  className?: string;
  ignoreRowClick?: boolean;
  children: ReactNode;
}) {
  return (
    <td
      data-row-ignore={ignoreRowClick || undefined}
      className={`px-4 py-3 align-middle ${alignClass[align]} ${numeric ? "whitespace-nowrap tabular-nums" : ""} ${className}`}
    >
      {children}
    </td>
  );
}

// Dato principal con una línea secundaria opcional debajo.
export function CellText({
  primary,
  secondary,
}: {
  primary: ReactNode;
  secondary?: ReactNode;
}) {
  return (
    <>
      <span className="block font-medium text-slate-800">{primary}</span>
      {secondary ? (
        <span className="mt-0.5 block text-xs text-slate-500">{secondary}</span>
      ) : null}
    </>
  );
}

export type StatusTone = "ok" | "warning" | "danger" | "muted";

const statusDot: Record<StatusTone, string> = {
  ok: "bg-emerald-500",
  warning: "bg-amber-500",
  danger: "bg-rose-500",
  muted: "bg-slate-400",
};

export function StatusLabel({
  tone,
  children,
}: {
  tone: StatusTone;
  children: ReactNode;
}) {
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-xs font-medium text-slate-600">
      <span
        aria-hidden="true"
        className={`size-2 rounded-full ${statusDot[tone]}`}
      />
      {children}
    </span>
  );
}

// Fila que se despliega debajo de otra con información de detalle.
export function DataTableDetailRow({
  id,
  colSpan,
  children,
}: {
  id: string;
  colSpan: number;
  children: ReactNode;
}) {
  return (
    <tr id={id} className="bg-slate-50/80">
      <td colSpan={colSpan} className="py-2 pl-24 pr-4">
        {children}
      </td>
    </tr>
  );
}

const actionTone = {
  edit: "bg-teal-50 text-teal-700 hover:bg-teal-100",
  neutral: "bg-slate-100 text-slate-600 hover:bg-slate-200",
  danger: "bg-rose-50 text-rose-500 hover:bg-rose-100",
} as const;

// Botón de ícono para la columna Acciones, con el mismo estilo que
// Categorías y laboratorios. label va al lector de pantalla y al tooltip.
export function RowIconAction({
  label,
  title,
  tone,
  onClick,
  disabled = false,
  children,
}: {
  label: string;
  title: string;
  tone: keyof typeof actionTone;
  onClick: () => void;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={title}
      disabled={disabled}
      onClick={onClick}
      className={`rounded-lg p-2 transition-colors disabled:opacity-40 ${actionTone[tone]}`}
    >
      {children}
    </button>
  );
}

export function DataTableEmpty({
  colSpan,
  children,
}: {
  colSpan: number;
  children: ReactNode;
}) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-4 py-10 text-center text-slate-500">
        {children}
      </td>
    </tr>
  );
}
