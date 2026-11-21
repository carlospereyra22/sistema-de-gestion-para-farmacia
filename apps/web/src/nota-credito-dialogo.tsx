import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Banknote,
  Check,
  CircleCheck,
  FileMinus2,
  Minus,
  Plus,
  Printer,
  Store,
  X,
} from "lucide-react";
import { Boton } from "./boton";
import { ProductFilterSelect } from "./product-filter-select";
import { useImpresionNota } from "./nota-credito-impresion";
import {
  crearNotaCredito,
  getCash,
  notasCreditoVenta,
  type NotaCredito,
  type NotasCreditoVenta,
  type Sale,
} from "./lib/api";
import {
  cashSessionLabel,
  preferredCashSessionId,
} from "./lib/active-cash-register";
import {
  METODOS_DEVOLUCION,
  comprobanteNota,
  estadoFiscal,
  importeRenglon,
  mercaderiaNota,
  metodoDevolucion,
  renglonesPedido,
  tituloTipo,
  todaLaVenta,
  totalSeleccion,
  type Seleccion,
} from "./lib/nota-credito";

const pesos = (minor: string | bigint) =>
  (Number(minor) / 100).toLocaleString("es-AR", {
    style: "currency",
    currency: "ARS",
  });

type Metodo = "CASH" | "CARD" | "TRANSFER" | "SALDO_A_FAVOR";

/**
 * Botón "Nota de crédito" del detalle de una venta (SISTEMA-110): por la venta
 * entera o por productos. Sirve para comprobante interno (nota interna) y para
 * facturas (nota C, real o de prueba). Las notas hechas se ven en Historial →
 * Notas de crédito.
 */
export function NotaCreditoBoton({
  token,
  organizationId,
  branchId,
  sale,
  onDone,
}: {
  token: string;
  organizationId: string;
  branchId: string;
  sale: Sale;
  onDone: () => void;
}) {
  const [abierto, setAbierto] = useState(false);
  if (sale.status !== "COMPLETED") return null;
  return (
    <>
      <Boton
        variante="suave"
        icono={<FileMinus2 size={15} aria-hidden />}
        onClick={() => setAbierto(true)}
        className="w-full justify-center"
      >
        Nota de crédito
      </Boton>
      {abierto && (
        <NotaCreditoDialogo
          token={token}
          organizationId={organizationId}
          branchId={branchId}
          sale={sale}
          onClose={() => setAbierto(false)}
          onDone={onDone}
        />
      )}
    </>
  );
}

function NotaCreditoDialogo({
  token,
  organizationId,
  branchId,
  sale,
  onClose,
  onDone,
}: {
  token: string;
  organizationId: string;
  branchId: string;
  sale: Sale;
  onClose: () => void;
  onDone: () => void;
}) {
  const id = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const pending = useRef(false);
  // Un pedido por intento: si la respuesta se pierde, reintentar no repite
  // la devolución.
  const requestId = useRef(crypto.randomUUID());
  const [datos, setDatos] = useState<NotasCreditoVenta>();
  const [hecha, setHecha] = useState<NotaCredito>();
  const [seleccion, setSeleccion] = useState<Seleccion>({});
  const [alStock, setAlStock] = useState(true);
  const [motivo, setMotivo] = useState("");
  const [metodo, setMetodo] = useState<Metodo>("CASH");
  const [cajas, setCajas] = useState<{ value: string; label: string }[]>([]);
  const [caja, setCaja] = useState("");
  const [confirmado, setConfirmado] = useState(false);
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
  useEffect(() => {
    let activo = true;
    void notasCreditoVenta(token, organizationId, branchId, sale.id)
      .then((valor) => {
        if (!activo) return;
        setDatos(valor);
        setMetodo(valor.metodoSugerido);
      })
      .catch((cause: unknown) => {
        if (activo)
          setError(
            cause instanceof Error
              ? cause.message
              : "No se pudo cargar la venta.",
          );
      });
    void getCash(token, organizationId, branchId)
      .then((cash) => {
        if (!activo) return;
        const abiertas = cash.sessions.filter((s) => !s.closedAt);
        setCajas(
          abiertas.map((s) => ({
            value: s.id,
            label: cashSessionLabel(s, cash.registers),
          })),
        );
        setCaja(preferredCashSessionId(abiertas, organizationId, branchId));
      })
      .catch(() => {
        if (activo) setCajas([]);
      });
    return () => {
      activo = false;
    };
  }, [token, organizationId, branchId, sale.id]);

  const items = datos?.items ?? [];
  const total = totalSeleccion(items, seleccion);
  const pedido = renglonesPedido(items, seleccion, alStock);
  const disponibles = items.filter((item) => item.available > 0);
  const todos =
    disponibles.length > 0 &&
    disponibles.every((item) => seleccion[item.id] === item.available);
  const algunoRepone = pedido.some((linea) =>
    items.some((item) => item.id === linea.saleItemId && item.puedeReponer),
  );
  const cerrar = () => {
    if (!pending.current) onClose();
  };
  const cantidad = (itemId: string, valor: number) =>
    setSeleccion((actual) => ({ ...actual, [itemId]: valor }));

  const correr = async (accion: () => Promise<void>) => {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError("");
    try {
      await accion();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "No se pudo completar. Revisá Notas de crédito antes de repetir.",
      );
    } finally {
      pending.current = false;
      setBusy(false);
    }
  };

  const hacer = () =>
    correr(async () => {
      if (!pedido.length) throw new Error("Elegí al menos un producto.");
      if (motivo.trim().length < 3)
        throw new Error("Indicá un motivo de al menos 3 caracteres.");
      if (datos?.tipo === "FACTURA" && !confirmado)
        throw new Error("Confirmá que se emite una nota de crédito real.");
      const resultado = await crearNotaCredito(
        token,
        organizationId,
        branchId,
        sale.id,
        {
          requestId: requestId.current,
          reason: motivo.trim(),
          items: pedido,
          refundMethod: metodo,
          cashSessionId: metodo === "CASH" ? caja || undefined : undefined,
          confirmProduction: datos?.tipo === "FACTURA" ? true : undefined,
        },
      );
      requestId.current = crypto.randomUUID();
      setHecha(resultado.notas.find((n) => n.id === resultado.notaId));
      onDone();
    });

  return createPortal(
    <dialog
      ref={dialog}
      aria-labelledby={`${id}-titulo`}
      // El selector calcula contra este cuadro si abre para arriba o abajo.
      data-product-editor-body=""
      onCancel={(event) => {
        event.preventDefault();
        cerrar();
      }}
      // Sin scroll propio: sólo scrollea la lista, así los desplegables de
      // abajo no quedan cortados.
      className="m-auto max-h-[92dvh] w-[min(680px,calc(100%-2rem))] overflow-visible rounded-2xl border border-slate-200 bg-white p-0 text-slate-800 shadow-xl backdrop:bg-velo/40 open:flex open:flex-col"
    >
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
        <div className="flex items-center gap-3">
          <span className="grid size-9 place-items-center rounded-lg bg-marca-970 text-marca-535">
            <FileMinus2 size={18} aria-hidden />
          </span>
          <div>
            <h2 id={`${id}-titulo`} className="text-base font-semibold">
              {datos ? tituloTipo(datos.tipo) : "Nota de crédito"}
            </h2>
            <p className="text-xs text-slate-500">
              Venta{" "}
              <span className="font-mono">
                {sale.id.slice(0, 8).toUpperCase()}
              </span>{" "}
              · {pesos(sale.totalMinor)}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={cerrar}
          disabled={busy}
          aria-label="Cerrar nota de crédito"
          className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 disabled:opacity-50"
        >
          <X size={18} aria-hidden />
        </button>
      </header>

      {!datos && !error && (
        <p
          role="status"
          className="px-5 py-8 text-center text-sm text-slate-500"
        >
          Cargando la venta…
        </p>
      )}

      {hecha ? (
        <Hecha
          nota={hecha}
          busy={busy}
          error={error}
          onImprimir={() => void correr(() => imprimir(hecha))}
          onListo={cerrar}
        />
      ) : datos && (!datos.tipo || !disponibles.length) ? (
        <div className="space-y-4 px-5 py-6">
          <p className="rounded-xl border border-amber-100 bg-amber-50 p-4 text-sm text-amber-900">
            {datos.motivo ??
              "Ya se devolvió todo lo de esta venta. Las notas están en Historial → Notas de crédito."}
          </p>
          <div className="flex justify-end">
            <Boton
              icono={<X size={15} aria-hidden />}
              tecla="Esc"
              onClick={cerrar}
            >
              Cerrar
            </Boton>
          </div>
        </div>
      ) : datos ? (
        <form
          className="flex min-h-0 flex-1 flex-col"
          onSubmit={(event) => {
            event.preventDefault();
            void hacer();
          }}
        >
          <div className="flex min-h-0 flex-1 flex-col px-5 pt-4">
            <div className="flex items-center justify-between gap-3 pb-2">
              <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-slate-700">
                <input
                  type="checkbox"
                  checked={todos}
                  disabled={busy}
                  onChange={() => setSeleccion(todos ? {} : todaLaVenta(items))}
                  className="size-4 accent-teal-700"
                />
                Toda la venta
              </label>
              <span className="text-xs text-slate-500">
                {pedido.length
                  ? `${pedido.length} de ${disponibles.length} productos`
                  : "Tildá lo que devuelve"}
              </span>
            </div>
            <ul className="min-h-0 flex-1 divide-y divide-slate-100 overflow-y-auto overscroll-contain rounded-xl border border-slate-200 [max-height:min(42dvh,380px)]">
              {items.map((item) => {
                const elegida = Math.min(
                  seleccion[item.id] ?? 0,
                  item.available,
                );
                const marcado = elegida > 0;
                const agotado = item.available === 0;
                return (
                  <li
                    key={item.id}
                    className={`flex items-center gap-3 px-3 py-2.5 text-sm transition-colors ${marcado ? "bg-marca-970/60" : ""} ${agotado ? "opacity-50" : ""}`}
                  >
                    <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-3">
                      <input
                        type="checkbox"
                        checked={marcado}
                        disabled={busy || agotado}
                        onChange={() =>
                          cantidad(item.id, marcado ? 0 : item.available)
                        }
                        aria-label={`Devuelve ${item.name}`}
                        className="size-4 shrink-0 accent-teal-700"
                      />
                      <span className="min-w-0">
                        <span className="block truncate" title={item.name}>
                          {item.name}
                        </span>
                        <span className="text-xs text-slate-500">
                          {agotado
                            ? "Ya devuelto"
                            : item.available === item.quantity
                              ? `${item.quantity} vendido${item.quantity === 1 ? "" : "s"}`
                              : `Quedan ${item.available} de ${item.quantity}`}
                        </span>
                      </span>
                    </label>
                    {marcado && item.available > 1 && (
                      <div className="flex h-8 shrink-0 items-center rounded-lg border border-slate-200 bg-white">
                        <button
                          type="button"
                          disabled={busy || elegida <= 1}
                          onClick={() => cantidad(item.id, elegida - 1)}
                          aria-label={`Una menos de ${item.name}`}
                          className="grid h-full w-7 place-items-center text-slate-500 hover:text-teal-700 disabled:opacity-30"
                        >
                          <Minus size={14} aria-hidden />
                        </button>
                        <span className="w-7 text-center text-sm font-semibold tabular-nums">
                          {elegida}
                        </span>
                        <button
                          type="button"
                          disabled={busy || elegida >= item.available}
                          onClick={() => cantidad(item.id, elegida + 1)}
                          aria-label={`Una más de ${item.name}`}
                          className="grid h-full w-7 place-items-center text-slate-500 hover:text-teal-700 disabled:opacity-30"
                        >
                          <Plus size={14} aria-hidden />
                        </button>
                      </div>
                    )}
                    <span
                      className={`w-24 shrink-0 text-right tabular-nums ${marcado ? "font-semibold text-slate-800" : "text-slate-400"}`}
                    >
                      {pesos(
                        importeRenglon(
                          item,
                          marcado ? elegida : item.available,
                        ),
                      )}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>

          <div className="shrink-0 space-y-3 px-5 pb-4 pt-4">
            <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
              <input
                value={motivo}
                onChange={(event) => setMotivo(event.target.value)}
                maxLength={300}
                disabled={busy}
                aria-label="Motivo"
                placeholder="Motivo de la devolución"
                className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-50"
              />
              {algunoRepone && (
                <div
                  role="radiogroup"
                  aria-label="Qué pasa con la mercadería"
                  className="flex h-10 rounded-lg border border-slate-200 bg-slate-50 p-0.5 text-sm"
                >
                  {(
                    [
                      [true, "Vuelve al stock"],
                      [false, "Queda apartada"],
                    ] as const
                  ).map(([valor, texto]) => (
                    <button
                      key={texto}
                      type="button"
                      role="radio"
                      aria-checked={alStock === valor}
                      disabled={busy}
                      onClick={() => setAlStock(valor)}
                      className={`whitespace-nowrap rounded-md px-3 ${alStock === valor ? "bg-white font-semibold text-teal-800 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
                    >
                      {texto}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <ProductFilterSelect
                compact
                label="Devolvés en"
                value={metodo}
                disabled={busy}
                icon={<Banknote size={16} aria-hidden />}
                options={[
                  ...METODOS_DEVOLUCION,
                  // Sólo con un cliente registrado en la venta.
                  ...(datos.tieneCliente
                    ? [{ value: "SALDO_A_FAVOR", label: "Saldo a favor" }]
                    : []),
                ]}
                onChange={(valor) => setMetodo(valor as Metodo)}
              />
              {metodo === "CASH" && (
                <ProductFilterSelect
                  compact
                  label="Sale de la caja"
                  value={caja}
                  disabled={busy || !cajas.length}
                  icon={<Store size={16} aria-hidden />}
                  options={
                    cajas.length
                      ? cajas
                      : [{ value: "", label: "No hay cajas abiertas" }]
                  }
                  onChange={setCaja}
                />
              )}
            </div>
            {metodo === "SALDO_A_FAVOR" ? (
              <p className="text-xs leading-relaxed text-slate-600">
                Va a la cuenta corriente del cliente: baja lo que debe y, si no
                debe nada, queda a favor y se descuenta solo de su próxima
                compra a cuenta corriente.
              </p>
            ) : datos.cuentaCorriente ? (
              <p className="text-xs leading-relaxed text-slate-600">
                Fue a cuenta corriente: primero baja lo que el cliente todavía
                debe de estos productos; sólo el resto se devuelve.
              </p>
            ) : null}
            {datos.tipo === "FACTURA_PRUEBA" && (
              <p className="text-xs font-medium text-amber-700">
                Homologación · Sin validez fiscal. La plata y el stock se
                registran igual.
              </p>
            )}
            {datos.tipo === "FACTURA" && (
              <label className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                <input
                  type="checkbox"
                  checked={confirmado}
                  disabled={busy}
                  onChange={(event) => setConfirmado(event.target.checked)}
                  className="mt-0.5 size-4 accent-teal-700"
                />
                Se emite una nota de crédito C real en ARCA que anula esa parte
                de la factura.
              </label>
            )}
            {error && (
              <p
                role="alert"
                className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700"
              >
                {error}
              </p>
            )}
            <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-3">
              <p className="text-sm text-slate-600">
                Total a acreditar{" "}
                <strong className="ml-1 text-lg tabular-nums text-teal-800">
                  {pesos(total)}
                </strong>
              </p>
              <div className="flex gap-2">
                <Boton
                  icono={<X size={15} aria-hidden />}
                  tecla="Esc"
                  onClick={cerrar}
                  disabled={busy}
                >
                  Cancelar
                </Boton>
                <Boton
                  type="submit"
                  variante="primario"
                  icono={<Check size={15} aria-hidden />}
                  disabled={busy || !pedido.length}
                >
                  {busy ? "Haciendo…" : "Hacer nota de crédito"}
                </Boton>
              </div>
            </footer>
          </div>
        </form>
      ) : null}
      {!datos && error && (
        <p
          role="alert"
          className="m-5 rounded-lg bg-rose-50 p-3 text-sm text-rose-700"
        >
          {error}
        </p>
      )}
      {marco}
    </dialog>,
    document.body,
  );
}

/** Resumen al terminar: qué devolver y cómo quedó la nota. */
function Hecha({
  nota,
  busy,
  error,
  onImprimir,
  onListo,
}: {
  nota: NotaCredito;
  busy: boolean;
  error: string;
  onImprimir: () => void;
  onListo: () => void;
}) {
  const comprobante = comprobanteNota(nota);
  const mercaderia = mercaderiaNota(nota);
  const fiscal = nota.fiscal ? estadoFiscal(nota.fiscal) : null;
  const imprimible = !nota.fiscal || nota.fiscal.status === "AUTHORIZED";
  const fila = (titulo: string, valor: string) => (
    <div className="flex items-baseline justify-between gap-3 py-2">
      <dt className="text-slate-500">{titulo}</dt>
      <dd className="text-right font-medium text-slate-800">{valor}</dd>
    </div>
  );
  return (
    <div className="px-5 py-6">
      <div className="flex flex-col items-center text-center">
        <span className="grid size-12 place-items-center rounded-full bg-emerald-50 text-emerald-600">
          <CircleCheck size={26} aria-hidden />
        </span>
        <p className="mt-3 text-base font-semibold">Nota de crédito hecha</p>
        <p className="text-sm text-slate-500">
          {comprobante.texto === "Nota interna"
            ? `Nota interna ${comprobante.codigo}`
            : comprobante.texto}
        </p>
      </div>
      {BigInt(nota.refundMinor) === 0n && BigInt(nota.accountMinor) > 0n && (
        <div className="mt-5 rounded-xl border border-teal-100 bg-marca-970 p-4 text-center">
          <p className="text-xs text-marca-535">
            Quedó en la cuenta corriente del cliente
          </p>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-teal-800">
            {pesos(nota.accountMinor)}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Baja lo que debe; lo que sobre se descuenta de su próxima compra a
            cuenta corriente.
          </p>
        </div>
      )}
      {BigInt(nota.refundMinor) > 0n && (
        <div className="mt-5 rounded-xl border border-teal-100 bg-marca-970 p-4 text-center">
          <p className="text-xs text-marca-535">
            Devolvé al cliente (
            {metodoDevolucion(nota.refundMethod).toLowerCase()})
          </p>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-teal-800">
            {pesos(nota.refundMinor)}
          </p>
        </div>
      )}
      <dl className="mt-4 divide-y divide-slate-100 rounded-xl border border-slate-200 px-4 text-sm">
        {fila("Total acreditado", pesos(nota.totalMinor))}
        {BigInt(nota.accountMinor) > 0n &&
          fila("A cuenta corriente", pesos(nota.accountMinor))}
        {fila(
          "Mercadería",
          `${mercaderia.unidades} unidad${mercaderia.unidades === 1 ? "" : "es"} · ${mercaderia.texto.toLowerCase()}`,
        )}
        {fiscal &&
          fila(
            "ARCA",
            `${fiscal.texto}${comprobante.prueba ? " · prueba" : ""}`,
          )}
      </dl>
      {nota.fiscal && nota.fiscal.status !== "AUTHORIZED" && (
        <p className="mt-3 text-xs leading-relaxed text-slate-500">
          La devolución ya quedó registrada. La nota se sigue enviando sola;
          podés ver cómo va en Historial → Notas de crédito.
        </p>
      )}
      {error && (
        <p
          role="alert"
          className="mt-3 rounded-lg bg-rose-50 p-3 text-sm text-rose-700"
        >
          {error}
        </p>
      )}
      <div className="mt-5 flex justify-end gap-2">
        {imprimible && (
          <Boton
            icono={<Printer size={15} aria-hidden />}
            disabled={busy}
            onClick={onImprimir}
          >
            Imprimir
          </Boton>
        )}
        <Boton
          variante="primario"
          icono={<Check size={15} aria-hidden />}
          tecla="Esc"
          disabled={busy}
          onClick={onListo}
        >
          Listo
        </Boton>
      </div>
    </div>
  );
}
