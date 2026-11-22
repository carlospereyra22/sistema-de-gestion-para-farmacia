import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  BellRing,
  ChevronRight,
  ClipboardList,
  CloudOff,
  FilterX,
  Layers,
  ReceiptText,
  RefreshCw,
  Route,
  Search,
  Store,
  Truck,
  UserRound,
  X,
} from "lucide-react";

import { Boton } from "./boton";
import { DetallePedidoCatalogo } from "./catalogo-pedidos";
import {
  CellText,
  DataTable,
  DataTableCell,
  DataTableEmpty,
  DataTableRow,
  StatusLabel,
} from "./data-table";
import { decidirPedido } from "./lib/catalogo-online-api";
import { useConectividad } from "./lib/conectividad";
import {
  DETALLE_GRUPO,
  GRUPOS,
  ORIGENES,
  ORIGEN_CORTO,
  buscarPedidos,
  claveDe,
  cobroPendiente,
  detalleDe,
  estadoDe,
  numeroDe,
  paraReparto,
} from "./lib/pedidos";
import {
  getPedidosUnificados,
  type GrupoPedidos,
  type ListaPedidosUnificados,
  type OrigenPedido,
  type PedidoUnificado,
} from "./lib/pedidos-api";
import { diaLocal, fechaHora, mensajeDe, pesos } from "./lib/preventa";
import {
  preventaApi,
  type ContextoPreventa,
  type MiembroEquipo,
  type PedidoPreventa,
} from "./lib/preventa-api";
import { ProductFilterSelect } from "./product-filter-select";
import {
  DialogoAsignar,
  PreventaPedidoDetalle,
} from "./preventa-pedido-detalle";
import { Aviso, Hoja } from "./preventa-ui";
import { SelectorFecha } from "./selector-fecha";

type Filtro = {
  grupo: GrupoPedidos | "";
  origen: OrigenPedido | "";
  desde: string;
  hasta: string;
  vendedor: string;
};

const filtroInicial = (): Filtro => ({
  grupo: "",
  origen: "",
  desde: diaLocal(29),
  hasta: diaLocal(0),
  vendedor: "",
});

/** Lo abierto se ve sin importar las fechas (lo decide la API). */
const grupoSinFechas = (grupo: Filtro["grupo"]) =>
  grupo === "por-atender" || grupo === "en-curso";

const ICONO_ORIGEN: Record<OrigenPedido, typeof Store> = {
  catalogo: Store,
  preventa: Route,
};

const COLOR_ORIGEN: Record<OrigenPedido, string> = {
  catalogo: "bg-marca-970 text-marca-535",
  preventa: "bg-sky-50 text-sky-700",
};

/**
 * Pedidos del catálogo online y de preventa en una sola pantalla
 * (SISTEMA-119). Cada pedido se resuelve con las acciones de su módulo; la
 * lista sólo los junta. Ver docs/PEDIDOS.md.
 */
export function PedidosWorkspace({
  token,
  organizationId,
  canManageCatalog,
  onEditarPreventa,
}: {
  token: string;
  organizationId: string;
  /** SALE_MANAGE: confirmar, rechazar y entregar los del catálogo. */
  canManageCatalog: boolean;
  /** Editar un pedido de preventa abre Preventa → Nuevo pedido. */
  onEditarPreventa: (pedido: PedidoPreventa) => void;
}) {
  const [filtro, setFiltro] = useState<Filtro>(filtroInicial);
  const [buscar, setBuscar] = useState("");
  const [datos, setDatos] = useState<ListaPedidosUnificados | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [aviso, setAviso] = useState("");
  const [abierto, setAbierto] = useState<string | null>(null);
  const [contexto, setContexto] = useState<ContextoPreventa | null>(null);
  const [equipo, setEquipo] = useState<MiembroEquipo[]>([]);
  const [elegidos, setElegidos] = useState<Set<string>>(new Set());
  const [asignando, setAsignando] = useState(false);
  const { enLinea } = useConectividad();

  // En segundo plano no muestra "cargando" ni errores: sólo trae lo nuevo.
  const cargar = useCallback(
    async (silencioso = false) => {
      if (!silencioso) setCargando(true);
      try {
        setDatos(
          await getPedidosUnificados(token, organizationId, {
            grupo: filtro.grupo || undefined,
            origen: filtro.origen || undefined,
            desde: filtro.desde || undefined,
            hasta: filtro.hasta || undefined,
            vendedor: filtro.vendedor || undefined,
          }),
        );
        setError("");
      } catch (causa) {
        if (!silencioso) setError(mensajeDe(causa));
      } finally {
        setCargando(false);
      }
    },
    [token, organizationId, filtro],
  );

  useEffect(() => {
    void cargar();
  }, [cargar]);

  // Los pedidos nuevos aparecen solos, como en cada módulo.
  useEffect(() => {
    const intervalo = window.setInterval(() => {
      if (document.visibilityState === "visible") void cargar(true);
    }, 20_000);
    return () => window.clearInterval(intervalo);
  }, [cargar]);

  // Para el detalle de preventa: permisos del usuario y el equipo.
  const veoPreventa = Boolean(datos?.origenes.preventa);
  useEffect(() => {
    if (!veoPreventa) return;
    preventaApi
      .contexto(token, organizationId)
      .then(setContexto)
      .catch(() => setContexto(null));
  }, [token, organizationId, veoPreventa]);
  const administraPreventa = Boolean(contexto?.permisos.administrar);
  useEffect(() => {
    if (!administraPreventa) return;
    preventaApi
      .equipo(token, organizationId)
      .then(setEquipo)
      .catch(() => setEquipo([]));
  }, [token, organizationId, administraPreventa]);

  const visibles = useMemo(
    () => buscarPedidos(datos?.items ?? [], buscar),
    [datos, buscar],
  );
  const pedidoAbierto = datos?.items.find((item) => claveDe(item) === abierto);
  const veoCatalogo = Boolean(datos?.origenes.catalogo);
  const ambos = veoCatalogo && veoPreventa;
  const porAtender = datos
    ? datos.porAtender.catalogo + datos.porAtender.preventa
    : 0;
  const filtrosActivos =
    Number(Boolean(buscar.trim())) +
    Number(Boolean(filtro.origen)) +
    Number(Boolean(filtro.vendedor)) +
    Number(
      filtro.desde !== filtroInicial().desde ||
        filtro.hasta !== filtroInicial().hasta,
    );
  const elegibles = visibles.filter(paraReparto);
  const marcaReparto = administraPreventa && elegibles.length > 0;
  const columnas = 6 + Number(marcaReparto) + Number(ambos);

  const cambiar = (cambios: Partial<Filtro>) => {
    setFiltro((actual) => ({ ...actual, ...cambios }));
    setElegidos(new Set());
  };

  const reemplazar = (nuevo: PedidoUnificado, mensaje: string) => {
    setDatos((actual) =>
      actual
        ? {
            ...actual,
            items: actual.items.map((item) =>
              claveDe(item) === claveDe(nuevo) ? nuevo : item,
            ),
          }
        : actual,
    );
    setAviso(mensaje);
    // Los contadores y el total los recalcula la API.
    void cargar(true);
  };

  const elegir = (id: string, si: boolean) =>
    setElegidos((actual) => {
      const nuevo = new Set(actual);
      if (si) nuevo.add(id);
      else nuevo.delete(id);
      return nuevo;
    });

  return (
    <div className="flex min-w-0 flex-col gap-4">
      {datos ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <TarjetaDato
            icono={<BellRing size={18} aria-hidden />}
            titulo="Por atender"
            valor={String(porAtender)}
            detalle={
              ambos
                ? `${datos.porAtender.catalogo} del catálogo · ${datos.porAtender.preventa} de preventa`
                : "Sin importar la fecha"
            }
            alerta={porAtender > 0}
            activa={filtro.grupo === "por-atender" && !filtro.origen}
            onClick={() => cambiar({ grupo: "por-atender", origen: "" })}
          />
          {veoCatalogo ? (
            <TarjetaDato
              icono={<Store size={18} aria-hidden />}
              titulo="Catálogo online por confirmar"
              valor={String(datos.porAtender.catalogo)}
              detalle="Pedidos que hicieron los clientes"
              activa={
                filtro.grupo === "por-atender" && filtro.origen === "catalogo"
              }
              onClick={() =>
                cambiar({
                  grupo: "por-atender",
                  origen: ambos ? "catalogo" : "",
                  vendedor: "",
                })
              }
            />
          ) : null}
          {veoPreventa ? (
            <TarjetaDato
              icono={<Route size={18} aria-hidden />}
              titulo="Preventa pendientes"
              valor={String(datos.porAtender.preventa)}
              detalle="Tomados, falta salir a reparto"
              activa={
                filtro.grupo === "por-atender" && filtro.origen === "preventa"
              }
              onClick={() =>
                cambiar({
                  grupo: "por-atender",
                  origen: ambos ? "preventa" : "",
                })
              }
            />
          ) : null}
          <TarjetaDato
            icono={<ReceiptText size={18} aria-hidden />}
            titulo="En la lista"
            valor={pesos(datos.resumen.totalMinor)}
            detalle={`${datos.resumen.cantidad} pedido${datos.resumen.cantidad === 1 ? "" : "s"} · sin cancelados`}
          />
        </div>
      ) : null}

      <div className="rounded-2xl border border-slate-200/80 bg-gradient-to-r from-white to-teal-50/30 p-4 shadow-[0_8px_20px_-18px_rgba(15,80,90,.3)]">
        {/* Arriba la búsqueda y las acciones; abajo, los filtros parejos. */}
        <div className="flex flex-wrap gap-3">
          <label className="flex h-12 min-w-[min(100%,16rem)] flex-1 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 shadow-sm focus-within:ring-2 focus-within:ring-teal-500">
            <Search size={17} className="shrink-0 text-teal-600" aria-hidden />
            <input
              aria-label="Buscar pedidos"
              value={buscar}
              onChange={(event) => setBuscar(event.target.value)}
              placeholder="Buscar por cliente o número de pedido…"
              className="h-full w-full min-w-0 border-0 bg-transparent p-0 !text-sm shadow-none outline-none"
            />
            {buscar ? (
              <button
                type="button"
                aria-label="Borrar búsqueda"
                onClick={() => setBuscar("")}
                className="grid size-7 shrink-0 place-items-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              >
                <X size={15} aria-hidden />
              </button>
            ) : null}
          </label>
          <div className="flex gap-2">
            <Boton
              alto="h-12"
              icono={<FilterX size={15} />}
              disabled={!filtrosActivos}
              onClick={() => {
                setBuscar("");
                cambiar({ ...filtroInicial(), grupo: filtro.grupo });
              }}
            >
              Limpiar
            </Boton>
            <Boton
              alto="h-12"
              icono={
                <RefreshCw
                  size={15}
                  className={cargando ? "animate-spin" : undefined}
                />
              }
              disabled={cargando}
              onClick={() => void cargar()}
            >
              Actualizar
            </Boton>
          </div>
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {ambos ? (
            <div className="min-w-0">
              <ProductFilterSelect
                label="Origen"
                icon={<Layers size={18} />}
                value={filtro.origen}
                options={[
                  { value: "", label: "Todos" },
                  { value: "catalogo", label: ORIGENES.catalogo },
                  { value: "preventa", label: ORIGENES.preventa },
                ]}
                onChange={(origen) =>
                  cambiar({
                    origen: origen as Filtro["origen"],
                    // El preventista sólo vale para los de preventa.
                    ...(origen === "catalogo" ? { vendedor: "" } : {}),
                  })
                }
              />
            </div>
          ) : null}
          {administraPreventa && filtro.origen !== "catalogo" ? (
            <div className="min-w-0">
              <ProductFilterSelect
                label="Preventista"
                icon={<UserRound size={18} />}
                value={filtro.vendedor}
                options={[
                  { value: "", label: "Todos" },
                  ...equipo
                    .filter((miembro) => miembro.vende)
                    .map((miembro) => ({
                      value: miembro.userId,
                      label: miembro.name,
                    })),
                ]}
                onChange={(vendedor) => cambiar({ vendedor })}
              />
            </div>
          ) : null}
          <div
            className="min-w-0"
            title={
              grupoSinFechas(filtro.grupo)
                ? "Lo que está abierto se ve sin importar la fecha."
                : undefined
            }
          >
            <SelectorFecha
              label="Desde"
              value={filtro.desde}
              max={filtro.hasta || undefined}
              vacio="Cualquier fecha"
              disabled={grupoSinFechas(filtro.grupo)}
              onChange={(desde) => cambiar({ desde })}
            />
          </div>
          <div
            className="min-w-0"
            title={
              grupoSinFechas(filtro.grupo)
                ? "Lo que está abierto se ve sin importar la fecha."
                : undefined
            }
          >
            <SelectorFecha
              label="Hasta"
              value={filtro.hasta}
              min={filtro.desde || undefined}
              vacio="Cualquier fecha"
              disabled={grupoSinFechas(filtro.grupo)}
              onChange={(hasta) => cambiar({ hasta })}
            />
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <nav
          aria-label="Estado de los pedidos"
          className="flex w-fit max-w-full gap-1 overflow-x-auto rounded-xl bg-slate-200/50 p-1.5"
        >
          {GRUPOS.map(({ id, label }) => (
            <button
              key={id || "todos"}
              type="button"
              aria-pressed={filtro.grupo === id}
              onClick={() => cambiar({ grupo: id })}
              className={`inline-flex shrink-0 items-center gap-2 rounded-lg px-4 py-2 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:ring-offset-2 ${
                filtro.grupo === id
                  ? "bg-white text-teal-700 shadow-sm"
                  : "text-slate-500 hover:bg-white/60 hover:text-teal-700"
              }`}
            >
              <span
                className={`text-sm ${filtro.grupo === id ? "font-semibold" : ""}`}
              >
                {label}
              </span>
              {id === "por-atender" && porAtender > 0 ? (
                <span className="min-w-5 rounded-md bg-amber-100 px-1.5 text-center text-xs font-semibold tabular-nums text-amber-800">
                  {porAtender}
                </span>
              ) : null}
            </button>
          ))}
        </nav>
        <p className="text-xs text-slate-500">{DETALLE_GRUPO[filtro.grupo]}</p>
      </div>

      {!enLinea ? (
        <Aviso tipo="info">
          <CloudOff size={14} className="mr-1 inline" aria-hidden />
          Sin conexión: ves los últimos pedidos que se cargaron. Para
          resolverlos hace falta internet.
        </Aviso>
      ) : null}
      {error ? <Aviso tipo="error">{error}</Aviso> : null}
      {aviso ? <Aviso tipo="bien">{aviso}</Aviso> : null}

      {marcaReparto && elegidos.size ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-marca-908 bg-marca-970 px-4 py-2.5">
          <p className="text-sm font-semibold text-marca-535">
            {elegidos.size} pedido{elegidos.size === 1 ? "" : "s"} de preventa
            elegido{elegidos.size === 1 ? "" : "s"}
          </p>
          <div className="flex gap-2">
            <Boton
              icono={<X size={15} />}
              onClick={() => setElegidos(new Set())}
            >
              Limpiar
            </Boton>
            <Boton
              variante="primario"
              icono={<Truck size={15} />}
              onClick={() => setAsignando(true)}
            >
              Pasar a reparto
            </Boton>
          </div>
        </div>
      ) : null}

      <DataTable
        label="Pedidos"
        minWidthClass="min-w-[52rem]"
        columns={[
          ...(marcaReparto
            ? [
                {
                  label: (
                    <input
                      type="checkbox"
                      className="size-4 accent-teal-700"
                      aria-label="Elegir todos los pendientes de preventa"
                      checked={
                        elegidos.size > 0 &&
                        elegibles.every((item) => elegidos.has(item.pedido.id))
                      }
                      onChange={(event) =>
                        setElegidos(
                          event.target.checked
                            ? new Set(elegibles.map((item) => item.pedido.id))
                            : new Set(),
                        )
                      }
                    />
                  ),
                  className: "w-12",
                },
              ]
            : []),
          { label: "Pedido", className: "w-28" },
          ...(ambos ? [{ label: "Origen", className: "w-36" }] : []),
          { label: "Cliente" },
          { label: "Estado", className: "w-44" },
          { label: "Fecha", className: "w-32" },
          { label: "Total", align: "right" as const, className: "w-36" },
          // Sin texto: cada botón ya dice qué pedido abre. Un sr-only acá
          // escaparía del desplazamiento de la tabla y movería la página.
          { label: "", className: "w-12" },
        ]}
        footer={
          visibles.length ? (
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 bg-niebla-973 px-4 py-3 text-sm text-slate-600">
              <span>
                {visibles.length} pedido{visibles.length === 1 ? "" : "s"}
                {buscar.trim() ? " con esa búsqueda" : ""}
              </span>
              <span className="tabular-nums">
                Total sin cancelados:{" "}
                <strong className="font-semibold text-slate-900">
                  {pesos(
                    visibles.reduce(
                      (suma, { pedido }) =>
                        pedido.status === "CANCELLED" ||
                        pedido.status === "REJECTED"
                          ? suma
                          : suma + BigInt(pedido.totalMinor),
                      0n,
                    ),
                  )}
                </strong>
              </span>
            </div>
          ) : null
        }
      >
        {visibles.map((item) => {
          const clave = claveDe(item);
          const estado = estadoDe(item);
          const cobro = cobroPendiente(item);
          const Icono = ICONO_ORIGEN[item.origen];
          const abrir = () => {
            setAviso("");
            setAbierto(clave);
          };
          return (
            <DataTableRow key={clave} onToggle={abrir}>
              {marcaReparto ? (
                <DataTableCell ignoreRowClick>
                  {paraReparto(item) ? (
                    <input
                      type="checkbox"
                      className="size-4 accent-teal-700"
                      aria-label={`Elegir pedido ${numeroDe(item)}`}
                      checked={elegidos.has(item.pedido.id)}
                      onChange={(event) =>
                        elegir(item.pedido.id, event.target.checked)
                      }
                    />
                  ) : null}
                </DataTableCell>
              ) : null}
              <DataTableCell numeric>
                <span className="font-semibold text-slate-800">
                  {numeroDe(item)}
                </span>
              </DataTableCell>
              {ambos ? (
                <DataTableCell>
                  <span className="inline-flex items-center gap-2 whitespace-nowrap text-sm text-slate-700">
                    <span
                      className={`grid size-7 shrink-0 place-items-center rounded-lg ${COLOR_ORIGEN[item.origen]}`}
                    >
                      <Icono size={15} aria-hidden />
                    </span>
                    {ORIGEN_CORTO[item.origen]}
                  </span>
                </DataTableCell>
              ) : null}
              <DataTableCell>
                <CellText
                  primary={item.pedido.customerName}
                  secondary={detalleDe(item)}
                />
              </DataTableCell>
              <DataTableCell>
                <StatusLabel tone={estado.tono}>{estado.label}</StatusLabel>
                {cobro ? (
                  <span
                    className={`mt-0.5 block pl-3.5 text-xs font-medium ${cobro.tono === "mal" ? "text-rose-700" : "text-teal-700"}`}
                  >
                    {cobro.label}
                  </span>
                ) : null}
              </DataTableCell>
              <DataTableCell numeric className="text-slate-600">
                {fechaHora(item.pedido.createdAt)}
              </DataTableCell>
              <DataTableCell
                align="right"
                numeric
                className="font-semibold text-slate-900"
              >
                {pesos(item.pedido.totalMinor)}
              </DataTableCell>
              <DataTableCell align="right">
                <button
                  type="button"
                  aria-label={`Abrir pedido ${numeroDe(item)}`}
                  onClick={abrir}
                  className="grid size-8 place-items-center rounded-lg text-slate-400 transition-colors hover:bg-marca-970 hover:text-marca-535"
                >
                  <ChevronRight size={17} aria-hidden />
                </button>
              </DataTableCell>
            </DataTableRow>
          );
        })}
        {!visibles.length ? (
          <DataTableEmpty colSpan={columnas}>
            {cargando && !datos ? (
              "Cargando pedidos…"
            ) : (
              <span className="inline-flex flex-col items-center gap-2">
                <span className="grid size-11 place-items-center rounded-xl bg-marca-970 text-marca-535">
                  <ClipboardList size={20} aria-hidden />
                </span>
                <span className="font-medium text-slate-700">
                  {filtro.grupo === "por-atender"
                    ? "No hay pedidos por atender."
                    : "No hay pedidos con estos filtros."}
                </span>
                {filtro.grupo !== "por-atender" ? (
                  <span className="text-xs">
                    Cambiá las fechas, el estado o la búsqueda para ver otros.
                  </span>
                ) : null}
              </span>
            )}
          </DataTableEmpty>
        ) : null}
      </DataTable>

      {pedidoAbierto?.origen === "catalogo" && datos ? (
        <Hoja
          titulo="Pedido del catálogo online"
          ancho="max-w-xl"
          onClose={() => setAbierto(null)}
        >
          <DetallePedidoCatalogo
            key={pedidoAbierto.pedido.id}
            enDialogo
            pedido={pedidoAbierto.pedido}
            canManage={canManageCatalog}
            descuentaStock={datos.descuentaStock}
            onDecidir={async (accion, nota) => {
              try {
                const nuevo = await decidirPedido(
                  token,
                  organizationId,
                  pedidoAbierto.pedido,
                  accion,
                  nota,
                );
                reemplazar(
                  { origen: "catalogo", pedido: nuevo },
                  accion === "confirmar"
                    ? "Pedido confirmado."
                    : accion === "entregar"
                      ? "Pedido entregado."
                      : "Pedido rechazado.",
                );
              } catch (causa) {
                setError(mensajeDe(causa));
                setAbierto(null);
                void cargar(true);
              }
            }}
          />
        </Hoja>
      ) : null}

      {pedidoAbierto?.origen === "preventa" && contexto ? (
        <PreventaPedidoDetalle
          key={pedidoAbierto.pedido.id}
          token={token}
          organizationId={organizationId}
          contexto={contexto}
          pedido={pedidoAbierto.pedido}
          equipo={equipo}
          onCambio={(nuevo, mensaje) =>
            reemplazar({ origen: "preventa", pedido: nuevo }, mensaje)
          }
          onEditar={(pedido) => {
            setAbierto(null);
            onEditarPreventa(pedido);
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
              setAviso(
                `${elegidos.size} pedido${elegidos.size === 1 ? "" : "s"} en reparto.`,
              );
              setElegidos(new Set());
            } catch (causa) {
              setError(mensajeDe(causa));
            } finally {
              setAsignando(false);
              void cargar(true);
            }
          }}
        />
      ) : null}
    </div>
  );
}

/**
 * Dato de arriba (ícono en su recuadro, título chico y número). Con onClick
 * filtra la lista; la activa queda marcada como el menú.
 */
function TarjetaDato({
  icono,
  titulo,
  valor,
  detalle,
  alerta = false,
  activa = false,
  onClick,
}: {
  icono: ReactNode;
  titulo: string;
  valor: string;
  detalle: string;
  alerta?: boolean;
  activa?: boolean;
  onClick?: () => void;
}) {
  const contenido = (
    <>
      <span
        className={`relative grid size-10 shrink-0 place-items-center rounded-xl ${alerta ? "bg-amber-100 text-amber-700" : "bg-marca-970 text-marca-535"}`}
      >
        {icono}
      </span>
      <span className="min-w-0 text-left">
        <span className="block truncate text-xs text-slate-500">{titulo}</span>
        <span className="block text-xl font-semibold tabular-nums text-slate-900">
          {valor}
        </span>
        <span className="block truncate text-xs text-slate-500">{detalle}</span>
      </span>
    </>
  );
  const clases = `flex min-w-0 items-center gap-3 rounded-xl border bg-white px-4 py-3.5 shadow-sm ${
    activa ? "border-marca-908 ring-1 ring-marca-908" : "border-slate-200"
  }`;
  return onClick ? (
    <button
      type="button"
      aria-pressed={activa}
      onClick={onClick}
      className={`${clases} transition-colors hover:border-marca-908 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-600`}
    >
      {contenido}
    </button>
  ) : (
    <div className={clases}>{contenido}</div>
  );
}
