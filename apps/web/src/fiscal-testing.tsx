import { useEffect, useRef, useState } from "react";
import { trialTicket } from "./lib/fiscal-trial-ticket";
import {
  fiscalTesting,
  type FiscalConnection,
  type FiscalTrial,
} from "./lib/api";
import { printTicketFrame } from "./lib/browser-ticket-print";
import { ProductFilterSelect } from "./product-filter-select";
import {
  CONECTADO,
  traducirErrorDeArca,
  type ResultadoDeConexion,
} from "./lib/errores-arca";
import { ResultadoConexionArca } from "./resultado-conexion-arca";
import { OperationConfirmDialog } from "./operation-confirm-dialog";
import { StatusToast } from "./status-toast";
import { formatearPunto } from "./lib/puntos-de-venta";
import { formatearCuit } from "./lib/cuit";

/** "0001-00000003". */
const numeroDeFactura = (trial: Pick<FiscalTrial, "point" | "number">) =>
  `${formatearPunto(trial.point)}-${String(trial.number ?? 0).padStart(8, "0")}`;

const money = (minor: number) =>
  new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS" }).format(
    minor / 100,
  );
export function FiscalTesting({
  token,
  organizationId,
  onConnected,
  onTrial,
  modo,
  puntos = [],
  emisor,
}: {
  token: string;
  organizationId: string;
  onConnected?: () => void;
  /** Cambió el estado de una factura de prueba: se vuelve a leer el estado. */
  onTrial?: () => void;
  /**
   * Paso del asistente (SISTEMA-95): "conexion" sólo prueba la conexión;
   * "prueba" hace la factura de prueba y muestra el historial.
   */
  modo?: "conexion" | "prueba";
  /** Puntos de venta activos de la farmacia, para la prueba (SISTEMA-98). */
  puntos?: number[];
  /** Emisor para el resumen antes de enviar. */
  emisor?: { nombre: string; cuit: string };
}) {
  const conPrueba = modo !== "conexion";
  const [connection, setConnection] = useState<FiscalConnection>();
  const [trials, setTrials] = useState<FiscalTrial[]>([]);
  const [point, setPoint] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [preview, setPreview] = useState<FiscalTrial>();
  /** Resultado de probar la conexión, en palabras simples (SISTEMA-97). */
  const [resultado, setResultado] = useState<ResultadoDeConexion>();
  /** Popup de confirmación de la factura de prueba (SISTEMA-98). */
  const [confirmando, setConfirmando] = useState(false);
  const [aviso, setAviso] = useState("");
  const [puntoDePrueba, setPuntoDePrueba] = useState(
    puntos.length === 1 ? String(puntos[0]) : "",
  );
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
  /** Envía la factura de prueba (mismo requestId si se reintenta). */
  async function emitirPrueba(numeroDePunto: number) {
    requestId.current ??= crypto.randomUUID();
    const trial = await fiscalTesting<FiscalTrial>(
      token,
      organizationId,
      "trials",
      {
        requestId: requestId.current,
        point: numeroDePunto,
        confirmHomologation: true,
      },
    );
    setTrials((values) => [trial, ...values.filter((t) => t.id !== trial.id)]);
    if (trial.status === "AUTHORIZED" || trial.status === "REJECTED")
      requestId.current = undefined;
    onTrial?.();
    return trial;
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
        {modo === "conexion"
          ? "Probar la conexión con ARCA"
          : modo === "prueba"
            ? "Factura de prueba"
            : "Probar facturación con ARCA"}
      </h3>
      <p className="mt-2 text-sm">
        {modo === "conexion"
          ? "Comprobamos que ARCA reconozca tu certificado. No se emite nada."
          : "Una factura de $100 a consumidor final en modo prueba: no tiene validez fiscal y no toca ventas, stock ni caja."}
      </p>
      {aviso && (
        <StatusToast key={aviso} message={aviso} onClose={() => setAviso("")} />
      )}
      {modo === "prueba" && (
        <div className="mt-4">
          {puntos.length === 0 ? (
            <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
              Primero asigná un punto de venta a una sucursal (paso Punto de
              venta).
            </p>
          ) : (
            <div className="flex flex-wrap items-end gap-3">
              {puntos.length > 1 && (
                <div className="min-w-48 text-sm">
                  <p className="mb-1">Punto de venta</p>
                  <ProductFilterSelect
                    compact
                    label="Punto de venta"
                    icon={null}
                    disabled={busy}
                    value={puntoDePrueba}
                    options={[
                      { value: "", label: "Elegí un punto" },
                      ...puntos.map((numero) => ({
                        value: String(numero),
                        label: formatearPunto(numero),
                      })),
                    ]}
                    onChange={(value) => {
                      setPuntoDePrueba(value);
                      requestId.current = undefined;
                    }}
                  />
                </div>
              )}
              <button
                type="button"
                disabled={busy || unresolved || !puntoDePrueba}
                onClick={() => setConfirmando(true)}
                className="h-11 rounded-lg bg-teal-700 px-5 text-sm font-medium text-white disabled:opacity-50"
              >
                Hacer factura de prueba de $100
              </button>
            </div>
          )}
          {confirmando && (
            <OperationConfirmDialog
              title="Hacer factura de prueba"
              description={`Emisor: ${emisor?.nombre || "la farmacia"}${emisor?.cuit ? ` (CUIT ${formatearCuit(emisor.cuit)})` : ""}. Punto de venta ${formatearPunto(Number(puntoDePrueba))}. Factura C de $100 a consumidor final, en modo prueba: no tiene validez fiscal y no toca ventas, stock ni caja.`}
              onConfirm={async () => {
                const trial = await emitirPrueba(Number(puntoDePrueba));
                if (trial.status === "AUTHORIZED") {
                  setAviso(
                    `ARCA autorizó la factura de prueba ${numeroDeFactura(trial)}.`,
                  );
                  setMessage("");
                } else if (trial.status === "REJECTED")
                  setMessage(
                    `ARCA rechazó la factura de prueba. ${trial.detail ?? ""}`.trim(),
                  );
                else
                  setMessage(
                    "ARCA todavía no respondió. Tocá «Consultar resultado» en la factura (no se vuelve a enviar).",
                  );
              }}
              onClose={() => setConfirmando(false)}
            />
          )}
          {trials[0]?.status === "AUTHORIZED" && (
            <div className="mt-4 rounded-xl border border-teal-200 bg-teal-50 p-4 text-sm text-teal-900">
              <p className="font-semibold">
                Factura de prueba {numeroDeFactura(trials[0])} autorizada
              </p>
              <p className="mt-1">
                Código de autorización (CAE): {trials[0].cae ?? "—"}
              </p>
              <button
                type="button"
                onClick={() => setPreview(trials[0])}
                className="mt-3 rounded-lg bg-teal-700 px-4 py-2 text-sm text-white"
              >
                Imprimir
              </button>
            </div>
          )}
        </div>
      )}
      {modo !== "prueba" && (
        <button
          type="button"
          disabled={busy}
          className="mt-4 rounded-lg bg-teal-700 px-4 py-3 text-sm text-white disabled:opacity-50"
          onClick={() =>
            void run(async () => {
              setConnection(undefined);
              setConfirmed(false);
              setResultado(undefined);
              let result: FiscalConnection;
              try {
                result = await fiscalTesting<FiscalConnection>(
                  token,
                  organizationId,
                  "connect",
                  {},
                );
              } catch (cause) {
                setResultado(traducirErrorDeArca(cause));
                return;
              }
              setConnection(result);
              setPoint(
                result.points.length === 1
                  ? String(result.points[0]!.number)
                  : "",
              );
              if (modo === "conexion") setResultado(CONECTADO);
              else setMessage(result.message);
              onConnected?.();
            })
          }
        >
          {busy
            ? "Procesando…"
            : modo === "conexion"
              ? "Probar conexión con ARCA"
              : "1. Probar conexión con ARCA"}
        </button>
      )}
      {resultado && <ResultadoConexionArca resultado={resultado} />}
      {modo !== "prueba" && conPrueba && connection && (
        <div className="mt-4 rounded-xl border bg-white p-4">
          {connection.points.length > 0 ? (
            <div className="text-sm">
              <p className="mb-1">Punto de venta habilitado por ARCA</p>
              <ProductFilterSelect
                compact
                label="Punto de venta habilitado por ARCA"
                icon={null}
                disabled={busy}
                value={point}
                options={[
                  { value: "", label: "Seleccionar punto de venta" },
                  ...connection.points.map((p) => ({
                    value: String(p.number),
                    label: String(p.number).padStart(5, "0"),
                  })),
                ]}
                onChange={(value) => {
                  setPoint(value);
                  setConfirmed(false);
                  requestId.current = undefined;
                }}
              />
            </div>
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
            Confirmo enviar esta factura de prueba a ARCA (sin validez fiscal).
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
                onTrial?.();
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
      {conPrueba && unresolved && (
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
      {conPrueba && (
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
      )}
      {conPrueba &&
        trials.map((trial) => (
          <article
            key={trial.id}
            className="mt-3 rounded-lg border bg-white p-3 text-sm"
          >
            <p className="font-semibold">
              Factura {trial.voucherType === 11 ? "C" : "B"} · Punto{" "}
              {trial.point} · {trial.number ?? "Sin número"} ·{" "}
              {money(trial.totalMinor)}
            </p>
            <p>
              {
                {
                  AUTHORIZED: "Autorizada en homologación",
                  HELD: "En espera de caja",
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
                      onTrial?.();
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
