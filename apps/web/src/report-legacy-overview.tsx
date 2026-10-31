import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactElement,
  type ReactNode,
} from "react";
import {
  CreditCard,
  Info,
  Package,
  ReceiptText,
  ShoppingCart,
  Trophy,
  Wallet,
} from "lucide-react";
import {
  getReportDetail,
  getReportSummary,
  type ReportDetail,
  type ReportSummary,
} from "./lib/api";
import { formatMoneyMinor } from "./lib/report-format";
import {
  ReportEmptyState,
  ReportErrorState,
  ReportSkeleton,
  reportCardClass,
} from "./report-states";

const ReportChart = lazy(() => import("./report-chart"));

const paymentLabels: Record<string, string> = {
  CASH: "Efectivo",
  CARD: "Tarjeta",
  TRANSFER: "Transferencia",
  ACCOUNT: "Cuenta corriente",
  OTHER: "Otro",
};

function Stat({
  label,
  value,
  note,
  icon,
}: {
  label: string;
  value: string;
  note: string;
  icon: ReactNode;
}): ReactElement {
  return (
    <article className={`${reportCardClass} flex gap-3 px-4 py-3.5`}>
      <span className="grid size-10 shrink-0 place-items-center rounded-full bg-[#e8faf5] text-[#087f70]">
        {icon}
      </span>
      <div className="min-w-0">
        <h3 className="text-xs font-semibold text-slate-600">{label}</h3>
        <p className="mt-1 truncate text-2xl font-bold leading-8 tracking-tight text-slate-900 tabular-nums">
          {value}
        </p>
        <p className="mt-0.5 text-[11px] text-slate-500">{note}</p>
      </div>
    </article>
  );
}

function Panel({
  title,
  icon,
  children,
  className = "",
}: {
  title: string;
  icon: ReactNode;
  children: ReactNode;
  className?: string;
}): ReactElement {
  return (
    <section className={`${reportCardClass} p-4 ${className}`}>
      <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-800">
        <span className="text-[#087f70]">{icon}</span>
        {title}
      </h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function ClosureReportTable({
  title,
  groups,
  monthly = false,
}: {
  title: string;
  groups: ReportDetail["cashClosures"]["daily"];
  monthly?: boolean;
}): ReactElement {
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-100">
      <h3 className="border-b border-slate-100 px-4 py-2.5 text-xs font-semibold text-slate-700">
        {title}
      </h3>
      {groups.length ? (
        <table className="w-full min-w-[400px] text-sm">
          <thead className="bg-[#f6faf9] text-left text-[11px] uppercase text-slate-500">
            <tr>
              <th className="px-4 py-2 font-semibold">Período</th>
              <th className="px-2 py-2 text-right font-semibold">Cierres</th>
              <th className="px-2 py-2 text-right font-semibold">Esperado</th>
              <th className="px-4 py-2 text-right font-semibold">Diferencia</th>
            </tr>
          </thead>
          <tbody>
            {groups.map((group) => (
              <tr key={group.period} className="border-t border-slate-100">
                <td className="px-4 py-2">
                  {monthly
                    ? new Date(
                        `${group.period}-01T12:00:00`,
                      ).toLocaleDateString("es-AR", {
                        month: "long",
                        year: "numeric",
                      })
                    : new Date(`${group.period}T12:00:00`).toLocaleDateString(
                        "es-AR",
                      )}
                </td>
                <td className="px-2 py-2 text-right tabular-nums">
                  {group.count}
                </td>
                <td className="px-2 py-2 text-right tabular-nums">
                  {formatMoneyMinor(group.expectedMinor)}
                </td>
                <td
                  className={`px-4 py-2 text-right font-semibold tabular-nums ${
                    group.differenceMinor === "0"
                      ? "text-[#087f70]"
                      : "text-rose-600"
                  }`}
                >
                  {formatMoneyMinor(group.differenceMinor)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="px-4 py-4 text-sm text-slate-500">
          Sin cierres para este período.
        </p>
      )}
    </div>
  );
}

/**
 * Vista anterior de Reportes (una sucursal por vez), conectada a la barra de
 * filtros nueva. La reemplaza la pestana Resumen real (SISTEMA-5); hasta entonces
 * conserva sus calculos, incluido el efectivo con vuelto (ver REPORTS_PLAN.md).
 */
export function ReportLegacyOverview({
  token,
  organizationId,
  branchId,
  from,
  to,
  notice,
}: {
  token: string;
  organizationId: string;
  branchId: string;
  from: string;
  to: string;
  notice?: string;
}): ReactElement {
  const [data, setData] = useState<{
    summary: ReportSummary;
    detail: ReportDetail;
  }>();
  const [error, setError] = useState<string>();
  const load = useCallback(() => {
    setError(undefined);
    setData(undefined);
    let current = true;
    void Promise.all([
      getReportSummary(token, organizationId, branchId),
      getReportDetail(token, organizationId, branchId, from, to),
    ])
      .then(([summary, detail]) => {
        if (current) setData({ summary, detail });
      })
      .catch((cause: unknown) => {
        if (current)
          setError(
            cause instanceof Error
              ? cause.message
              : "No se pudieron cargar los reportes.",
          );
      });
    return () => {
      current = false;
    };
  }, [token, organizationId, branchId, from, to]);
  useEffect(load, [load]);

  const trendOption = useMemo(() => {
    const days = data?.detail.dailySales ?? [];
    return {
      grid: { left: 8, right: 16, top: 16, bottom: 8, containLabel: true },
      tooltip: {
        trigger: "axis",
        valueFormatter: (value: number) => formatMoneyMinor(String(value)),
      },
      xAxis: {
        type: "category",
        data: days.map((day) =>
          new Date(`${day.date}T12:00:00`).toLocaleDateString("es-AR", {
            day: "2-digit",
            month: "2-digit",
          }),
        ),
      },
      yAxis: {
        type: "value",
        axisLabel: {
          formatter: (value: number) =>
            new Intl.NumberFormat("es-AR", {
              notation: "compact",
              maximumFractionDigits: 1,
            }).format(value / 100),
        },
      },
      series: [
        {
          name: "Ventas",
          type: "bar",
          barMaxWidth: 28,
          itemStyle: { borderRadius: [4, 4, 0, 0] },
          data: days.map((day) => Number(day.totalMinor)),
        },
      ],
    };
  }, [data]);

  if (error) return <ReportErrorState message={error} onRetry={load} />;
  if (!data) return <ReportSkeleton />;
  const { summary, detail } = data;
  const averageMinor = detail.saleCount
    ? String(Math.round(Number(detail.totalSalesMinor) / detail.saleCount))
    : "0";
  const topQuantity = Math.max(
    ...detail.topProducts.map((product) => product.quantity),
    1,
  );
  return (
    <div className="space-y-4">
      <p className="flex items-start gap-2 rounded-lg border border-[#d2eee6] bg-[#f2fbf8] px-3 py-2 text-xs text-[#164e47]">
        <Info size={14} className="mt-0.5 shrink-0" aria-hidden />
        <span>
          Vista anterior mientras se completa el Resumen nuevo.
          {notice ? ` ${notice}` : ""}
        </span>
      </p>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat
          label="Ventas"
          value={String(detail.saleCount)}
          note="operaciones en el período"
          icon={<ShoppingCart size={18} aria-hidden />}
        />
        <Stat
          label="Facturación"
          value={formatMoneyMinor(detail.totalSalesMinor)}
          note="monto total"
          icon={<ReceiptText size={18} aria-hidden />}
        />
        <Stat
          label="Ticket promedio"
          value={formatMoneyMinor(averageMinor)}
          note="por venta"
          icon={<Wallet size={18} aria-hidden />}
        />
        <Stat
          label="Unidades vendidas"
          value={new Intl.NumberFormat("es-AR").format(detail.unitsSold)}
          note="en el período, sin devoluciones"
          icon={<Package size={18} aria-hidden />}
        />
      </div>
      <div className="grid gap-4 xl:grid-cols-[1.4fr_1fr]">
        <Panel
          title="Ventas por día"
          icon={<ReceiptText size={16} aria-hidden />}
        >
          {detail.dailySales.length ? (
            <Suspense fallback={<div className="h-[260px]" />}>
              <ReportChart option={trendOption} label="Ventas por día" />
            </Suspense>
          ) : (
            <ReportEmptyState title="Sin ventas para el período" />
          )}
        </Panel>
        <Panel
          title="Medios de pago"
          icon={<CreditCard size={16} aria-hidden />}
        >
          {detail.payments.length ? (
            <ul className="space-y-2">
              {detail.payments.map((payment) => (
                <li
                  key={payment.method}
                  className="flex items-center justify-between rounded-lg bg-[#f6faf9] px-3 py-2 text-sm"
                >
                  <span className="text-slate-700">
                    {paymentLabels[payment.method] ?? payment.method}
                  </span>
                  <strong className="tabular-nums text-slate-900">
                    {formatMoneyMinor(payment.amountMinor)}
                  </strong>
                </li>
              ))}
            </ul>
          ) : (
            <ReportEmptyState title="Sin cobros para el período" />
          )}
          <div className="mt-3 grid grid-cols-2 gap-2">
            <div className="rounded-lg bg-[#f6faf9] px-3 py-2">
              <p className="text-[11px] font-semibold text-slate-500">
                Vencimientos próximos
              </p>
              <p className="text-lg font-bold tabular-nums">
                {summary.expiringLots}
              </p>
            </div>
            <div className="rounded-lg bg-[#f6faf9] px-3 py-2">
              <p className="text-[11px] font-semibold text-slate-500">
                Compras pendientes
              </p>
              <p className="text-lg font-bold tabular-nums">
                {summary.pendingPurchases}
              </p>
            </div>
          </div>
        </Panel>
      </div>
      <div className="grid gap-4 xl:grid-cols-[1fr_1.4fr]">
        <Panel title="Productos top" icon={<Trophy size={16} aria-hidden />}>
          {detail.topProducts.length ? (
            <ul className="space-y-2.5">
              {detail.topProducts.map((product, index) => (
                <li key={product.productId}>
                  <div className="flex items-baseline justify-between gap-3 text-sm">
                    <span className="truncate text-slate-800">
                      {index + 1}. {product.productName}
                    </span>
                    <span className="shrink-0 text-xs tabular-nums text-slate-500">
                      {product.quantity} u.
                    </span>
                  </div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full bg-[#31826a]"
                      style={{
                        width: `${Math.max((product.quantity / topQuantity) * 100, 4)}%`,
                      }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <ReportEmptyState title="Todavía no hay ventas en el período" />
          )}
        </Panel>
        <Panel
          title={`Cierres de caja (${detail.cashClosures.count})`}
          icon={<Wallet size={16} aria-hidden />}
        >
          <div className="grid gap-2 sm:grid-cols-3">
            {(
              [
                ["Efectivo esperado", detail.cashClosures.expectedMinor],
                ["Efectivo contado", detail.cashClosures.countedMinor],
                ["Diferencia acumulada", detail.cashClosures.differenceMinor],
              ] as const
            ).map(([label, amount]) => (
              <div key={label} className="rounded-lg bg-[#f6faf9] px-3 py-2">
                <p className="text-[11px] font-semibold text-slate-500">
                  {label}
                </p>
                <p className="text-base font-bold tabular-nums">
                  {formatMoneyMinor(amount)}
                </p>
              </div>
            ))}
          </div>
          <div className="mt-3 grid gap-3 2xl:grid-cols-2">
            <ClosureReportTable
              title="Por día"
              groups={detail.cashClosures.daily}
            />
            <ClosureReportTable
              title="Por mes"
              groups={detail.cashClosures.monthly}
              monthly
            />
          </div>
        </Panel>
      </div>
    </div>
  );
}
