import { useEffect, useState } from "react";
import { apiBaseUrl, type CashClosure } from "./lib/api";
import { CashDialog } from "./cash-dialog";

export type ClosureDetail = Omit<CashClosure, "movements"> & {
  snapshotAvailable: boolean;
  openedBy: string;
  closedBy: string | null;
  reason: string | null;
  archived: boolean;
  movements: (CashClosure["movements"][number] & { actorName: string })[];
  cashPayments: {
    id: string;
    saleId: string;
    amountMinor: string;
    createdAt: string;
  }[];
};
const money = (value: string) =>
  (Number(value) / 100).toLocaleString("es-AR", {
    style: "currency",
    currency: "ARS",
  });

export function CashClosureContent({ detail }: { detail: ClosureDetail }) {
  const entries = [
    ...detail.movements.map((movement) => ({
      id: movement.id,
      date: movement.createdAt,
      label: movement.reason,
      actor: movement.actorName,
      amount: movement.amountMinor,
      out: movement.type === "OUT",
    })),
    ...detail.cashPayments.map((payment) => ({
      id: payment.id,
      date: payment.createdAt,
      label: `Venta · ${payment.saleId.slice(0, 8)}`,
      actor: "—",
      amount: payment.amountMinor,
      out: false,
    })),
  ].sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-semibold text-teal-800">
          {detail.cashRegisterName}
        </h3>
        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-500">
          {detail.archived ? "Cierre archivado" : "Sesión cerrada"} · Solo
          lectura
        </span>
      </div>
      <dl className="mt-4 grid gap-4 rounded-xl bg-slate-50 p-4 text-sm sm:grid-cols-2">
        {detail.registerResponsibleName && (
          <div className="sm:col-span-2">
            <dt className="text-xs text-slate-500">
              Responsable de caja al cierre
            </dt>
            <dd className="mt-1">{detail.registerResponsibleName}</dd>
          </div>
        )}
        <div>
          <dt className="text-xs text-slate-500">Apertura</dt>
          <dd className="mt-1">
            {new Date(detail.openedAt).toLocaleString("es-AR")} ·{" "}
            {detail.openedBy}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-slate-500">Cierre</dt>
          <dd className="mt-1">
            {new Date(detail.closedAt!).toLocaleString("es-AR")} ·{" "}
            {detail.closedBy ?? "Responsable no registrado"}
          </dd>
        </div>
      </dl>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        {[
          ["Efectivo esperado", detail.expectedAmountMinor],
          ["Efectivo contado", detail.closingAmountMinor],
          ["Diferencia", detail.differenceMinor],
        ].map(([label, value]) => (
          <div
            key={label}
            className={`rounded-xl border p-4 ${label === "Diferencia" && value !== "0" ? "border-amber-100 bg-amber-50 text-amber-800" : "border-teal-100 bg-teal-50/50 text-teal-800"}`}
          >
            <p className="text-xs">{label}</p>
            <p className="mt-2 text-xl font-semibold">
              {value === null ? "No registrado" : money(value!)}
            </p>
          </div>
        ))}
      </div>
      {!detail.snapshotAvailable && (
        <p className="mt-3 rounded-lg bg-amber-50 p-3 text-xs text-amber-800">
          Cierre histórico sin saldo esperado guardado en auditoría. El importe
          se reconstruye con los registros disponibles.
        </p>
      )}
      <p className="mt-3 text-sm text-slate-600">
        <span className="font-medium">Motivo de diferencia: </span>
        {detail.reason ||
          (detail.differenceMinor === "0" ? "No corresponde" : "No registrado")}
      </p>
      <div className="mt-5 flex flex-wrap gap-x-6 gap-y-2 text-xs text-slate-500">
        <span>Fondo inicial: {money(detail.openingAmountMinor)}</span>
        <span>Cobros de ventas: {money(detail.cashSalesMinor)}</span>
        <span>Otras entradas: {money(detail.manualInMinor)}</span>
        <span>Salidas: {money(detail.manualOutMinor)}</span>
      </div>
      <h3 className="mt-5 text-sm font-semibold">
        Movimientos de efectivo asociados
      </h3>
      <div className="mt-3 max-h-[38dvh] overflow-auto rounded-xl border border-slate-200">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs text-slate-500">
            <tr>
              <th className="p-3">Fecha</th>
              <th className="p-3">Concepto</th>
              <th className="p-3">Usuario</th>
              <th className="p-3 text-right">Importe</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry) => (
              <tr key={entry.id} className="border-t border-slate-100">
                <td className="whitespace-nowrap p-3 text-xs">
                  {new Date(entry.date).toLocaleString("es-AR")}
                </td>
                <td className="min-w-48 p-3">{entry.label}</td>
                <td className="p-3 text-xs text-slate-500">{entry.actor}</td>
                <td
                  className={`whitespace-nowrap p-3 text-right font-medium ${entry.out ? "text-amber-700" : "text-teal-700"}`}
                >
                  {entry.out ? "− " : "+ "}
                  {money(entry.amount)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!entries.length && (
          <p className="p-5 text-center text-sm text-slate-500">
            No hay movimientos registrados en esta sesión.
          </p>
        )}
      </div>
    </>
  );
}

export function CashClosureDetail({
  token,
  organizationId,
  branchId,
  id,
  onClose,
}: {
  token: string;
  organizationId: string;
  branchId: string;
  id: string;
  onClose: () => void;
}) {
  const [detail, setDetail] = useState<ClosureDetail>();
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    void fetch(
      `${apiBaseUrl}/organizations/${organizationId}/branches/${branchId}/cash/closures/${id}`,
      {
        headers: { Authorization: `Bearer ${token}` },
        signal: controller.signal,
      },
    )
      .then(async (response) => {
        if (!response.ok)
          throw new Error(
            "No se pudo consultar el cierre. Revisá tu acceso y volvé a intentarlo.",
          );
        return (await response.json()) as ClosureDetail;
      })
      .then((value) => {
        if (!controller.signal.aborted) setDetail(value);
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted)
          setError(
            cause instanceof Error
              ? cause.message
              : "No se pudo consultar el cierre.",
          );
      });
    return () => controller.abort();
  }, [token, organizationId, branchId, id]);
  return (
    <CashDialog title="Detalle del cierre" wide onClose={onClose}>
      {error ? (
        <p
          role="alert"
          className="rounded-lg bg-rose-50 p-4 text-sm text-rose-700"
        >
          {error}
        </p>
      ) : detail ? (
        <CashClosureContent detail={detail} />
      ) : (
        <p role="status" className="py-8 text-center text-sm text-slate-500">
          Consultando cierre…
        </p>
      )}
    </CashDialog>
  );
}
