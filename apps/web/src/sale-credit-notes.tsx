import { useEffect, useRef, useState } from "react";
import {
  saleCreditOperation,
  getCash,
  type CreditDetail,
  type FiscalTrial,
  type CashSession,
} from "./lib/api";
import { trialTicket } from "./lib/fiscal-trial-ticket";
import { printTicketFrame } from "./lib/browser-ticket-print";
const money = (minor: number) =>
  new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS" }).format(
    minor / 100,
  );
type Settlement = {
  accountMinor: number;
  refundMinor: number;
  settledAt: string | null;
};
export function SaleCreditNotes({
  token,
  organizationId,
  branchId,
  saleId,
  initialMode = "create",
}: {
  token: string;
  organizationId: string;
  branchId: string;
  saleId: string;
  initialMode?: "create" | "list";
}) {
  const [showForm, setShowForm] = useState(initialMode === "create");
  const [data, setData] = useState<CreditDetail>();
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [reason, setReason] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const locked = useRef(false);
  const requestId = useRef(crypto.randomUUID());
  const [selected, setSelected] = useState<FiscalTrial>();
  const [settlement, setSettlement] = useState<Settlement>();
  const [method, setMethod] = useState<"CASH" | "CARD" | "TRANSFER">("CASH");
  const [reference, setReference] = useState("");
  const [received, setReceived] = useState(false);
  const [settleConfirmed, setSettleConfirmed] = useState(false);
  const [sessions, setSessions] = useState<CashSession[]>([]);
  const [sessionId, setSessionId] = useState("");
  const frame = useRef<HTMLIFrameElement>(null);
  useEffect(() => {
    let active = true;
    void saleCreditOperation<CreditDetail>(
      token,
      organizationId,
      branchId,
      saleId,
    )
      .then((value) => {
        if (active) setData(value);
      })
      .catch((cause: unknown) => {
        if (active)
          setError(
            cause instanceof Error
              ? cause.message
              : "No se pudieron cargar las notas.",
          );
      });
    return () => {
      active = false;
    };
  }, [token, organizationId, branchId, saleId]);
  async function run(action: () => Promise<void>) {
    if (locked.current) return;
    locked.current = true;
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "No se pudo completar. Consultá el resultado antes de repetir.",
      );
    } finally {
      locked.current = false;
      setBusy(false);
    }
  }
  async function reload() {
    setData(
      await saleCreditOperation<CreditDetail>(
        token,
        organizationId,
        branchId,
        saleId,
      ),
    );
  }
  async function show(doc: FiscalTrial) {
    setSelected(doc);
    setSettlement(undefined);
    setSettleConfirmed(false);
    setReference("");
    if (doc.status === "AUTHORIZED" && !doc.settledAt) {
      setSettlement(
        await saleCreditOperation<Settlement>(
          token,
          organizationId,
          branchId,
          saleId,
          `/${doc.id}/settlement`,
        ),
      );
      try {
        const cash = await getCash(token, organizationId, branchId);
        setSessions(cash.sessions.filter((s) => !s.closedAt));
      } catch {
        setSessions([]);
      }
    }
  }
  return (
    <section className="mt-5 border-t pt-4">
      <h3 className="font-semibold">Notas de crédito · Producción</h3>
      {showForm && (
        <p className="mt-2 text-xs text-slate-600">
          Seleccioná sólo las cantidades a devolver. La nota ajusta la factura;
          el reintegro y la recepción se registran después, sin reponer stock
          vendible automáticamente.
        </p>
      )}
      {!data && !error && (
        <p role="status" className="mt-3 text-sm text-slate-500">
          Consultando notas de crédito…
        </p>
      )}
      <button
        type="button"
        disabled={busy}
        onClick={() => setShowForm(!showForm)}
        className="my-2 mr-4 text-sm text-teal-700 underline"
      >
        {showForm ? "Ver notas existentes" : "Preparar nueva nota de crédito"}
      </button>
      {error && (
        <p role="alert" className="my-2 text-sm text-red-700">
          {error}
        </p>
      )}
      <button
        type="button"
        disabled={busy}
        onClick={() => void run(reload)}
        className="my-2 text-sm text-teal-700 underline"
      >
        Actualizar notas y cantidades
      </button>
      {data && showForm && (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void run(async () => {
              const doc = await saleCreditOperation<FiscalTrial>(
                token,
                organizationId,
                branchId,
                saleId,
                "",
                {
                  requestId: requestId.current,
                  reason,
                  confirmProduction: confirmed,
                  items: data.items
                    .filter((item) => (quantities[item.id] ?? 0) > 0)
                    .map((item) => ({
                      saleItemId: item.id,
                      quantity: quantities[item.id],
                    })),
                },
              );
              requestId.current = crypto.randomUUID();
              setQuantities({});
              setConfirmed(false);
              setShowForm(false);
              await reload();
              await show(doc);
            });
          }}
        >
          <fieldset disabled={busy} className="space-y-2">
            {data.items.map((item) => (
              <label
                key={item.id}
                className="flex items-center justify-between gap-2 text-sm"
              >
                <span>
                  {item.name}
                  <small className="block text-slate-500">
                    Disponibles para acreditar: {item.available}
                  </small>
                </span>
                <input
                  aria-label={`Cantidad a acreditar de ${item.name}`}
                  type="number"
                  min={0}
                  max={item.available}
                  step={1}
                  value={quantities[item.id] ?? 0}
                  onChange={(e) =>
                    setQuantities({
                      ...quantities,
                      [item.id]: Number(e.target.value),
                    })
                  }
                  className="w-20 rounded border p-2"
                />
              </label>
            ))}
            <label className="block text-sm">
              Motivo
              <input
                required
                minLength={3}
                maxLength={300}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="mt-1 w-full rounded border p-2"
              />
            </label>
            <label className="flex gap-2 text-xs">
              <input
                type="checkbox"
                required
                checked={confirmed}
                onChange={(e) => setConfirmed(e.target.checked)}
              />
              Confirmo emitir una nota de crédito real por las cantidades
              seleccionadas.
            </label>
            <button
              type="submit"
              disabled={
                !confirmed || !Object.values(quantities).some((n) => n > 0)
              }
              className="rounded bg-teal-700 px-3 py-2 text-sm text-white disabled:opacity-50"
            >
              Emitir nota de crédito
            </button>
          </fieldset>
        </form>
      )}
      <div className="mt-4 space-y-2">
        {data && !data.credits.length && (
          <p className="text-sm text-slate-500">
            Esta venta todavía no tiene notas de crédito.
          </p>
        )}
        {data?.credits.map((doc) => (
          <button
            key={doc.id}
            type="button"
            disabled={busy}
            onClick={() => void run(() => show(doc))}
            className="block w-full rounded border p-2 text-left text-xs"
          >
            NC{" "}
            {doc.number
              ? `${String(doc.point).padStart(5, "0")}-${String(doc.number).padStart(8, "0")}`
              : "pendiente"}{" "}
            · {money(doc.totalMinor)} · {doc.status}
            {doc.status === "AUTHORIZED"
              ? doc.settledAt
                ? " · liquidada"
                : " · reintegro pendiente"
              : ""}
          </button>
        ))}
      </div>
      {selected && (
        <div className="mt-3 rounded border p-3">
          <p className="text-sm">{selected.detail}</p>
          {selected.status !== "AUTHORIZED" &&
            selected.status !== "REJECTED" && (
              <button
                type="button"
                disabled={busy}
                className="my-2 text-sm text-teal-700 underline"
                onClick={() =>
                  void run(async () => {
                    const doc = await saleCreditOperation<FiscalTrial>(
                      token,
                      organizationId,
                      branchId,
                      saleId,
                      `/${selected.id}/process`,
                      {},
                    );
                    await reload();
                    await show(doc);
                  })
                }
              >
                {selected.status === "QUEUED"
                  ? "Enviar nota pendiente"
                  : "Consultar resultado sin reenviar"}
              </button>
            )}
          {selected.status === "AUTHORIZED" && (
            <>
              <button
                type="button"
                className="my-2 text-sm text-teal-700 underline"
                onClick={() =>
                  void run(async () => {
                    if (frame.current) await printTicketFrame(frame.current);
                  })
                }
              >
                Imprimir nota · 80 mm
              </button>
              <iframe
                ref={frame}
                title="Nota de crédito autorizada"
                srcDoc={trialTicket(selected)}
                className="h-72 w-full border"
              />
            </>
          )}
          {settlement && !settlement.settledAt && (
            <form
              className="mt-3 space-y-2"
              onSubmit={(event) => {
                event.preventDefault();
                void run(async () => {
                  await saleCreditOperation(
                    token,
                    organizationId,
                    branchId,
                    saleId,
                    `/${selected.id}/settlement`,
                    {
                      expectedAccountMinor: settlement.accountMinor,
                      expectedRefundMinor: settlement.refundMinor,
                      method,
                      cashSessionId:
                        method === "CASH" ? sessionId || undefined : undefined,
                      reference,
                      received,
                      confirm: settleConfirmed,
                    },
                  );
                  setSettlement(undefined);
                  await reload();
                  setSelected({
                    ...selected,
                    settledAt: new Date().toISOString(),
                  });
                });
              }}
            >
              <p className="text-sm">
                Reducción de deuda: {money(settlement.accountMinor)}
                <br />
                Dinero a devolver: {money(settlement.refundMinor)}
              </p>
              <fieldset disabled={busy} className="space-y-2">
                {settlement.refundMinor > 0 && (
                  <>
                    <label className="block text-sm">
                      Medio del reintegro
                      <select
                        value={method}
                        onChange={(e) =>
                          setMethod(e.target.value as typeof method)
                        }
                        className="ml-2 rounded border p-1"
                      >
                        <option value="CASH">Efectivo</option>
                        <option value="CARD">Tarjeta</option>
                        <option value="TRANSFER">Transferencia</option>
                      </select>
                    </label>
                    {method === "CASH" && (
                      <select
                        aria-label="Caja del reintegro"
                        required
                        value={sessionId}
                        onChange={(e) => setSessionId(e.target.value)}
                        className="w-full rounded border p-2"
                      >
                        <option value="">Elegí una caja abierta</option>
                        {sessions.map((s) => (
                          <option key={s.id} value={s.id}>
                            Caja · {s.id.slice(0, 8)}
                          </option>
                        ))}
                      </select>
                    )}
                  </>
                )}
                <label className="block text-sm">
                  Referencia del reintegro o compensación
                  <input
                    required
                    minLength={3}
                    maxLength={300}
                    value={reference}
                    onChange={(e) => setReference(e.target.value)}
                    className="w-full rounded border p-2"
                  />
                </label>
                <label className="flex gap-2 text-xs">
                  <input
                    type="checkbox"
                    checked={received}
                    onChange={(e) => setReceived(e.target.checked)}
                  />
                  Recibí la mercadería. Queda fuera del stock vendible.
                </label>
                <label className="flex gap-2 text-xs">
                  <input
                    required
                    type="checkbox"
                    checked={settleConfirmed}
                    onChange={(e) => setSettleConfirmed(e.target.checked)}
                  />
                  Confirmo los importes y que realicé el reintegro indicado. El
                  sistema no envía transferencias ni procesa reembolsos de
                  tarjeta.
                </label>
                <button
                  type="submit"
                  className="rounded bg-teal-700 px-3 py-2 text-sm text-white"
                >
                  Registrar liquidación
                </button>
              </fieldset>
            </form>
          )}
        </div>
      )}
    </section>
  );
}
