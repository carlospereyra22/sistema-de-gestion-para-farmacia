import {
  AlertCircle,
  CalendarCheck,
  CalendarClock,
  ChevronRight,
  ClipboardList,
  Infinity as InfinityIcon,
} from "lucide-react";
import type { AccountDueRow, DueFilter } from "./lib/account-due-dates";

export function AccountDueOverview({
  rows,
  compact = false,
}: {
  rows: AccountDueRow[];
  compact?: boolean;
}) {
  const groups = [
    {
      status: "OVERDUE",
      label: "Saldo vencido",
      icon: AlertCircle,
      color: "#be4563",
    },
    {
      status: "TODAY",
      label: "Vence hoy",
      icon: CalendarClock,
      color: "#b77918",
    },
    {
      status: "UPCOMING",
      label: "Próximos vencimientos",
      icon: CalendarCheck,
      color: "#2874a6",
    },
    ...(!compact
      ? [
          {
            status: "UNDATED",
            label: "Sin vencimiento",
            icon: InfinityIcon,
            color: "#64748b",
          },
        ]
      : []),
  ];
  return (
    <dl
      aria-label="Resumen de vencimientos"
      className={
        compact
          ? "grid divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white sm:grid-cols-3 sm:divide-x sm:divide-y-0"
          : "grid gap-3 sm:grid-cols-2 xl:grid-cols-4"
      }
    >
      {groups.map(({ status, label, icon: Icon, color }) => {
        const items = rows.filter(
          (row) => row.status === status && row.pendingMinor !== null,
        );
        const amount = items.reduce(
          (sum, item) => sum + BigInt(item.pendingMinor!),
          0n,
        );
        if (compact) {
          return (
            <div key={status} className="relative min-w-0 px-3 py-2.5 pl-12">
              <dt className="text-[10px] font-medium uppercase tracking-wide text-slate-500">
                <span
                  className="absolute left-3 top-3 flex h-7 w-7 items-center justify-center rounded-lg bg-slate-50"
                  style={{ color }}
                >
                  <Icon size={15} aria-hidden="true" />
                </span>
                {label}
              </dt>
              <dd className="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                <span
                  className="text-base font-semibold tabular-nums"
                  style={{ color }}
                >
                  {(Number(amount) / 100).toLocaleString("es-AR", {
                    style: "currency",
                    currency: "ARS",
                  })}
                </span>
                <span className="text-[10px] text-slate-500">
                  {items.length}{" "}
                  {items.length === 1 ? "venta pendiente" : "ventas pendientes"}
                </span>
              </dd>
            </div>
          );
        }
        return (
          <div
            key={status}
            className="relative min-w-0 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm"
            style={{ borderTopWidth: 3, borderTopColor: color }}
          >
            <span
              className="absolute right-4 top-3 flex h-8 w-8 items-center justify-center rounded-lg bg-slate-50"
              style={{ color }}
              aria-hidden="true"
            >
              <Icon size={16} />
            </span>
            <div className="min-w-0">
              <dt className="pr-10 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                {label}
              </dt>
              <dd
                className="mt-2 break-words pr-10 text-xl font-semibold tabular-nums"
                style={{ color }}
              >
                {(Number(amount) / 100).toLocaleString("es-AR", {
                  style: "currency",
                  currency: "ARS",
                })}
              </dd>
              <p className="mt-1 text-[10px] text-slate-500">
                {items.length}{" "}
                {items.length === 1 ? "venta pendiente" : "ventas pendientes"}
              </p>
            </div>
          </div>
        );
      })}
    </dl>
  );
}
export function AccountDueFollowup({
  rows,
  onFilter,
}: {
  rows: AccountDueRow[];
  onFilter: (filter: DueFilter) => void;
}) {
  const review = rows.filter((row) => row.status === "REVIEW").length;
  const undated = rows.filter((row) => row.status === "UNDATED").length;
  return (
    <aside aria-label="Seguimiento de cuentas" className="space-y-3">
      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-800">
          <ClipboardList size={16} className="text-violet-600" />
          Seguimiento
        </h3>
        <p className="mt-1 text-[11px] leading-5 text-slate-500">
          Revisá las cuentas que necesitan completar información.
        </p>
        {(
          [
            {
              count: review,
              title: "Por conciliar",
              note: "Cobros o devoluciones a revisar",
              filter: "REVIEW",
              color: "bg-amber-50 text-amber-700",
            },
            {
              count: undated,
              title: "Sin vencimiento",
              note: "Ventas sin una fecha asignada",
              filter: "UNDATED",
              color: "bg-slate-100 text-slate-600",
            },
          ] as const
        ).map((item) => (
          <button
            type="button"
            key={item.filter}
            onClick={() => onFilter(item.filter)}
            className="mt-3 flex w-full items-center gap-2.5 rounded-lg border border-slate-100 px-2.5 py-3 text-left hover:bg-slate-50"
          >
            <span
              className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-sm font-semibold ${item.color}`}
            >
              {item.count}
            </span>
            <span className="min-w-0 flex-1">
              <strong className="block text-xs font-medium text-slate-700">
                {item.title}
              </strong>
              <span className="mt-1 block text-[10px] leading-4 text-slate-500">
                {item.note}
              </span>
            </span>
            <ChevronRight size={14} className="text-slate-400" />
          </button>
        ))}
      </section>
      <section className="rounded-xl border border-teal-100 bg-teal-50/60 p-4">
        <h3 className="flex items-center gap-2 text-xs font-semibold text-teal-800">
          <CalendarClock size={15} />
          Cómo se calcula
        </h3>
        <p className="mt-2 text-xs leading-5 text-teal-800/80">
          Días corridos desde cada venta. Los pagos parciales conservan el
          vencimiento original.
        </p>
        <p className="mt-2 text-[11px] leading-5 text-teal-700">
          Los avisos no bloquean ventas ni generan recargos.
        </p>
      </section>
    </aside>
  );
}
