import { useEffect, useRef, useState } from "react";
import { trialTicket } from "./lib/fiscal-trial-ticket";
import {
  fiscalTesting,
  type FiscalConnection,
  type FiscalTrial,
} from "./lib/api";
import { printTicketFrame } from "./lib/browser-ticket-print";

const money = (minor: number) =>
  new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS" }).format(
    minor / 100,
  );
export function FiscalTesting({
  token,
  organizationId,
  onConnected,
}: {
  token: string;
  organizationId: string;
  onConnected?: () => void;
}) {
  const [connection, setConnection] = useState<FiscalConnection>();
  const [trials, setTrials] = useState<FiscalTrial[]>([]);
  const [point, setPoint] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [preview, setPreview] = useState<FiscalTrial>();
  const pending = useRef(false);
  const requestId = useRef<string | undefined>(undefined);
  const frame = useRef<HTMLIFrameElement>(null);
  useEffect(() => {
    let active = true;
    void fiscalTesting<FiscalTrial[]>(token, organizationId, "trials")
      .then((data) => {
        if (active) setTrials(data);
      })
      .catch(() => {
        if (active)
          setMessage(
            "No se pudo cargar el historial. Usá Actualizar historial antes de emitir.",
          );
      });
    return () => {
      active = false;
    };
  }, [token, organizationId]);
  async function run(fn: () => Promise<void>) {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setMessage("");
    try {
      await fn();
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "No se pudo completar.",
      );
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  async function refresh() {
    setTrials(
      await fiscalTesting<FiscalTrial[]>(token, organizationId, "trials"),
    );
  }
  const unresolved = trials.some(
    (t) => t.status === "PENDING" || t.status === "UNCERTAIN",
  );
  return (
    <section className="mt-5 rounded-xl border-2 border-teal-600 bg-teal-50/40 p-5">
      <h3 className="font-semibold text-teal-900">
        Probar facturación con ARCA
      </h3>
      <p className="mt-2 text-sm">
        Sólo homologación: sin validez fiscal, sin ventas, stock ni caja. Tu
        certificado guardado se usa desde el servidor.
      </p>
      <button
        type="button"
        disabled={busy}
        className="mt-4 rounded-lg bg-teal-700 px-4 py-3 text-sm text-white disabled:opacity-50"
        onClick={() =>
          void run(async () => {
            setConnection(undefined);
            setConfirmed(false);
            const result = await fiscalTesting<FiscalConnection>(
              token,
              organizationId,
              "connect",
              {},
            );
            setConnection(result);
            setPoint(
              result.points.length === 1
                ? String(result.points[0]!.number)
                : "",
            );
            setMessage(result.message);
            onConnected?.();
          })
        }
      >
        {busy ? "Procesando…" : "1. Probar conexión con ARCA"}
      </button>
      {connection && (
        <div className="mt-4 rounded-xl border bg-white p-4">
          {connection.points.length > 0 ? (
            <label className="block text-sm">
              Punto de venta habilitado por ARCA
              <select
                disabled={busy}
                value={point}
                onChange={(e) => {
                  setPoint(e.target.value);
                  setConfirmed(false);
                  requestId.current = undefined;
                }}
                className="mt-1 block w-full rounded-lg border p-3"
              >
                <option value="">Seleccionar punto de venta</option>
                {connection.points.map((p) => (
                  <option key={p.number} value={p.number}>
                    {String(p.number).padStart(5, "0")}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <label className="block text-sm">
              Número de punto para la prueba (no crea un punto real)
              <input
                type="number"
                min={1}
                max={99999}
                placeholder="Por ejemplo: 1"
                value={point}
                disabled={busy}
                onChange={(e) => {
                  setPoint(e.target.value);
                  setConfirmed(false);
                  requestId.current = undefined;
                }}
                className="mt-1 block w-full rounded-lg border p-3"
              />
              <span className="mt-1 block text-xs text-slate-500">
                ARCA homologación no informó puntos. Se verificará este número
                al enviar; producción sigue bloqueada.
              </span>
            </label>
          )}
          <p className="mt-3 text-sm">
            Factura {connection.trialType === 11 ? "C" : "B"} a consumidor
            final: 1 artículo ficticio por {money(connection.totalMinor)}.{" "}
            {connection.trialType === 6
              ? "Incluye IVA 21% sólo para este ejemplo; no configura impuestos de productos."
              : "Sin IVA discriminado."}
          </p>
          <label className="mt-3 flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              disabled={busy}
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
            />
            Confirmo enviar esta operación ficticia a ARCA homologación.
          </label>
          <button
            type="button"
            disabled={busy || !confirmed || !point || unresolved}
            onClick={() =>
              void run(async () => {
                requestId.current ??= crypto.randomUUID();
                const trial = await fiscalTesting<FiscalTrial>(
                  token,
                  organizationId,
                  "trials",
                  {
                    requestId: requestId.current,
                    point: Number(point),
                    confirmHomologation: true,
                  },
                );
                setTrials((values) => [
                  trial,
                  ...values.filter((t) => t.id !== trial.id),
                ]);
                setMessage(trial.detail || "Solicitud registrada.");
                setConfirmed(false);
                if (trial.status === "AUTHORIZED") setPreview(trial);
                if (
                  trial.status === "AUTHORIZED" ||
                  trial.status === "REJECTED"
                )
                  requestId.current = undefined;
              })
            }
            className="mt-4 rounded-lg bg-teal-700 px-4 py-3 text-sm text-white disabled:opacity-50"
          >
            2. Emitir factura de prueba
          </button>
        </div>
      )}
      {unresolved && (
        <p className="mt-3 rounded-lg bg-amber-50 p-3 text-sm">
          Hay una solicitud pendiente. Consultá su resultado abajo; no vuelvas a
          emitirla.
        </p>
      )}
      {message && (
        <p
          role="status"
          className="mt-4 rounded-lg border bg-white p-3 text-sm"
        >
          {message}
        </p>
      )}
      <div className="mt-5 flex items-center justify-between gap-3">
        <h4 className="font-semibold">Pruebas realizadas</h4>
        <button
          type="button"
          disabled={busy}
          onClick={() => void run(refresh)}
          className="text-sm text-teal-700 underline"
        >
          Actualizar historial
        </button>
      </div>
      {trials.map((trial) => (
        <article
          key={trial.id}
          className="mt-3 rounded-lg border bg-white p-3 text-sm"
        >
          <p className="font-semibold">
            Factura {trial.voucherType === 11 ? "C" : "B"} · Punto {trial.point}{" "}
            · {trial.number ?? "Sin número"} · {money(trial.totalMinor)}
          </p>
          <p>
            {
              {
                AUTHORIZED: "Autorizada en homologación",
                QUEUED: "Pendiente de envío",
                REJECTED: "Rechazada",
                PENDING: "En proceso",
                UNCERTAIN: "Resultado pendiente de confirmar",
              }[trial.status]
            }
          </p>
          <p className="mt-1 text-slate-600">{trial.detail}</p>
          {trial.status === "AUTHORIZED" ? (
            <button
              type="button"
              onClick={() => setPreview(trial)}
              className="mt-2 text-teal-700 underline"
            >
              Ver / imprimir prueba
            </button>
          ) : (
            (trial.status === "PENDING" || trial.status === "UNCERTAIN") && (
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    await fiscalTesting(
                      token,
                      organizationId,
                      `trials/${trial.id}/reconcile`,
                      {},
                    );
                    await refresh();
                  })
                }
                className="mt-2 text-teal-700 underline"
              >
                Consultar resultado en ARCA (no reenvía)
              </button>
            )
          )}
        </article>
      ))}
      {preview && (
        <div className="mt-5 rounded-xl border bg-white p-4">
          <div className="mb-3 flex flex-wrap gap-4">
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  if (frame.current) await printTicketFrame(frame.current);
                })
              }
              className="rounded-lg bg-teal-700 px-4 py-2 text-sm text-white"
            >
              Imprimir prueba · 80 mm
            </button>
            <button
              type="button"
              onClick={() => setPreview(undefined)}
              className="text-sm"
            >
              Cerrar vista previa
            </button>
          </div>
          <iframe
            ref={frame}
            title="Factura de homologación sin validez fiscal"
            srcDoc={trialTicket(preview)}
            className="h-[600px] w-full border"
          />
        </div>
      )}
    </section>
  );
}
