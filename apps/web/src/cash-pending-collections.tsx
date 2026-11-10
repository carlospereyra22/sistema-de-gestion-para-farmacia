import { apiFetch as fetch, SinConexionError } from "./lib/api-fetch";
import {
  cajaSinConexion,
  guardarOperacionCaja,
  type OperacionCaja,
} from "./lib/caja-sin-conexion";
import { ventasDeLaPc } from "./lib/bandeja-ventas";
import { conectividad } from "./lib/conectividad";
import { useEffect, useRef, useState } from "react";
import { Check } from "lucide-react";
import {
  apiBaseUrl,
  getCash,
  getCashPendingCollections,
  puedeOperarSinConexion,
  saleInvoice,
  type CashPendingCollection as Collection,
  type CashRegister,
  type CashSession,
} from "./lib/api";
import { assignedCollectionsFirst } from "./lib/cash-session-view";
import type { PendingCollectionAction } from "./lib/cash-pending-confirmation";
import { CashDialog } from "./cash-dialog";
import { CashPendingConfirmation } from "./cash-pending-confirmation";
import { SearchableSaleSelect } from "./searchable-sale-select";

const money = (value: string) =>
  (Number(value) / 100).toLocaleString("es-AR", {
    style: "currency",
    currency: "ARS",
  });

const paths: Record<PendingCollectionAction, string> = {
  destination: "destination",
  incorporate: "assign",
  clear: "destination/clear",
};
const notices: Record<PendingCollectionAction, string> = {
  destination:
    "Caja asignada. El cobro queda pendiente de incorporar a una sesión.",
  incorporate: "Cobro incorporado a la sesión.",
  clear: "Caja quitada. El cobro quedó sin caja asignada.",
};

export function CashPendingCollections({
  token,
  organizationId,
  branchId,
  registers,
  canManage,
  registerId,
  open,
  onClose,
  onAssigned,
}: {
  token: string;
  organizationId: string;
  branchId: string;
  registers: CashRegister[];
  canManage: boolean;
  /** Caja elegida: sus cobros se listan primero. */
  registerId: string;
  open: boolean;
  onClose: () => void;
  onAssigned: () => void;
}) {
  const [rows, setRows] = useState<Collection[]>([]);
  const [sessions, setSessions] = useState<CashSession[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [notice, setNotice] = useState("");
  const [message, setMessage] = useState("");
  const [confirmation, setConfirmation] = useState<{
    action: PendingCollectionAction;
    id: string;
    /** Caja afectada: la elegida, o la ya asignada al incorporar o quitar. */
    registerId: string;
    sessionId?: string;
    destinationRegisterId: string | null;
  }>();
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const url = `${apiBaseUrl}/organizations/${organizationId}/branches/${branchId}/cash/pending-collections`;
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    setLoading(true);
    setMessage("");
    void Promise.all([
      getCashPendingCollections(
        token,
        organizationId,
        branchId,
        controller.signal,
      ),
      getCash(token, organizationId, branchId),
    ])
      .then(([collections, cash]) => {
        if (!controller.signal.aborted) {
          setRows(collections);
          setSessions(cash.sessions.filter((session) => !session.closedAt));
          setLoaded(true);
          setConfirmation((current) => {
            if (!current) return current;
            const row = collections.find((item) => item.id === current.id);
            return row &&
              row.destinationRegisterId === current.destinationRegisterId
              ? current
              : undefined;
          });
        }
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted)
          setMessage(
            cause instanceof Error
              ? cause.message
              : "No se pudieron consultar los cobros.",
          );
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [open, url, token, organizationId, branchId]);

  const confirm = async () => {
    const row = rows.find((item) => item.id === confirmation?.id);
    if (!confirmation || !row || pending.current || !canManage) return;
    const { action, registerId: targetId, sessionId } = confirmation;
    pending.current = true;
    setBusy(true);
    setMessage("");
    try {
      // Sin conexión (o con algo de este cobro todavía en la PC), queda en la
      // PC y se manda solo al volver, en orden (SISTEMA-81).
      const enLaPc = async () => {
        await puedeOperarSinConexion(token, organizationId);
        await guardarOperacionCaja(organizationId, branchId, {
          tipo:
            action === "incorporate"
              ? "COBRO_INCORPORAR"
              : action === "clear"
                ? "COBRO_QUITAR"
                : "COBRO_DESTINO",
          collectionId: row.id,
          ...(action === "incorporate"
            ? {
                sessionId,
                ...(BigInt(row.cashMinor) > 0n
                  ? { amountMinor: Number(row.cashMinor) }
                  : {}),
              }
            : action === "clear"
              ? { expectedRegisterId: targetId }
              : { cashRegisterId: targetId }),
        });
        guardadaEnPc = true;
      };
      let guardadaEnPc = false;
      const bandejaActual = await ventasDeLaPc().catch(() => []);
      const enEspera = bandejaActual.some(
        (item) =>
          item.estado === "PENDIENTE" &&
          item.operacion === "CAJA" &&
          ((item.cuerpo as OperacionCaja).collectionId === row.id ||
            // Una sesión abierta sin conexión todavía no está en el servidor.
            (action === "incorporate" && item.id === sessionId)),
      );
      if (enEspera || cajaSinConexion(token, conectividad().enLinea))
        await enLaPc();
      else {
        let response: Response | undefined;
        try {
          response = await fetch(`${url}/${row.id}/${paths[action]}`, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify(
              action === "incorporate"
                ? { cashSessionId: sessionId }
                : action === "clear"
                  ? { expectedRegisterId: targetId }
                  : { cashRegisterId: targetId },
            ),
          });
        } catch (cause) {
          if (!(cause instanceof SinConexionError)) throw cause;
          await enLaPc();
        }
        if (response && !response.ok) {
          const body = (await response.json()) as {
            message?: string | string[];
          };
          throw new Error(
            typeof body.message === "string"
              ? body.message
              : "No se pudo guardar. Actualizá y reintentá.",
          );
        }
      }
      setRows((current) =>
        action === "incorporate"
          ? current.filter((item) => item.id !== row.id)
          : current.map((item) =>
              item.id === row.id
                ? {
                    ...item,
                    destinationRegisterId: action === "clear" ? null : targetId,
                  }
                : item,
            ),
      );
      const facturaLiberada =
        action === "incorporate" &&
        row.sourceType === "SALE" &&
        row.facturaEnEspera;
      setNotice(
        guardadaEnPc
          ? `${notices[action]} Guardado sin conexión: se envía solo cuando vuelva internet.`
          : facturaLiberada
            ? `${notices.incorporate} La factura de la venta se está enviando a ARCA.`
            : notices[action],
      );
      // La factura que esperaba la caja se pide enseguida, como al vender; si
      // no se puede (permisos, ARCA), la cola fiscal la envía en su vuelta.
      if (facturaLiberada && !guardadaEnPc)
        void saleInvoice(
          token,
          organizationId,
          branchId,
          row.sourceId,
          true,
        ).catch(() => {});
      onAssigned();
    } catch (cause) {
      setMessage(
        cause instanceof Error
          ? cause.message
          : "No se pudo confirmar. Podés reintentar sin duplicar la operación.",
      );
    } finally {
      pending.current = false;
      setBusy(false);
      setConfirmation(undefined);
    }
  };
  const registerName = (id: string | null) =>
    registers.find((register) => register.id === id)?.name ?? "Caja asignada";
  const confirmationRow = rows.find((row) => row.id === confirmation?.id);
  if (!open) return null;
  return (
    <>
      <CashDialog
        title="Cobros pendientes de caja"
        wide
        busy={busy}
        onClose={onClose}
      >
        <div>
          <div>
            <p className="text-sm text-slate-500">
              Podés asignar una caja sin abrirla. El cobro conserva su fecha
              original y no modifica cierres anteriores.
            </p>
            <p className="mt-2 text-xs text-slate-500">
              Asignar el destino no ingresa efectivo a una sesión. Cuando esté
              abierta, podés incorporarlo. Hasta entonces podés quitar la caja.
            </p>
            <p role="status" className="mt-2 min-h-4 text-xs text-teal-700">
              {loading && loaded ? "Actualizando cobros…" : notice}
            </p>
            {message && (
              <p
                role="alert"
                className="mt-3 rounded-lg bg-rose-50 p-3 text-sm text-rose-700"
              >
                {message}
              </p>
            )}
            {loading && !loaded ? (
              <p
                role="status"
                className="py-8 text-center text-sm text-slate-500"
              >
                Consultando cobros…
              </p>
            ) : !rows.length ? (
              <p className="my-6 rounded-xl bg-teal-50 p-5 text-center text-sm text-teal-700">
                No hay cobros pendientes de caja.
              </p>
            ) : (
              <div className="mt-5 max-h-[55dvh] overflow-auto rounded-xl border border-slate-200">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-50 text-xs text-slate-500">
                    <tr>
                      <th className="p-3">Fecha / origen</th>
                      <th className="p-3">Usuario</th>
                      <th className="p-3">Efectivo neto</th>
                      <th className="p-3">Tarjeta</th>
                      <th className="p-3">Transferencia</th>
                      <th className="p-3">Caja de destino</th>
                    </tr>
                  </thead>
                  <tbody>
                    {assignedCollectionsFirst(rows, registerId).map((row) => {
                      const session = sessions.find(
                        (item) =>
                          item.cashRegisterId === row.destinationRegisterId,
                      );
                      const name = registerName(row.destinationRegisterId);
                      return (
                        <tr
                          key={row.id}
                          className="border-t border-slate-100 align-top"
                        >
                          <td className="p-3">
                            <p className="whitespace-nowrap">
                              {/* 24 h: si no, 00:33 se ve como "12:33". */}
                              {new Date(row.collectedAt).toLocaleString(
                                "es-AR",
                                { hourCycle: "h23" },
                              )}
                            </p>
                            <p
                              className="mt-1 text-xs text-slate-500"
                              title={row.sourceId}
                            >
                              {row.sourceType === "SALE" ? "Venta" : "Recibo"} ·{" "}
                              {row.sourceId.slice(0, 8)}
                            </p>
                            {row.facturaEnEspera && (
                              <span className="mt-1 inline-block rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-800">
                                Factura en espera
                              </span>
                            )}
                          </td>
                          <td className="max-w-40 break-words p-3">
                            {row.collectedBy ?? "No registrado"}
                          </td>
                          <td className="whitespace-nowrap p-3">
                            {money(row.cashMinor)}
                          </td>
                          <td className="whitespace-nowrap p-3">
                            {money(row.cardMinor)}
                          </td>
                          <td className="whitespace-nowrap p-3">
                            {money(row.transferMinor)}
                          </td>
                          <td className="w-44 min-w-40 p-2">
                            {row.destinationRegisterId ? (
                              <>
                                <p className="text-sm font-medium text-teal-700">
                                  <span className="mb-1 flex items-center gap-1 text-[11px]">
                                    <Check size={13} aria-hidden />
                                    Caja asignada
                                  </span>
                                  {name}
                                  {!session && (
                                    <span className="mt-1 block text-xs font-normal text-slate-500">
                                      Abrila para incorporar el cobro
                                    </span>
                                  )}
                                </p>
                                {canManage && (
                                  <div className="mt-2 grid gap-1 text-xs">
                                    {session && (
                                      <button
                                        type="button"
                                        disabled={busy || loading}
                                        onClick={() =>
                                          setConfirmation({
                                            action: "incorporate",
                                            id: row.id,
                                            registerId:
                                              row.destinationRegisterId!,
                                            sessionId: session.id,
                                            destinationRegisterId:
                                              row.destinationRegisterId,
                                          })
                                        }
                                        className="min-h-8 rounded-lg bg-teal-700 px-2 py-1 font-semibold text-white hover:bg-teal-800 disabled:opacity-50"
                                      >
                                        Incorporar a {name}
                                      </button>
                                    )}
                                    <button
                                      type="button"
                                      disabled={busy || loading}
                                      onClick={() =>
                                        setConfirmation({
                                          action: "clear",
                                          id: row.id,
                                          registerId:
                                            row.destinationRegisterId!,
                                          destinationRegisterId:
                                            row.destinationRegisterId,
                                        })
                                      }
                                      className="min-h-7 rounded-lg px-2 py-1 text-slate-600 hover:bg-slate-100 disabled:opacity-50"
                                    >
                                      Quitar caja
                                    </button>
                                  </div>
                                )}
                              </>
                            ) : canManage ? (
                              <SearchableSaleSelect
                                label="Caja de destino"
                                placeholder="Asignar caja…"
                                compact
                                tinted
                                floatingOptions
                                disabled={busy || (loading && !loaded)}
                                value={
                                  confirmation?.id === row.id
                                    ? confirmation.registerId
                                    : ""
                                }
                                options={registers
                                  .filter((register) => register.active)
                                  .map((register) => ({
                                    value: register.id,
                                    label: register.name,
                                  }))}
                                onChange={(value) => {
                                  setMessage("");
                                  // Sin esto, al cerrar el popup el foco vuelve
                                  // al buscador y reabre la lista.
                                  if (
                                    document.activeElement instanceof
                                    HTMLElement
                                  )
                                    document.activeElement.blur();
                                  setConfirmation({
                                    action: "destination",
                                    id: row.id,
                                    registerId: value,
                                    destinationRegisterId: null,
                                  });
                                }}
                              />
                            ) : (
                              <span className="text-xs text-slate-500">
                                Sin asignar
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </CashDialog>
      {canManage && confirmation && confirmationRow && (
        <CashPendingConfirmation
          action={confirmation.action}
          registerName={registerName(confirmation.registerId)}
          row={confirmationRow}
          busy={busy}
          onCancel={() => setConfirmation(undefined)}
          onConfirm={() => void confirm()}
        />
      )}
    </>
  );
}
