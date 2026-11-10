import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { ThermalTicket } from "@gestion/contracts";
import { CloudOff, RefreshCw, X } from "lucide-react";
import { DirectTicketPrint } from "./direct-ticket-print";
import {
  getOfflineIssues,
  resolveOfflineIssue,
  type OfflineIssue,
} from "./lib/api";
import { textoAviso } from "./lib/avisos-sincronizacion";
import {
  tipoDeCompraTexto,
  type OperacionCompra,
} from "./lib/compras-sin-conexion";
import {
  actualizarVentaPendiente,
  useBandejaVentas,
  type VentaPendiente,
} from "./lib/bandeja-ventas";
import { TOKEN_SIN_CONEXION } from "./lib/cache-local";
import { operacionCuentaTexto } from "./lib/cuenta-sin-conexion";
import { operacionTransferenciaTexto } from "./lib/transferencias-sin-conexion";
import { operacionProveedorTexto } from "./lib/proveedores-sin-conexion";
import { operacionCatalogoTexto } from "./lib/catalogo-sin-conexion";
import { operacionInventarioTexto } from "./lib/inventario-sin-conexion";
import { operacionPagarTexto } from "./lib/pagar-sin-conexion";
import { useConectividad } from "./lib/conectividad";

/** Qué operación de caja es (SISTEMA-67). */
const operacionDeCaja = (venta: VentaPendiente) => {
  const op = venta.cuerpo as { tipo?: string; type?: string };
  return op.tipo === "APERTURA"
    ? "apertura"
    : op.tipo === "CIERRE"
      ? "cierre"
      : op.type === "OUT"
        ? "egreso"
        : "ingreso";
};
const pesos = (minor: string) =>
  (Number(minor) / 100).toLocaleString("es-AR", {
    style: "currency",
    currency: "ARS",
  });
const hora = (iso: string) =>
  new Date(iso).toLocaleString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });

/**
 * Ventas cobradas sin conexión y avisos "a revisar" de la sucursal
 * (SISTEMA-64). Se abre desde la campanita.
 */
export function SincronizacionPanel({
  token,
  organizationId,
  branchId,
  alcance,
  onClose,
}: {
  token: string;
  organizationId: string;
  branchId: string;
  alcance: string;
  onClose: () => void;
}) {
  const { enLinea } = useConectividad();
  const enServidor = enLinea && token !== TOKEN_SIN_CONEXION;
  const bandeja = useBandejaVentas(alcance);
  const ventas = bandeja.ventas.filter(
    (venta) =>
      venta.organizationId === organizationId &&
      venta.branchId === branchId &&
      venta.estado !== "ENVIADA",
  );
  const [avisos, setAvisos] = useState<OfflineIssue[]>([]);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState("");
  const [nota, setNota] = useState<{ id: string; texto: string }>();
  const [ocupado, setOcupado] = useState("");
  const [ticket, setTicket] = useState<ThermalTicket>();
  const cargar = useCallback(async () => {
    if (!enServidor) return;
    setCargando(true);
    setError("");
    try {
      setAvisos(await getOfflineIssues(token, organizationId, branchId));
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "No se pudieron cargar.",
      );
    } finally {
      setCargando(false);
    }
  }, [enServidor, token, organizationId, branchId]);
  useEffect(() => {
    void cargar();
  }, [cargar]);
  const revisar = async (issue: OfflineIssue, texto?: string) => {
    if (ocupado) return;
    setOcupado(issue.id);
    setError("");
    try {
      await resolveOfflineIssue(
        token,
        organizationId,
        branchId,
        issue.id,
        texto?.trim() || undefined,
      );
      setNota(undefined);
      setAvisos((actuales) => actuales.filter((item) => item.id !== issue.id));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo marcar.");
    } finally {
      setOcupado("");
    }
  };
  const reintentar = (venta: VentaPendiente) =>
    void actualizarVentaPendiente({
      ...venta,
      estado: "PENDIENTE",
      ultimoError: undefined,
    });
  const cargarTicket = useCallback(
    () =>
      ticket
        ? Promise.resolve(ticket)
        : Promise.reject(new Error("No hay ticket.")),
    [ticket],
  );
  const contenido = (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/40 p-4">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="sincronizacion-titulo"
        className="max-h-[90dvh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white shadow-xl"
      >
        <header className="flex items-start justify-between gap-4 border-b border-slate-100 bg-teal-50/60 p-5">
          <div>
            <h2
              id="sincronizacion-titulo"
              className="flex items-center gap-2 text-lg font-semibold"
            >
              <CloudOff size={20} className="text-teal-700" aria-hidden />
              Ventas sin conexión
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Lo que se cobró sin internet y lo que quedó para revisar.
            </p>
          </div>
          <div className="flex gap-1">
            <button
              type="button"
              aria-label="Actualizar"
              disabled={cargando || !enServidor}
              onClick={() => void cargar()}
              className="rounded-lg p-2 text-teal-700 hover:bg-teal-50 disabled:opacity-40"
            >
              <RefreshCw size={16} className={cargando ? "animate-spin" : ""} />
            </button>
            <button
              type="button"
              aria-label="Cerrar"
              onClick={onClose}
              className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"
            >
              <X size={18} />
            </button>
          </div>
        </header>
        <div className="space-y-6 p-5">
          {error && (
            <p
              role="alert"
              className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700"
            >
              {error}
            </p>
          )}
          <section>
            <h3 className="text-sm font-semibold text-slate-700">
              Guardadas en esta PC
            </h3>
            {!ventas.length ? (
              <p className="mt-2 text-sm text-slate-500">
                No hay ventas sin enviar.
              </p>
            ) : (
              <ul className="mt-2 divide-y divide-slate-100 rounded-xl border">
                {ventas.map((venta) => (
                  <li
                    key={venta.id}
                    className="flex flex-wrap items-center justify-between gap-3 p-3 text-sm"
                  >
                    <div className="min-w-0">
                      <p className="font-medium text-slate-700">
                        {venta.operacion === "CATALOGO"
                          ? `Productos · ${operacionCatalogoTexto(venta)}`
                          : venta.operacion === "INVENTARIO"
                            ? `Inventario · ${operacionInventarioTexto(venta)}`
                            : venta.operacion === "PROVEEDOR"
                              ? `Proveedores · ${operacionProveedorTexto(venta)}`
                              : venta.operacion === "PAGAR"
                                ? `Cuentas por pagar · ${operacionPagarTexto(venta)}${BigInt(venta.totalMinor) > 0n ? ` · ${pesos(venta.totalMinor)}` : ""}`
                                : venta.operacion === "CUENTA" ||
                                    venta.operacion === "CLIENTE"
                                  ? `Cuenta corriente · ${operacionCuentaTexto(venta)}${venta.operacion === "CUENTA" && BigInt(venta.totalMinor) > 0n ? ` · ${pesos(venta.totalMinor)}` : ""}`
                                  : venta.operacion === "TRANSFERENCIA"
                                    ? `Transferencias · ${operacionTransferenciaTexto(venta)}`
                                    : venta.operacion === "COMPRA"
                                      ? `Compras · ${tipoDeCompraTexto((venta.cuerpo as OperacionCompra).tipo)}`
                                      : venta.operacion === "CAJA"
                                        ? `Caja · ${operacionDeCaja(venta)} · ${pesos(venta.totalMinor)}`
                                        : `${venta.id.slice(0, 8).toUpperCase()} · ${pesos(venta.totalMinor)}${venta.documentType === "INVOICE" ? " · con factura" : ""}`}
                      </p>
                      <p className="text-xs text-slate-500">
                        {hora(venta.occurredAt)}
                      </p>
                      {venta.estado === "RECHAZADA" && venta.ultimoError && (
                        <p className="mt-1 text-xs text-rose-700">
                          {venta.ultimoError}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <span
                        className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${venta.estado === "RECHAZADA" ? "bg-rose-50 text-rose-700" : "bg-amber-50 text-amber-800"}`}
                      >
                        {venta.estado === "RECHAZADA"
                          ? "Rechazada"
                          : "Por enviar"}
                      </span>
                      {venta.ticket && (
                        <button
                          type="button"
                          onClick={() => setTicket(venta.ticket)}
                          className="rounded-lg border px-3 py-1.5 text-xs text-teal-700"
                        >
                          Reimprimir ticket
                        </button>
                      )}
                      {venta.estado === "RECHAZADA" && (
                        <button
                          type="button"
                          onClick={() => reintentar(venta)}
                          className="rounded-lg bg-teal-700 px-3 py-1.5 text-xs text-white"
                        >
                          Reintentar
                        </button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
            {ventas.some((venta) => venta.estado === "PENDIENTE") && (
              <p className="mt-2 text-xs text-slate-500">
                Se envían solas cuando vuelve internet. No las repitas.
              </p>
            )}
          </section>
          <section>
            <h3 className="text-sm font-semibold text-slate-700">A revisar</h3>
            {!enServidor ? (
              <p className="mt-2 text-sm text-slate-500">
                Los avisos se ven cuando vuelve la conexión.
              </p>
            ) : !avisos.length ? (
              <p className="mt-2 text-sm text-slate-500">
                {cargando ? "Consultando…" : "No hay nada para revisar."}
              </p>
            ) : (
              <ul className="mt-2 space-y-2">
                {avisos.map((issue) => {
                  const aviso = textoAviso(issue);
                  return (
                    <li
                      key={issue.id}
                      className="rounded-xl border border-amber-100 bg-amber-50/40 p-3 text-sm"
                    >
                      <p className="font-medium text-slate-800">
                        {aviso.titulo}
                      </p>
                      <p className="mt-1 text-xs leading-5 text-slate-600">
                        {aviso.detalle}
                      </p>
                      <p className="mt-1 text-[11px] text-slate-400">
                        Venta {issue.saleId?.slice(0, 8).toUpperCase() ?? "—"}
                        {issue.occurredAt ? ` · ${hora(issue.occurredAt)}` : ""}
                      </p>
                      {nota?.id === issue.id ? (
                        <div className="mt-2 flex flex-wrap gap-2">
                          <input
                            aria-label="Nota de revisión"
                            value={nota.texto}
                            maxLength={300}
                            onChange={(event) =>
                              setNota({
                                id: issue.id,
                                texto: event.target.value,
                              })
                            }
                            placeholder="Qué se hizo (opcional)"
                            className="h-9 min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-3 text-xs"
                          />
                          <button
                            type="button"
                            disabled={ocupado === issue.id}
                            onClick={() => void revisar(issue, nota.texto)}
                            className="rounded-lg bg-teal-700 px-3 py-1.5 text-xs text-white disabled:opacity-50"
                          >
                            Confirmar
                          </button>
                          <button
                            type="button"
                            onClick={() => setNota(undefined)}
                            className="rounded-lg border px-3 py-1.5 text-xs"
                          >
                            Cancelar
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setNota({ id: issue.id, texto: "" })}
                          className="mt-2 rounded-lg border border-teal-200 bg-white px-3 py-1.5 text-xs text-teal-700"
                        >
                          Marcar como revisado
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>
      </section>
      {ticket && (
        <DirectTicketPrint
          key={`reimpresion:${ticket.id}`}
          load={cargarTicket}
          onClose={() => setTicket(undefined)}
        />
      )}
    </div>
  );
  return typeof document === "undefined"
    ? contenido
    : createPortal(contenido, document.body);
}
