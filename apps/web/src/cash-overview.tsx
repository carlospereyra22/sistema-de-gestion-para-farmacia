import { useState, type ReactNode } from "react";
import {
  ArrowDown,
  ArrowUp,
  CalendarDays,
  Equal,
  ChartNoAxesCombined,
  History,
} from "lucide-react";
import type { CashSession } from "./lib/api";
import { CashRegisterIcon } from "./cash-register-icon";

const amount = (value: string) =>
  (Number(value) / 100).toLocaleString("es-AR", {
    style: "currency",
    currency: "ARS",
  });

export function CashOverview({
  session,
  registerName,
  closedDetails,
}: {
  session?: CashSession;
  registerName?: string;
  closedDetails?: ReactNode;
}) {
  return (
    <>
      <section className="cash-card cash-status">
        <div className="cash-card-heading">
          <span className="cash-icon">
            <CashRegisterIcon size={21} />
          </span>
          <h2>{session ? "Caja abierta" : "Caja cerrada"}</h2>
          <span className={`cash-state ${session ? "is-open" : ""}`}>
            {session ? "Abierta" : "Sin sesión"}
          </span>
        </div>
        <p className="cash-register-name">
          {registerName ?? "Sin caja seleccionada"}
        </p>
        <p className="cash-opened-at">
          <CalendarDays size={14} aria-hidden="true" />
          {session
            ? `Desde ${new Date(session.openedAt).toLocaleString("es-AR")}`
            : "Abrí una sesión para operar con efectivo."}
        </p>
        {session ? (
          <div className="cash-balance">
            {session?.openedBy && (
              <p className="mb-2 text-xs text-slate-500">
                Abierta por {session.openedBy}
              </p>
            )}
            <p className="text-xs text-slate-500">Efectivo esperado</p>
            <strong>{amount(session.expectedAmountMinor)}</strong>
          </div>
        ) : (
          closedDetails
        )}
        {session && (
          <p className="cash-opening-fund">
            <span>Fondo inicial</span>
            <strong>{amount(session.openingAmountMinor)}</strong>
          </p>
        )}
      </section>
      <section className="cash-card cash-summary">
        <div className="cash-card-heading">
          <span className="cash-icon bg-violet-50 text-violet-600">
            <ChartNoAxesCombined size={21} />
          </span>
          <h2>Resumen de la sesión</h2>
          {session && (
            <span className="cash-date" title="Fecha de apertura">
              <CalendarDays size={13} aria-hidden="true" />
              {new Date(session.openedAt).toLocaleDateString("es-AR")}
            </span>
          )}
        </div>
        <div className="cash-summary-values">
          {[
            {
              label: "Ingresos",
              value: session
                ? (
                    BigInt(session.cashSalesMinor) +
                    BigInt(session.manualInMinor)
                  ).toString()
                : undefined,
              Icon: ArrowUp,
              color: "text-teal-700",
              tone: "income",
              detail: "Ventas + otras entradas",
            },
            {
              label: "Egresos",
              value: session?.manualOutMinor,
              Icon: ArrowDown,
              color: "text-slate-600",
              tone: "expense",
              detail: "Salidas de efectivo",
            },
            {
              label: "Saldo esperado",
              value: session?.expectedAmountMinor,
              Icon: Equal,
              color: "text-slate-900",
              tone: "balance",
              detail: "Incluye el fondo inicial",
            },
          ].map(({ label, value, Icon, color, tone, detail }) => (
            <div key={label}>
              <p className="text-sm font-medium text-slate-500">{label}</p>
              <span className={`cash-metric-icon ${tone}`}>
                <Icon size={23} />
              </span>
              <strong
                className={`block break-words text-2xl font-semibold leading-tight tracking-tight tabular-nums ${color}`}
              >
                {value === undefined ? "—" : amount(value)}
              </strong>
              <p className="mt-2 text-xs leading-relaxed text-slate-500">
                {detail}
              </p>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}

export function CashMovements({ session }: { session?: CashSession }) {
  const [all, setAll] = useState(false);
  const rows = [...(session?.movements ?? [])].sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt),
  );
  return (
    <section className="cash-card cash-movements">
      <div className="cash-card-heading">
        <span className="cash-icon bg-slate-50 text-slate-500">
          <History size={20} />
        </span>
        <h2>Últimos movimientos</h2>
        {rows.length > 5 && (
          <button
            type="button"
            className="ml-auto rounded-lg border border-slate-200 px-2 py-1.5 text-xs text-teal-700"
            onClick={() => setAll(!all)}
          >
            {all ? "Ver menos" : "Ver todos"}
          </button>
        )}
      </div>
      <p className="mt-2 text-xs text-slate-500">
        Entradas y salidas de la sesión. Los ingresos del resumen también
        incluyen los cobros de ventas.
      </p>
      <div className="mt-3 max-h-72 overflow-auto">
        {rows.length ? (
          <table className="w-full min-w-[430px] text-left text-xs">
            <thead>
              <tr>
                <th>Fecha y hora</th>
                <th>Tipo</th>
                <th>Concepto</th>
                <th>Usuario</th>
                <th className="text-right">Importe</th>
              </tr>
            </thead>
            <tbody>
              {(all ? rows : rows.slice(0, 5)).map((row) => (
                <tr key={row.id}>
                  <td className="whitespace-nowrap">
                    {new Date(row.createdAt).toLocaleString("es-AR")}
                  </td>
                  <td>
                    <span
                      className={`cash-state ${row.type === "IN" ? "is-open" : "is-out"}`}
                    >
                      {row.type === "IN" ? "↑ Ingreso" : "↓ Egreso"}
                    </span>
                  </td>
                  <td>{row.reason || "Movimiento sin motivo"}</td>
                  <td>{row.actorName ?? "—"}</td>
                  <td
                    className={`whitespace-nowrap text-right font-semibold ${row.type === "IN" ? "text-teal-700" : "text-rose-600"}`}
                  >
                    {row.type === "OUT" ? "− " : "+ "}
                    {amount(row.amountMinor)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="py-10 text-center text-sm text-slate-400">
            {session
              ? "Todavía no hay movimientos en esta sesión."
              : "Los movimientos aparecerán al abrir una caja."}
          </p>
        )}
      </div>
    </section>
  );
}
