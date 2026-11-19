import { useCallback, useEffect, useState } from "react";
import {
  ChevronRight,
  ClipboardList,
  CloudOff,
  FileText,
  RefreshCw,
  RotateCcw,
  CalendarDays,
  Filter,
  Search,
  UserRound,
  Trash2,
  Truck,
} from "lucide-react";

import {
  preventaApi,
  type ContextoPreventa,
  type EstadoPreventa,
  type ListaPedidos,
  type MiembroEquipo,
  type PedidoPreventa,
} from "./lib/preventa-api";
import {
  quitarDeBandeja,
  reintentarDeBandeja,
  type PedidoEnBandeja,
} from "./lib/preventa-bandeja";
import {
  COBROS,
  ESTADOS,
  PUNTO_TONO,
  diaLocal,
  fechaHora,
  mensajeDe,
  numeroDePedido,
  pesos,
} from "./lib/preventa";
import { ProductFilterSelect } from "./product-filter-select";
import {
  DialogoAsignar,
  PreventaPedidoDetalle,
} from "./preventa-pedido-detalle";
import {
  Aviso,
  BarraTotal,
  BloqueFiltro,
  Hoja,
  Pastilla,
  Vacio,
  botonPrimario,
  botonSecundario,
  campo,
} from "./preventa-ui";

type Filtro = {
  estado: EstadoPreventa | "";
  desde: string;
  hasta: string;
  vendedor: string;
};

const FILTRO_INICIAL: Filtro = {
  estado: "",
  desde: diaLocal(30),
  hasta: diaLocal(0),
  vendedor: "",
};

const ESTADOS_FILTRO: { id: Filtro["estado"]; label: string }[] = [
  { id: "", label: "Todos" },
  { id: "PENDING", label: "Pendientes" },
  { id: "IN_DELIVERY", label: "En reparto" },
  { id: "DELIVERED", label: "Entregados" },
  { id: "CANCELLED", label: "Cancelados" },
];

/**
 * Pedidos de preventa (SISTEMA-108). El preventista ve los suyos; quien
 * administra ve todos, filtra por preventista y pasa varios a reparto juntos.
 */
export function PreventaPedidos({
  token,
  organizationId,
  contexto,
  equipo,
  bandeja,
  onEditar,
  recarga,
}: {
  token: string;
  organizationId: string;
  contexto: ContextoPreventa;
  equipo: MiembroEquipo[];
  bandeja: PedidoEnBandeja[];
  onEditar: (pedido: PedidoPreventa) => void;
  recarga: number;
}) {
  const [filtro, setFiltro] = useState<Filtro>(FILTRO_INICIAL);
  const [datos, setDatos] = useState<ListaPedidos | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [aviso, setAviso] = useState("");
  const [abierto, setAbierto] = useState<PedidoPreventa | null>(null);
  const [verFiltros, setVerFiltros] = useState(false);
  const [borrador, setBorrador] = useState<Filtro>(FILTRO_INICIAL);
  const [buscar, setBuscar] = useState("");
  const [elegidos, setElegidos] = useState<Set<string>>(new Set());
  const [asignando, setAsignando] = useState(false);
  const administra = contexto.permisos.administrar;

  const cargar = useCallback(
    async (silencioso = false) => {
      if (!silencioso) setCargando(true);
      try {
        setDatos(
          await preventaApi.pedidos(token, organizationId, {
            estado: filtro.estado || undefined,
            desde: filtro.desde || undefined,
            hasta: filtro.hasta || undefined,
            vendedor: filtro.vendedor || undefined,
            mios: !administra && contexto.permisos.vender,
          }),
        );
        setError("");
      } catch (causa) {
        if (!silencioso) setError(mensajeDe(causa));
      } finally {
        setCargando(false);
      }
    },
    [token, organizationId, filtro, administra, contexto.permisos.vender],
  );

  useEffect(() => {
    void cargar();
  }, [cargar, recarga]);

  // Lo que cambian otros (repartidor, farmacia) aparece solo.
  useEffect(() => {
    const intervalo = window.setInterval(() => {
      if (document.visibilityState === "visible") void cargar(true);
    }, 30_000);
    return () => window.clearInterval(intervalo);
  }, [cargar]);

  const texto = buscar.trim().toLowerCase();
  const visibles = (datos?.items ?? []).filter(
    (p) => !texto || p.customerName.toLowerCase().includes(texto),
  );
  const filtrosActivos =
    (filtro.vendedor ? 1 : 0) +
    (filtro.desde !== FILTRO_INICIAL.desde ||
    filtro.hasta !== FILTRO_INICIAL.hasta
      ? 1
      : 0);

  const reemplazar = (nuevo: PedidoPreventa, mensaje: string) => {
    setDatos((d) =>
      d
        ? { ...d, items: d.items.map((p) => (p.id === nuevo.id ? nuevo : p)) }
        : d,
    );
    setAbierto(nuevo);
    setAviso(mensaje);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      {bandeja.length ? (
        <section className="rounded-2xl border border-amber-200 bg-amber-50 p-3">
          <p className="flex items-center gap-1.5 text-sm font-bold text-amber-900">
            <CloudOff size={16} aria-hidden />
            {bandeja.length} pedido{bandeja.length === 1 ? "" : "s"} sin enviar
          </p>
          <p className="text-xs text-amber-900">
            Se mandan solos cuando vuelve la señal.
          </p>
          <ul className="mt-2 grid gap-1.5">
            {bandeja.map((p) => (
              <li
                key={p.requestId}
                className="flex items-center gap-2 rounded-xl bg-white px-3 py-2 text-sm"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold text-slate-900">
                    {p.customerName}
                  </span>
                  <span className="block text-xs text-slate-500">
                    {fechaHora(p.tomadoEl)} · {pesos(p.totalEstimadoMinor)}{" "}
                    estimado
                  </span>
                  {p.error ? (
                    <span className="block text-xs font-semibold text-rose-700">
                      {p.error}
                    </span>
                  ) : null}
                </span>
                {p.error ? (
                  <>
                    <button
                      type="button"
                      aria-label="Reintentar"
                      className="grid size-9 place-items-center rounded-lg text-teal-700 hover:bg-teal-50"
                      onClick={() =>
                        reintentarDeBandeja(
                          contexto.usuario.id,
                          organizationId,
                          p.requestId,
                        )
                      }
                    >
                      <RotateCcw size={16} aria-hidden />
                    </button>
                    <button
                      type="button"
                      aria-label="Descartar"
                      className="grid size-9 place-items-center rounded-lg text-rose-700 hover:bg-rose-50"
                      onClick={() =>
                        quitarDeBandeja(
                          contexto.usuario.id,
                          organizationId,
                          p.requestId,
                        )
                      }
                    >
                      <Trash2 size={16} aria-hidden />
                    </button>
                  </>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <div className="flex items-center gap-2">
        <label className="relative min-w-0 flex-1">
          <span className="sr-only">Buscar cliente</span>
          <Search
            size={18}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-teal-700"
            aria-hidden
          />
          <input
            className={`${campo} mt-0 pl-10`}
            placeholder="Buscar cliente"
            value={buscar}
            onChange={(e) => setBuscar(e.target.value)}
            aria-label="Buscar cliente"
          />
        </label>
        <button
          type="button"
          aria-label="Filtros"
          onClick={() => {
            setBorrador(filtro);
            setVerFiltros(true);
          }}
          className="relative grid size-11 shrink-0 place-items-center rounded-xl border border-slate-200 bg-white text-teal-700 hover:bg-slate-50"
        >
          <Filter size={20} aria-hidden />
          {filtrosActivos ? (
            <span className="absolute -right-1 -top-1 grid size-5 place-items-center rounded-full bg-teal-700 text-[10px] font-bold text-white">
              {filtrosActivos}
            </span>
          ) : null}
        </button>
        <button
          type="button"
          aria-label="Actualizar pedidos"
          onClick={() => void cargar()}
          className="hidden size-11 shrink-0 place-items-center rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 sm:grid"
        >
          <RefreshCw size={18} aria-hidden />
        </button>
      </div>

      <div className="flex gap-1.5 overflow-x-auto sin-barra">
        {ESTADOS_FILTRO.map(({ id, label }) => (
          <button
            key={id || "todos"}
            type="button"
            aria-pressed={filtro.estado === id}
            onClick={() => setFiltro((f) => ({ ...f, estado: id }))}
            className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-semibold ${
              filtro.estado === id
                ? "border-teal-700 bg-teal-700 text-white"
                : "border-slate-200 bg-white text-slate-600"
            }`}
          >
            {id ? (
              <span
                className={`size-2 rounded-full ${PUNTO_TONO[ESTADOS[id].tono]}`}
                aria-hidden
              />
            ) : null}
            {label}
            {id === "PENDING" && datos?.resumen.pendientes ? (
              <span className="rounded-full bg-amber-400 px-1.5 text-xs text-slate-900">
                {datos.resumen.pendientes}
              </span>
            ) : null}
          </button>
        ))}
      </div>

      {aviso ? <Aviso tipo="bien">{aviso}</Aviso> : null}
      {error ? <Aviso tipo="error">{error}</Aviso> : null}

      {administra && elegidos.size ? (
        <div className="flex items-center justify-between gap-2 rounded-2xl bg-teal-50 p-3">
          <p className="text-sm font-semibold text-teal-900">
            {elegidos.size} pedido{elegidos.size === 1 ? "" : "s"} elegido
            {elegidos.size === 1 ? "" : "s"}
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              className={botonSecundario}
              onClick={() => setElegidos(new Set())}
            >
              Limpiar
            </button>
            <button
              type="button"
              className={botonPrimario}
              onClick={() => setAsignando(true)}
            >
              <Truck size={16} aria-hidden /> Pasar a reparto
            </button>
          </div>
        </div>
      ) : null}

      {!cargando && !visibles.length ? (
        <Vacio
          icono={<ClipboardList size={22} aria-hidden />}
          titulo="No hay pedidos con estos filtros"
          detalle="Cambiá las fechas o el estado para ver otros."
        />
      ) : null}

      <ul className="grid gap-2 lg:grid-cols-2">
        {visibles.map((pedido) => {
          const estado = ESTADOS[pedido.status];
          const elegible = administra && pedido.status === "PENDING";
          return (
            <li key={pedido.id} className="flex items-stretch gap-2">
              {elegible ? (
                <label className="grid w-9 shrink-0 place-items-center rounded-2xl border border-slate-200 bg-white">
                  <input
                    type="checkbox"
                    className="size-4 accent-teal-700"
                    aria-label={`Elegir pedido ${numeroDePedido(pedido.number)}`}
                    checked={elegidos.has(pedido.id)}
                    onChange={(e) =>
                      setElegidos((s) => {
                        const nuevo = new Set(s);
                        if (e.target.checked) nuevo.add(pedido.id);
                        else nuevo.delete(pedido.id);
                        return nuevo;
                      })
                    }
                  />
                </label>
              ) : null}
              <button
                type="button"
                onClick={() => {
                  setAviso("");
                  setAbierto(pedido);
                }}
                className="flex min-w-0 flex-1 items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3 text-left shadow-sm hover:border-teal-300"
              >
                <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-teal-50 text-teal-700">
                  <FileText size={20} aria-hidden />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-start justify-between gap-2">
                    <span className="truncate text-sm font-bold text-slate-900">
                      {pedido.customerName}
                    </span>
                    <Pastilla tono={estado.tono}>{estado.label}</Pastilla>
                  </span>
                  <span className="block truncate text-xs text-slate-500">
                    {numeroDePedido(pedido.number)} ·{" "}
                    {fechaHora(pedido.createdAt)}
                    {administra && pedido.sellerName
                      ? ` · ${pedido.sellerName}`
                      : ""}
                  </span>
                  <span className="mt-0.5 flex items-center gap-2">
                    <span className="text-base font-bold tabular-nums text-emerald-700">
                      {pesos(pedido.totalMinor)}
                    </span>
                    {pedido.status === "DELIVERED" &&
                    pedido.paymentStatus !== "PAGADO" ? (
                      <Pastilla tono={COBROS[pedido.paymentStatus].tono}>
                        {COBROS[pedido.paymentStatus].label}
                      </Pastilla>
                    ) : null}
                    {pedido.delivererName && pedido.status === "IN_DELIVERY" ? (
                      <span className="truncate text-xs text-slate-500">
                        <Truck
                          size={12}
                          className="mr-0.5 inline"
                          aria-hidden
                        />
                        {pedido.delivererName}
                      </span>
                    ) : null}
                  </span>
                </span>
                <ChevronRight
                  size={18}
                  className="shrink-0 text-slate-400"
                  aria-hidden
                />
              </button>
            </li>
          );
        })}
      </ul>

      {visibles.length ? (
        <BarraTotal>
          <span className="text-xl font-bold tabular-nums">
            Total:{" "}
            {pesos(
              visibles.reduce(
                (s, p) =>
                  p.status === "CANCELLED" ? s : s + BigInt(p.totalMinor),
                0n,
              ),
            )}
          </span>
          <span className="text-sm text-white/80">
            · {visibles.length} pedido{visibles.length === 1 ? "" : "s"}
          </span>
        </BarraTotal>
      ) : null}

      {verFiltros ? (
        <Hoja
          titulo="Filtros de pedidos"
          onClose={() => setVerFiltros(false)}
          pie={
            <div className="flex items-center justify-between gap-3">
              <button
                type="button"
                className="text-sm font-semibold text-slate-500 hover:text-slate-800"
                onClick={() => setBorrador(FILTRO_INICIAL)}
              >
                Restablecer
              </button>
              <button
                type="button"
                className={`${botonPrimario} px-6`}
                onClick={() => {
                  setFiltro(borrador);
                  setVerFiltros(false);
                }}
              >
                Aplicar
              </button>
            </div>
          }
        >
          <div className="grid gap-3">
            <BloqueFiltro
              titulo="Fecha"
              icono={<CalendarDays size={16} aria-hidden />}
            >
              <div className="grid grid-cols-2 gap-2">
                <label className="text-xs font-medium text-slate-500">
                  Desde
                  <input
                    type="date"
                    className={campo}
                    value={borrador.desde}
                    onChange={(e) =>
                      setBorrador((f) => ({ ...f, desde: e.target.value }))
                    }
                  />
                </label>
                <label className="text-xs font-medium text-slate-500">
                  Hasta
                  <input
                    type="date"
                    className={campo}
                    value={borrador.hasta}
                    onChange={(e) =>
                      setBorrador((f) => ({ ...f, hasta: e.target.value }))
                    }
                  />
                </label>
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {[
                  { label: "Hoy", desde: diaLocal(0) },
                  { label: "7 días", desde: diaLocal(6) },
                  { label: "30 días", desde: diaLocal(29) },
                ].map((r) => (
                  <button
                    key={r.label}
                    type="button"
                    onClick={() =>
                      setBorrador((f) => ({
                        ...f,
                        desde: r.desde,
                        hasta: diaLocal(0),
                      }))
                    }
                    className="rounded-full border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    {r.label}
                  </button>
                ))}
              </div>
            </BloqueFiltro>
            <BloqueFiltro
              titulo="Estado"
              icono={<ClipboardList size={16} aria-hidden />}
            >
              <ProductFilterSelect
                label="Estado"
                value={borrador.estado}
                icon={<ClipboardList size={16} aria-hidden />}
                options={ESTADOS_FILTRO.map(({ id, label }) => ({
                  value: id,
                  label,
                }))}
                onChange={(estado) =>
                  setBorrador((f) => ({
                    ...f,
                    estado: estado as Filtro["estado"],
                  }))
                }
              />
            </BloqueFiltro>
            {administra ? (
              <BloqueFiltro
                titulo="Preventista"
                icono={<UserRound size={16} aria-hidden />}
              >
                <ProductFilterSelect
                  label="Preventista"
                  value={borrador.vendedor}
                  icon={<UserRound size={16} aria-hidden />}
                  options={[
                    { value: "", label: "Todos los preventistas" },
                    ...equipo
                      .filter((m) => m.vende)
                      .map((m) => ({ value: m.userId, label: m.name })),
                  ]}
                  onChange={(vendedor) =>
                    setBorrador((f) => ({ ...f, vendedor }))
                  }
                />
              </BloqueFiltro>
            ) : null}
          </div>
        </Hoja>
      ) : null}

      {abierto ? (
        <PreventaPedidoDetalle
          token={token}
          organizationId={organizationId}
          contexto={contexto}
          pedido={abierto}
          equipo={equipo}
          onCambio={reemplazar}
          onEditar={(p) => {
            setAbierto(null);
            onEditar(p);
          }}
          onClose={() => setAbierto(null)}
        />
      ) : null}

      {asignando ? (
        <DialogoAsignar
          equipo={equipo}
          actual={null}
          cantidad={elegidos.size}
          onClose={() => setAsignando(false)}
          onConfirmar={async (delivererId) => {
            try {
              await preventaApi.asignar(
                token,
                organizationId,
                [...elegidos],
                delivererId,
              );
              setAviso(`${elegidos.size} pedido(s) en reparto.`);
              setElegidos(new Set());
              setAsignando(false);
              void cargar(true);
            } catch (causa) {
              setError(mensajeDe(causa));
              setAsignando(false);
            }
          }}
        />
      ) : null}
    </div>
  );
}
