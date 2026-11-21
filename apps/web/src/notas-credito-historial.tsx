import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  FileMinus2,
  FileText,
  Printer,
  RotateCcw,
  Search,
  UserRound,
  X,
} from "lucide-react";
import { Boton } from "./boton";
import { Pagination } from "./pagination";
import { ProductFilterSelect } from "./product-filter-select";
import { SelectorFecha } from "./selector-fecha";
import { useImpresionNota } from "./nota-credito-impresion";
import {
  enviarNotaCredito,
  listarNotasCredito,
  type FiltroNotasCredito,
  type NotaCreditoListada,
} from "./lib/api";
import {
  CLASES_TONO,
  comprobanteNota,
  estadoFiscal,
  estadoNota,
  mercaderiaNota,
  metodoDevolucion,
  resumenDevolucion,
} from "./lib/nota-credito";

const POR_PAGINA = 10;
const pesos = (minor: string) =>
  (Number(minor) / 100).toLocaleString("es-AR", {
    style: "currency",
    currency: "ARS",
  });
const fechaYHora = (iso: string) =>
  new Date(iso).toLocaleString("es-AR", { hourCycle: "h23" });

/**
 * Ventas → Historial → Notas de crédito (SISTEMA-110): las notas de la
 * sucursal, con los mismos filtros, tabla y paginación que el historial de
 * ventas. Tocando una fila se ve el detalle, se imprime o se reenvía a ARCA.
 */
export function NotasCreditoHistorial({
  token,
  organizationId,
  branchId,
  clientes,
}: {
  token: string;
  organizationId: string;
  branchId: string;
  /** Opciones del filtro de cliente (ver `opcionesClientes`). */
  clientes: { value: string; label: string }[];
}) {
  const [filtro, setFiltro] = useState<FiltroNotasCredito>({});
  const [page, setPage] = useState(1);
  const [datos, setDatos] = useState<{
    items: NotaCreditoListada[];
    total: number;
  }>();
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [abierta, setAbierta] = useState<string>();
  const [recarga, setRecarga] = useState(0);
  const hayFiltros = Object.values(filtro).some(Boolean);
  const cambiar = (cambio: Partial<FiltroNotasCredito>) => {
    setFiltro((actual) => ({ ...actual, ...cambio }));
    setPage(1);
  };

  useEffect(() => {
    let activo = true;
    setCargando(true);
    void listarNotasCredito(token, organizationId, branchId, filtro, page)
      .then((valor) => {
        if (!activo) return;
        setDatos(valor);
        setError("");
      })
      .catch((cause: unknown) => {
        if (activo)
          setError(
            cause instanceof Error
              ? cause.message
              : "No se pudieron cargar las notas de crédito.",
          );
      })
      .finally(() => {
        if (activo) setCargando(false);
      });
    return () => {
      activo = false;
    };
  }, [token, organizationId, branchId, filtro, page, recarga]);

  const notas = datos?.items ?? [];
  const total = datos?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / POR_PAGINA));
  const seleccionada = notas.find((nota) => nota.id === abierta);

  return (
    <>
      <section className="border bg-white p-4">
        <div className="grid items-end gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <SelectorFecha
            label="Desde"
            value={filtro.from ?? ""}
            max={filtro.to || undefined}
            vacio="Cualquier fecha"
            onChange={(valor) => cambiar({ from: valor || undefined })}
          />
          <SelectorFecha
            label="Hasta"
            value={filtro.to ?? ""}
            min={filtro.from || undefined}
            vacio="Cualquier fecha"
            onChange={(valor) => cambiar({ to: valor || undefined })}
          />
          <ProductFilterSelect
            label="Cliente"
            icon={<UserRound size={18} />}
            value={filtro.customerId ?? ""}
            options={clientes}
            onChange={(valor) => cambiar({ customerId: valor || undefined })}
          />
          <ProductFilterSelect
            label="Tipo"
            icon={<FileText size={18} />}
            value={filtro.creditKind ?? ""}
            options={[
              { value: "", label: "Todas" },
              { value: "INTERNA", label: "Nota interna" },
              { value: "FACTURA", label: "Nota de crédito C" },
            ]}
            onChange={(valor) =>
              cambiar({
                creditKind: (valor ||
                  undefined) as FiltroNotasCredito["creditKind"],
              })
            }
          />
          <label className="text-xs font-medium text-slate-600">
            <span className="sr-only">Código de la nota o de la venta</span>
            <span className="flex h-12 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 focus-within:border-teal-500 focus-within:ring-2 focus-within:ring-teal-100">
              <Search size={16} aria-hidden className="text-teal-700" />
              <input
                type="search"
                aria-label="Buscar por código de la nota o de la venta"
                placeholder="Código de nota o venta"
                value={filtro.q ?? ""}
                maxLength={36}
                onChange={(event) =>
                  cambiar({ q: event.target.value.trim() || undefined })
                }
                className="min-w-0 flex-1 bg-transparent font-mono text-sm uppercase text-slate-800 outline-none placeholder:font-sans placeholder:normal-case placeholder:text-slate-400"
              />
            </span>
          </label>
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
          <p role="status">
            {datos
              ? `${total} nota${total === 1 ? "" : "s"} de crédito${hayFiltros ? " con estos filtros" : ""}`
              : " "}
          </p>
          {hayFiltros && (
            <button
              type="button"
              onClick={() => {
                setFiltro({});
                setPage(1);
              }}
              className="rounded-lg px-2 py-1 font-semibold text-teal-700 hover:bg-teal-50"
            >
              Limpiar filtros
            </button>
          )}
        </div>
      </section>

      {error && (
        <p
          role="alert"
          className="rounded-xl border border-rose-100 bg-rose-50 p-3 text-sm text-rose-700"
        >
          {error}
        </p>
      )}

      <section className="overflow-hidden border bg-white">
        <div
          aria-busy={cargando}
          className={`overflow-x-auto transition-opacity ${cargando && datos ? "opacity-60" : ""}`}
        >
          <table className="w-full min-w-210 text-left text-sm">
            <thead className="bg-niebla-958 text-[10px] uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Nota</th>
                <th className="px-4 py-3">Fecha</th>
                <th className="px-4 py-3">Venta</th>
                <th className="px-4 py-3">Cliente</th>
                <th className="px-4 py-3">Mercadería</th>
                <th className="px-4 py-3">Total</th>
                <th className="px-4 py-3">Devolución</th>
                <th className="px-4 py-3">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {notas.map((nota) => {
                const comprobante = comprobanteNota(nota);
                const estado = estadoNota(nota);
                const mercaderia = mercaderiaNota(nota);
                return (
                  <tr
                    key={nota.id}
                    onClick={() => setAbierta(nota.id)}
                    className={`cursor-pointer hover:bg-slate-50 ${abierta === nota.id ? "bg-marca-970" : ""}`}
                  >
                    <td className="px-4 py-3 text-xs">
                      <button
                        type="button"
                        aria-label={`Ver la nota ${comprobante.codigo}`}
                        onClick={(event) => {
                          event.stopPropagation();
                          setAbierta(nota.id);
                        }}
                        className="text-left"
                      >
                        {comprobante.texto === "Nota interna" ? (
                          <span className="font-semibold text-slate-700">
                            Nota interna{" "}
                            <span className="font-mono">
                              {comprobante.codigo}
                            </span>
                          </span>
                        ) : (
                          <>
                            <span className="font-semibold text-slate-700">
                              {comprobante.texto}
                            </span>
                            <span className="mt-0.5 block font-mono text-[10px] text-slate-400">
                              {comprobante.codigo}
                              {comprobante.prueba ? " · prueba" : ""}
                            </span>
                          </>
                        )}
                      </button>
                    </td>
                    <td className="px-4 py-3">{fechaYHora(nota.createdAt)}</td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-600">
                      {nota.sale.id.slice(0, 8).toUpperCase()}
                    </td>
                    <td className="px-4 py-3">
                      {nota.sale.customerName ?? "Público general"}
                    </td>
                    <td className="px-4 py-3">
                      <span className="block">
                        {mercaderia.unidades} unidad
                        {mercaderia.unidades === 1 ? "" : "es"}
                      </span>
                      <span className="text-xs text-slate-500">
                        {mercaderia.texto}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-semibold tabular-nums">
                      {pesos(nota.totalMinor)}
                    </td>
                    <td className="px-4 py-3">{resumenDevolucion(nota)}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ${CLASES_TONO[estado.tono]}`}
                      >
                        {estado.texto}
                      </span>
                    </td>
                  </tr>
                );
              })}
              {!notas.length && !cargando ? (
                <tr>
                  <td
                    colSpan={8}
                    className="px-4 py-12 text-center text-slate-500"
                  >
                    {hayFiltros
                      ? "No hay notas de crédito para estos filtros."
                      : "Todavía no hay notas de crédito. Se hacen desde el detalle de una venta."}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
      <Pagination
        total={total}
        currentPage={Math.min(page, totalPages)}
        totalPages={totalPages}
        noun={total === 1 ? "nota" : "notas"}
        label="Páginas de las notas de crédito"
        onChange={setPage}
      />
      {seleccionada && (
        <DetalleNota
          token={token}
          organizationId={organizationId}
          branchId={branchId}
          nota={seleccionada}
          onClose={() => setAbierta(undefined)}
          onCambio={() => setRecarga((n) => n + 1)}
        />
      )}
    </>
  );
}

function DetalleNota({
  token,
  organizationId,
  branchId,
  nota,
  onClose,
  onCambio,
}: {
  token: string;
  organizationId: string;
  branchId: string;
  nota: NotaCreditoListada;
  onClose: () => void;
  onCambio: () => void;
}) {
  const id = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const pending = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const { imprimir, marco } = useImpresionNota({
    token,
    organizationId,
    branchId,
    onError: setError,
  });
  useEffect(() => {
    const element = dialog.current;
    if (element && !element.open) element.showModal();
    return () => {
      if (element?.open) element.close();
    };
  }, []);
  const correr = async (accion: () => Promise<void>) => {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError("");
    try {
      await accion();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "No se pudo completar.",
      );
    } finally {
      pending.current = false;
      setBusy(false);
    }
  };
  const comprobante = comprobanteNota(nota);
  const mercaderia = mercaderiaNota(nota);
  const fiscal = nota.fiscal ? estadoFiscal(nota.fiscal) : null;
  const imprimible = !nota.fiscal || nota.fiscal.status === "AUTHORIZED";
  const dato = (titulo: string, valor: string, detalle?: string) => (
    <div className="rounded-xl border border-slate-200 bg-white p-3">
      <p className="text-[11px] text-slate-500">{titulo}</p>
      <p className="mt-0.5 text-sm font-semibold text-slate-800">{valor}</p>
      {detalle && <p className="text-xs text-slate-500">{detalle}</p>}
    </div>
  );
  return createPortal(
    <dialog
      ref={dialog}
      aria-labelledby={`${id}-titulo`}
      onCancel={(event) => {
        event.preventDefault();
        if (!pending.current) onClose();
      }}
      className="m-auto max-h-[90dvh] w-[min(680px,calc(100%-2rem))] overflow-hidden rounded-2xl border border-slate-200 bg-white p-0 text-slate-800 shadow-xl backdrop:bg-velo/40 open:flex open:flex-col"
    >
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
        <div className="flex items-center gap-3">
          <span className="grid size-9 place-items-center rounded-lg bg-marca-970 text-marca-535">
            <FileMinus2 size={18} aria-hidden />
          </span>
          <div>
            <h2 id={`${id}-titulo`} className="text-base font-semibold">
              {comprobante.texto === "Nota interna"
                ? `Nota interna ${comprobante.codigo}`
                : comprobante.texto}
            </h2>
            <p className="text-xs text-slate-500">
              {fechaYHora(nota.createdAt)}
              {nota.actorName ? ` · ${nota.actorName}` : ""} · Venta{" "}
              <span className="font-mono">
                {nota.sale.id.slice(0, 8).toUpperCase()}
              </span>
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          disabled={busy}
          aria-label="Cerrar detalle de la nota"
          className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 disabled:opacity-50"
        >
          <X size={18} aria-hidden />
        </button>
      </header>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
        <div className="grid gap-3 sm:grid-cols-3">
          {dato("Total acreditado", pesos(nota.totalMinor))}
          {dato(
            "Devolución",
            BigInt(nota.refundMinor) > 0n
              ? pesos(nota.refundMinor)
              : pesos(nota.accountMinor),
            [
              BigInt(nota.refundMinor) > 0n
                ? metodoDevolucion(nota.refundMethod)
                : "",
              BigInt(nota.accountMinor) > 0n
                ? `Cuenta corriente ${pesos(nota.accountMinor)}`
                : "",
            ]
              .filter(Boolean)
              .join(" · "),
          )}
          {dato(
            "Mercadería",
            mercaderia.texto,
            `${mercaderia.unidades} unidad${mercaderia.unidades === 1 ? "" : "es"}`,
          )}
        </div>

        <div className="overflow-hidden rounded-xl border border-slate-200">
          <div className="grid grid-cols-[minmax(0,1fr)_56px_120px] gap-3 border-b border-slate-100 bg-slate-50 px-4 py-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
            <span>Producto</span>
            <span className="text-center">Cant.</span>
            <span className="text-right">Importe</span>
          </div>
          <ul className="max-h-[36dvh] divide-y divide-slate-100 overflow-y-auto">
            {nota.items.map((item) => (
              <li
                key={item.saleItemId}
                className="grid grid-cols-[minmax(0,1fr)_56px_120px] items-center gap-3 px-4 py-2 text-sm"
              >
                <span className="min-w-0">
                  <span className="block truncate" title={item.name}>
                    {item.name}
                  </span>
                  <span className="text-xs text-slate-500">
                    {item.restocked ? "Volvió al stock" : "Quedó apartada"}
                  </span>
                </span>
                <span className="text-center tabular-nums">
                  {item.quantity}
                </span>
                <span className="text-right font-semibold tabular-nums">
                  {pesos(item.amountMinor)}
                </span>
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded-xl bg-slate-50 p-3 text-sm">
          <p className="text-[11px] text-slate-500">Motivo</p>
          <p className="mt-0.5 text-slate-700">{nota.reason}</p>
        </div>

        {nota.fiscal && fiscal && (
          <div
            className={`flex items-start gap-2 rounded-xl border p-3 text-sm ${fiscal.tono === "bien" ? "border-emerald-100 bg-emerald-50 text-emerald-800" : fiscal.tono === "error" ? "border-rose-100 bg-rose-50 text-rose-800" : "border-amber-100 bg-amber-50 text-amber-900"}`}
          >
            <FileText size={16} aria-hidden className="mt-0.5 shrink-0" />
            <div>
              <p className="font-semibold">
                {fiscal.texto}
                {comprobante.prueba ? " · prueba, sin validez fiscal" : ""}
              </p>
              {nota.fiscal.cae && (
                <p className="text-xs">CAE {nota.fiscal.cae}</p>
              )}
              {nota.fiscal.status !== "AUTHORIZED" && nota.fiscal.detail && (
                <p className="text-xs">{nota.fiscal.detail}</p>
              )}
            </div>
          </div>
        )}
        {error && (
          <p
            role="alert"
            className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700"
          >
            {error}
          </p>
        )}
      </div>

      <footer className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-slate-100 px-5 py-3">
        {nota.fiscal && nota.fiscal.status !== "AUTHORIZED" && (
          <Boton
            variante="suave"
            icono={<RotateCcw size={15} aria-hidden />}
            disabled={busy}
            onClick={() =>
              void correr(async () => {
                await enviarNotaCredito(
                  token,
                  organizationId,
                  branchId,
                  nota.saleId,
                  nota.id,
                  nota.fiscal?.status === "REJECTED",
                );
                onCambio();
              })
            }
          >
            {nota.fiscal.status === "REJECTED"
              ? "Volver a emitir"
              : "Consultar ARCA"}
          </Boton>
        )}
        <Boton
          icono={<X size={15} aria-hidden />}
          tecla="Esc"
          disabled={busy}
          onClick={onClose}
        >
          Cerrar
        </Boton>
        {imprimible && (
          <Boton
            variante="primario"
            icono={<Printer size={15} aria-hidden />}
            disabled={busy}
            onClick={() => void correr(() => imprimir(nota))}
          >
            Imprimir
          </Boton>
        )}
      </footer>
      {marco}
    </dialog>,
    document.body,
  );
}
