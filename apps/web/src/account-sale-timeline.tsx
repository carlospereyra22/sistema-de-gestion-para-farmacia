import {
  ArrowLeftRight,
  Banknote,
  CreditCard,
  HandCoins,
  ReceiptText,
  TrendingUp,
  RotateCcw,
  CircleAlert,
} from "lucide-react";
import { chronologicalEvents } from "./lib/account-due-presentation";
import type { DueSaleDetail } from "./lib/account-due-sale";

const money = (value: string) =>
  (Number(value) / 100).toLocaleString("es-AR", {
    style: "currency",
    currency: "ARS",
  });
function appearance(
  event: DueSaleDetail["events"][number],
  method?: string | null,
) {
  if (event.kind === "due")
    return {
      icon: CircleAlert,
      color: "bg-rose-100 text-rose-600",
      title: "Vencimiento alcanzado",
      prefix: "Saldo al vencer:",
    };
  if (event.kind === "reversal")
    return {
      icon: RotateCcw,
      color: "bg-amber-100 text-amber-700",
      title: event.title,
      prefix: "Se compensaron",
    };
  if (event.kind === "payment")
    return {
      icon:
        method === "TRANSFER"
          ? ArrowLeftRight
          : method === "CASH"
            ? Banknote
            : method === "CARD"
              ? CreditCard
              : HandCoins,
      color: "bg-teal-100 text-teal-700",
      title:
        method === "TRANSFER"
          ? "Pago por transferencia"
          : method === "CASH"
            ? "Pago en efectivo"
            : method === "CARD"
              ? "Pago con tarjeta"
              : method === "OTHER"
                ? "Pago combinado"
                : "Cobro aplicado",
      prefix: "Se acreditaron",
    };
  if (event.title === "Actualización del saldo")
    return {
      icon: TrendingUp,
      color: "bg-violet-100 text-violet-600",
      title: event.title,
      prefix: "Se ajustó el saldo en",
    };
  return {
    icon: ReceiptText,
    color: "bg-blue-100 text-blue-600",
    title: "Venta registrada",
    prefix: "Venta a cuenta corriente por",
  };
}
export function AccountSaleTimeline({ data }: { data: DueSaleDetail }) {
  return (
    <section
      className="account-sale-timeline"
      aria-label="Historial de la venta"
    >
      <div className="mb-4 flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-slate-800">
          Historial de movimientos
        </h3>
        <span className="shrink-0 text-[11px] text-slate-400">
          {data.events.length} {data.events.length === 1 ? "evento" : "eventos"}
        </span>
      </div>
      <ol className="relative space-y-4 before:absolute before:bottom-5 before:left-4 before:top-5 before:w-px before:bg-slate-200">
        {chronologicalEvents(data.events).map((event) => {
          const payment = data.payments.find((p) => p.id === event.id);
          const {
            icon: Icon,
            color,
            title,
            prefix,
          } = appearance(event, payment?.method);
          const detail = event.detail?.trim();
          const technicalSaleNote = detail === `Sale ${data.id}`;
          return (
            <li
              key={event.id}
              data-event-kind={event.kind}
              className="relative flex items-start gap-3"
            >
              <span
                aria-hidden="true"
                className={`relative z-10 mt-1 flex size-8 shrink-0 items-center justify-center rounded-full ring-4 ring-white ${color}`}
              >
                <Icon size={16} strokeWidth={1.8} />
              </span>
              <article className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-3 py-3.5">
                <h4 className="text-[13px] font-semibold leading-5 text-slate-800">
                  {title}
                </h4>
                <time
                  dateTime={event.at}
                  className="mt-0.5 block text-[10px] tabular-nums text-slate-400"
                >
                  {new Date(event.at).toLocaleString("es-AR", {
                    timeZone: "America/Argentina/Buenos_Aires",
                    day: "2-digit",
                    month: "2-digit",
                    year: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                    hour12: false,
                  })}
                </time>
                <p className="mt-2 text-xs leading-5 text-slate-500">
                  {prefix}{" "}
                  <strong className="font-semibold text-slate-700">
                    {money(event.amountMinor)}
                  </strong>
                  {event.kind === "payment" ? " a la venta." : "."}
                </p>
                {detail && !technicalSaleNote && !event.calculated && (
                  <p className="mt-1 break-words text-[11px] leading-5 text-slate-500">
                    {detail}
                  </p>
                )}
                <p
                  className="mt-2 text-[10px] leading-4 text-slate-400"
                  title={
                    event.calculated ? (event.detail ?? undefined) : undefined
                  }
                >
                  {event.calculated
                    ? "Hito calculado según vencimiento y asignaciones"
                    : `Usuario: ${event.actor ?? "Sin informar"}`}
                </p>
                {event.settled && (
                  <span
                    className="mt-2 inline-block rounded-md bg-teal-50 px-2 py-1 text-[10px] font-medium text-teal-700"
                    title="Saldo cubierto según las asignaciones disponibles."
                  >
                    Saldo cubierto
                  </span>
                )}
              </article>
            </li>
          );
        })}
      </ol>
      {!data.events.length && (
        <p className="py-8 text-center text-sm text-slate-500">
          No hay movimientos disponibles.
        </p>
      )}
    </section>
  );
}
