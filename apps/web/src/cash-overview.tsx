import type { ReactNode } from "react";
import { AlertCircle, CalendarDays, History, Wallet } from "lucide-react";
import type { CashRecentActivity, CashSession } from "./lib/api";
import {
  cashMoney,
  cashSessionTotals,
  cashTimeline,
} from "./lib/cash-session-view";

export function CashStatusBar({
  session,
  registerName,
  registerPicker,
  responsibleName,
  pending,
  onPending,
}: {
  session?: CashSession;
  registerName?: string;
  registerPicker?: ReactNode;
  responsibleName?: string | null;
  /** Sin dato si la consulta falló: el acceso sigue disponible. */
  pending?: { count: number; totalMinor: bigint };
  onPending: () => void;
}) {
  return (
    <section className="cash-card cash-bar">
      <div className="cash-bar-register">
        {registerPicker ?? (
          <p className="cash-register-name">
            {registerName ?? "Sin caja seleccionada"}
          </p>
        )}
      </div>
      <span className={`cash-state ${session ? "is-open" : ""}`}>
        {session ? "Abierta" : "Cerrada"}
      </span>
      <p className="cash-bar-detail">
        <CalendarDays size={14} aria-hidden="true" />
        <span>
          {session
            ? `Desde ${new Date(session.openedAt).toLocaleString("es-AR", {
                hourCycle: "h23",
                dateStyle: "short",
                timeStyle: "short",
              })}${session.openedBy ? ` · Abrió ${session.openedBy}` : ""}`
            : "Abrí una sesión para operar con efectivo."}
          {responsibleName ? ` · Responsable: ${responsibleName}` : ""}
        </span>
      </p>
      <button
        type="button"
        onClick={onPending}
        className={`cash-bar-pending ${pending?.count ? "has-pending" : ""}`}
      >
        {pending?.count ? (
          <AlertCircle size={15} aria-hidden="true" />
        ) : (
          <Wallet size={15} aria-hidden="true" />
        )}
        {!pending
          ? "Cobros pendientes"
          : pending.count === 0
            ? "Sin cobros pendientes"
            : `${pending.count} ${pending.count === 1 ? "cobro pendiente" : "cobros pendientes"} · ${cashMoney(pending.totalMinor)}`}
      </button>
    </section>
  );
}

export function CashMetrics({ session }: { session: CashSession }) {
  const { collectedMinor, otherInMinor, outflowsMinor } =
    cashSessionTotals(session);
  const detail = [
    `Fondo ${cashMoney(session.openingAmountMinor)}`,
    ...(otherInMinor > 0n ? [`Ingresos ${cashMoney(otherInMinor)}`] : []),
    ...(outflowsMinor > 0n ? [`Salidas ${cashMoney(outflowsMinor)}`] : []),
  ].join(" · ");
  return (
    <div className="cash-metrics">
      {[
        {
          label: "Efectivo esperado",
          value: session.expectedAmountMinor,
          note: detail,
          main: true,
        },
        {
          label: "Efectivo cobrado",
          value: collectedMinor,
          note: "Ventas y cobros, sin vuelto",
        },
        {
          label: "Tarjeta",
          value: session.cardMinor,
          note: "No entra al efectivo",
        },
        {
          label: "Transferencia",
          value: session.transferMinor,
          note: "No entra al efectivo",
        },
      ].map(({ label, value, note, main }) => (
        <div key={label} className={`cash-metric ${main ? "is-main" : ""}`}>
          <p className="cash-metric-label">{label}</p>
          <strong>{cashMoney(value)}</strong>
          <p className="cash-metric-note">{note}</p>
        </div>
      ))}
    </div>
  );
}

export function CashTimeline({
  session,
  recent,
}: {
  session?: CashSession;
  /** Con la caja cerrada: actividad de los últimos 7 días. */
  recent?: { activity?: CashRecentActivity; failed?: boolean };
}) {
  const source = session ?? recent?.activity;
  const rows = source ? cashTimeline(source) : [];
  const empty = session
    ? "Todavía no hay movimientos en esta sesión."
    : !recent
      ? "Los movimientos aparecerán al abrir una caja."
      : recent.failed
        ? "No se pudieron consultar los movimientos."
        : recent.activity
          ? "Sin movimientos en los últimos 7 días."
          : "Consultando movimientos…";
  return (
    <section className="cash-card cash-movements">
      <div className="cash-card-heading">
        <span className="cash-icon bg-slate-50 text-slate-500">
          <History size={20} />
        </span>
        <h2>Últimos movimientos</h2>
      </div>
      <p className="mt-2 text-xs text-slate-500">
        Ventas en efectivo, vueltos, cobros y movimientos manuales{" "}
        {session ? "de la sesión." : "de los últimos 7 días."}
      </p>
      <div className="cash-movements-list mt-3">
        {rows.length ? (
          <table className="w-full min-w-[430px] text-left text-xs">
            <thead>
              <tr>
                <th>{session ? "Hora" : "Fecha"}</th>
                <th>Concepto</th>
                <th>Usuario</th>
                <th className="text-right">Importe</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td className="whitespace-nowrap">
                    {session
                      ? new Date(row.date).toLocaleTimeString("es-AR", {
                          hourCycle: "h23",
                          hour: "2-digit",
                          minute: "2-digit",
                        })
                      : new Date(row.date).toLocaleString("es-AR", {
                          hourCycle: "h23",
                          dateStyle: "short",
                          timeStyle: "short",
                        })}
                  </td>
                  <td>{row.label}</td>
                  <td>{row.actor}</td>
                  <td
                    className={`whitespace-nowrap text-right font-semibold ${row.out ? "text-rose-600" : "text-teal-700"}`}
                  >
                    {row.out ? "− " : "+ "}
                    {cashMoney(row.amountMinor)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="py-10 text-center text-sm text-slate-400">{empty}</p>
        )}
      </div>
    </section>
  );
}
