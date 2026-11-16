import { useCallback, useEffect, useState } from "react";
import { MapPin, RefreshCw, Store, Truck } from "lucide-react";

import {
  decidirPedido,
  getPedidosCatalogo,
  type DecisionPedido,
  type EstadoPedido,
  type PedidoDeLaFarmacia,
} from "./lib/catalogo-online-api";
import {
  CLASES_TONO,
  ESTADOS_PEDIDO,
  numeroDePedido,
  pesos,
} from "./lib/catalogo-online";

const FILTROS: { id: EstadoPedido | ""; label: string }[] = [
  { id: "", label: "Todos" },
  { id: "RECEIVED", label: "Por confirmar" },
  { id: "CONFIRMED", label: "Confirmados" },
  { id: "DELIVERED", label: "Entregados" },
  { id: "REJECTED", label: "Rechazados" },
  { id: "CANCELLED", label: "Cancelados" },
];

const fecha = (iso: string) =>
  new Intl.DateTimeFormat("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(iso));

export function EstadoPedidoEtiqueta({
  estado,
  para,
}: {
  estado: EstadoPedido;
  para: "farmacia" | "cliente";
}) {
  const datos = ESTADOS_PEDIDO[estado];
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${CLASES_TONO[datos.tono]}`}
    >
      {datos[para]}
    </span>
  );
}

/** Pedidos que llegan del catálogo online (SISTEMA-107). */
export function CatalogoPedidos({
  token,
  organizationId,
  canManage,
  onError,
}: {
  token: string;
  organizationId: string;
  canManage: boolean;
  onError: (message: string) => void;
}) {
  const [filtro, setFiltro] = useState<EstadoPedido | "">("");
  const [pedidos, setPedidos] = useState<PedidoDeLaFarmacia[]>([]);
  const [recibidos, setRecibidos] = useState(0);
  const [elegido, setElegido] = useState<string>();
  const [cargando, setCargando] = useState(true);
  const [descuentaStock, setDescuentaStock] = useState(false);

  // En segundo plano no muestra "cargando": sólo trae lo nuevo.
  const cargar = useCallback(
    async (silencioso = false) => {
      if (!silencioso) setCargando(true);
      try {
        const datos = await getPedidosCatalogo(
          token,
          organizationId,
          filtro || undefined,
        );
        setPedidos(datos.items);
        setRecibidos(datos.recibidos);
        setDescuentaStock(datos.descuentaStock);
      } catch (cause) {
        if (!silencioso)
          onError(cause instanceof Error ? cause.message : String(cause));
      } finally {
        setCargando(false);
      }
    },
    [token, organizationId, filtro, onError],
  );

  useEffect(() => {
    void cargar();
  }, [cargar]);

  // Los pedidos nuevos aparecen solos, sin recargar la pantalla.
  useEffect(() => {
    const intervalo = window.setInterval(() => {
      if (document.visibilityState === "visible") void cargar(true);
    }, 20_000);
    return () => window.clearInterval(intervalo);
  }, [cargar]);

  const pedido = pedidos.find(({ id }) => id === elegido);

  const actualizar = (nuevo: PedidoDeLaFarmacia) => {
    setPedidos((lista) =>
      lista.map((item) => (item.id === nuevo.id ? nuevo : item)),
    );
    const anterior = pedidos.find((item) => item.id === nuevo.id);
    if (anterior?.status === "RECEIVED" && nuevo.status !== "RECEIVED")
      setRecibidos((cantidad) => Math.max(0, cantidad - 1));
  };

  return (
    <div className="grid min-h-0 flex-1 gap-4 xl:grid-cols-[minmax(0,1fr)_420px]">
      <section className="flex min-h-0 flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {FILTROS.map(({ id, label }) => (
            <button
              key={id || "todos"}
              type="button"
              aria-pressed={filtro === id}
              onClick={() => setFiltro(id)}
              className={`rounded-full border px-3 py-1.5 text-sm transition-colors ${
                filtro === id
                  ? "border-teal-600 bg-teal-600 text-white"
                  : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
              }`}
            >
              {label}
              {id === "RECEIVED" && recibidos > 0 ? (
                <span className="ml-1.5 rounded-full bg-amber-400 px-1.5 text-xs font-semibold text-slate-900">
                  {recibidos}
                </span>
              ) : null}
            </button>
          ))}
          <button
            type="button"
            onClick={() => void cargar()}
            aria-label="Actualizar pedidos"
            className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
          >
            <RefreshCw size={15} aria-hidden /> Actualizar
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-slate-50 text-left text-xs text-slate-500">
              <tr>
                <th className="px-4 py-2.5 font-medium">#</th>
                <th className="px-4 py-2.5 font-medium">Cliente</th>
                <th className="px-4 py-2.5 text-right font-medium">Total</th>
                <th className="px-4 py-2.5 font-medium">Entrega</th>
                <th className="px-4 py-2.5 font-medium">Estado</th>
                <th className="px-4 py-2.5 font-medium">Fecha</th>
              </tr>
            </thead>
            <tbody>
              {pedidos.map((item) => (
                <tr
                  key={item.id}
                  onClick={() => setElegido(item.id)}
                  aria-selected={item.id === elegido}
                  className={`cursor-pointer border-t border-slate-100 ${
                    item.id === elegido ? "bg-teal-50" : "hover:bg-slate-50"
                  }`}
                >
                  <td className="px-4 py-3 font-mono text-slate-500">
                    {numeroDePedido(item.number)}
                  </td>
                  <td className="px-4 py-3 font-medium text-slate-800">
                    {item.customerName}
                  </td>
                  <td className="px-4 py-3 text-right font-semibold tabular-nums text-slate-900">
                    {pesos(item.totalMinor)}
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {item.delivery === "DELIVERY" ? "Envío" : "Retiro"}
                  </td>
                  <td className="px-4 py-3">
                    <EstadoPedidoEtiqueta
                      estado={item.status}
                      para="farmacia"
                    />
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {fecha(item.createdAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!pedidos.length && !cargando ? (
            <p className="p-8 text-center text-sm text-slate-500">
              {filtro === "RECEIVED"
                ? "No hay pedidos por confirmar."
                : "No hay pedidos para mostrar."}
            </p>
          ) : null}
        </div>
      </section>
      {pedido ? (
        <DetallePedido
          key={pedido.id}
          pedido={pedido}
          canManage={canManage}
          descuentaStock={descuentaStock}
          onDecidir={async (accion, nota) => {
            try {
              actualizar(
                await decidirPedido(
                  token,
                  organizationId,
                  pedido,
                  accion,
                  nota,
                ),
              );
            } catch (cause) {
              onError(cause instanceof Error ? cause.message : String(cause));
              void cargar();
            }
          }}
        />
      ) : (
        <aside className="hidden items-center justify-center rounded-xl border border-dashed border-slate-200 p-8 text-center text-sm text-slate-500 xl:flex">
          Elegí un pedido para ver el detalle.
        </aside>
      )}
    </div>
  );
}

function DetallePedido({
  pedido,
  canManage,
  descuentaStock,
  onDecidir,
}: {
  pedido: PedidoDeLaFarmacia;
  canManage: boolean;
  descuentaStock: boolean;
  onDecidir: (accion: DecisionPedido, nota?: string) => Promise<void>;
}) {
  const [enviando, setEnviando] = useState(false);
  const [rechazando, setRechazando] = useState(false);
  const [nota, setNota] = useState("");
  const decidir = async (accion: DecisionPedido, motivo?: string) => {
    setEnviando(true);
    try {
      await onDecidir(accion, motivo);
      setRechazando(false);
    } finally {
      setEnviando(false);
    }
  };
  return (
    <aside className="flex min-h-0 flex-col gap-4 overflow-auto rounded-xl border border-slate-200 bg-white p-5">
      <header className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs text-slate-500">Pedido</p>
          <h2 className="text-xl font-semibold text-slate-900">
            {numeroDePedido(pedido.number)}
          </h2>
          <p className="text-sm text-slate-600">
            {pedido.customerName} · {fecha(pedido.createdAt)}
          </p>
        </div>
        <EstadoPedidoEtiqueta estado={pedido.status} para="farmacia" />
      </header>
      <div className="rounded-lg bg-slate-50 p-3 text-sm text-slate-700">
        <p className="flex items-center gap-2 font-medium">
          {pedido.delivery === "DELIVERY" ? (
            <Truck size={16} aria-hidden />
          ) : (
            <Store size={16} aria-hidden />
          )}
          {pedido.delivery === "DELIVERY"
            ? "Envío a domicilio"
            : `Retira en ${pedido.branchName}`}
        </p>
        {pedido.deliveryAddress ? (
          <p className="mt-1 flex items-center gap-2 text-slate-600">
            <MapPin size={15} aria-hidden /> {pedido.deliveryAddress}
          </p>
        ) : null}
        {pedido.notes ? (
          <p className="mt-2 text-slate-600">
            <span className="font-medium text-slate-700">Notas: </span>
            {pedido.notes}
          </p>
        ) : null}
      </div>
      <ul className="divide-y divide-slate-100 text-sm">
        {pedido.items.map((item) => (
          <li key={item.productId} className="flex justify-between gap-3 py-2">
            <span className="min-w-0">
              <span className="block text-slate-800">{item.productName}</span>
              <span className="text-xs text-slate-500">
                {item.quantity} × {pesos(item.unitPriceMinor)}
              </span>
              {item.discountMinor !== "0" ? (
                <span className="block text-xs font-medium text-emerald-700">
                  Oferta: -{pesos(item.discountMinor)}
                </span>
              ) : null}
            </span>
            <span className="font-medium tabular-nums text-slate-900">
              {pesos(item.totalMinor)}
            </span>
          </li>
        ))}
      </ul>
      {pedido.ahorroMinor !== "0" ? (
        <p className="flex justify-between border-t border-slate-200 pt-3 text-sm text-emerald-700">
          <span>Ahorro por ofertas</span>
          <span className="tabular-nums">-{pesos(pedido.ahorroMinor)}</span>
        </p>
      ) : null}
      <p className="flex justify-between border-t border-slate-200 pt-3 text-base font-semibold text-slate-900">
        <span>Total</span>
        <span className="tabular-nums">{pesos(pedido.totalMinor)}</span>
      </p>
      <p
        className={`rounded-lg p-2.5 text-xs ${
          pedido.stockDeducted
            ? "bg-emerald-50 text-emerald-800"
            : "bg-slate-50 text-slate-600"
        }`}
      >
        {pedido.stockDeducted
          ? "El stock de este pedido se descontó al entregarlo."
          : pedido.status === "DELIVERED"
            ? "Se entregó sin descontar stock: registrá la venta en Ventas."
            : descuentaStock
              ? "Al marcarlo entregado se descuenta el stock de la sucursal. No pasa por caja."
              : "No descuenta stock ni pasa por caja: cuando lo entregues, registrá la venta en Ventas."}
      </p>
      {pedido.decisionNote ? (
        <p className="rounded-lg bg-rose-50 p-3 text-sm text-rose-800">
          Motivo del rechazo: {pedido.decisionNote}
        </p>
      ) : null}
      {canManage ? (
        <div className="mt-auto flex flex-col gap-2">
          {rechazando ? (
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium text-slate-700">
                Motivo (lo ve el cliente)
                <textarea
                  value={nota}
                  maxLength={300}
                  onChange={(event) => setNota(event.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white p-2 text-sm"
                  rows={2}
                />
              </label>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={enviando}
                  onClick={() => void decidir("rechazar", nota)}
                  className="flex-1 rounded-lg bg-rose-600 px-3 py-2 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-60"
                >
                  Rechazar pedido
                </button>
                <button
                  type="button"
                  onClick={() => setRechazando(false)}
                  className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
                >
                  Volver
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {pedido.status === "RECEIVED" ? (
                <button
                  type="button"
                  disabled={enviando}
                  onClick={() => void decidir("confirmar")}
                  className="flex-1 rounded-lg bg-teal-700 px-3 py-2 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-60"
                >
                  Confirmar pedido
                </button>
              ) : null}
              {pedido.status === "CONFIRMED" ? (
                <button
                  type="button"
                  disabled={enviando}
                  onClick={() => void decidir("entregar")}
                  className="flex-1 rounded-lg bg-teal-700 px-3 py-2 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-60"
                >
                  Marcar entregado
                </button>
              ) : null}
              {pedido.status === "RECEIVED" || pedido.status === "CONFIRMED" ? (
                <button
                  type="button"
                  disabled={enviando}
                  onClick={() => setRechazando(true)}
                  className="rounded-lg border border-rose-200 px-3 py-2 text-sm font-medium text-rose-700 hover:bg-rose-50 disabled:opacity-60"
                >
                  Rechazar
                </button>
              ) : null}
            </div>
          )}
        </div>
      ) : null}
    </aside>
  );
}
