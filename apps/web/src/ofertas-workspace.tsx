import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  BadgePercent,
  Building2,
  Eye,
  FilterX,
  Layers,
  Package,
  Pause,
  Pencil,
  Play,
  Plus,
  Search,
  Archive,
  Square,
  Send,
  WifiOff,
  X,
} from "lucide-react";
import type { CatalogProduct, StockLot } from "./lib/api";
import { SinConexionError } from "./lib/api-fetch";
import { TOKEN_SIN_CONEXION } from "./lib/cache-local";
import { useConectividad } from "./lib/conectividad";
import {
  accionOferta,
  getOferta,
  getOfertas,
  type AccionOferta,
  type DetalleOferta,
  type Oferta,
} from "./lib/ofertas-api";
import {
  TIPOS_OFERTA,
  textoVigencia,
  type DestinoFormulario,
} from "./lib/oferta-formulario";
import {
  agruparDestinosOferta,
  describirCambiosOferta,
  TIPO_DESTINO_OFERTA,
} from "./lib/ofertas-detalle";
import { pesos, type EstadoOferta, type TipoOferta } from "./lib/ofertas-motor";
import { OfertaEditor } from "./oferta-editor";
import { OfertaAccionDialog } from "./oferta-accion-dialog";
import { BotonConAyuda } from "./boton-con-ayuda";
import { accionesDe, ESTADOS_OFERTA } from "./lib/ofertas-estados";
import { ProductFilterSelect } from "./product-filter-select";
import { secondary, primary } from "./supplier-payables/dialog";

const COLOR_ESTADO: Record<EstadoOferta, string> = {
  ACTIVA: "bg-emerald-100 text-emerald-800",
  PROGRAMADA: "bg-sky-100 text-sky-800",
  PAUSADA: "bg-amber-100 text-amber-800",
  BORRADOR: "bg-slate-100 text-slate-700",
  VENCIDA: "bg-slate-100 text-slate-500",
  FINALIZADA: "bg-slate-100 text-slate-500",
  ARCHIVADA: "bg-slate-100 text-slate-400",
};

export function EstadoOfertaBadge({ estado }: { estado: EstadoOferta }) {
  return (
    <span
      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${COLOR_ESTADO[estado]}`}
    >
      {ESTADOS_OFERTA.find((item) => item.value === estado)?.label ?? estado}
    </span>
  );
}

const ACCION: Record<
  AccionOferta,
  { label: string; icon: typeof Pause; ayuda: string }
> = {
  publicar: {
    label: "Publicar",
    icon: Send,
    ayuda: "Empieza a aplicarse sola en Ventas.",
  },
  pausar: {
    label: "Pausar",
    icon: Pause,
    ayuda: "Deja de aplicarse hasta que la reanudes.",
  },
  reanudar: {
    label: "Reanudar",
    icon: Play,
    ayuda: "Vuelve a aplicarse en Ventas.",
  },
  finalizar: {
    label: "Finalizar ya",
    icon: Square,
    ayuda: "Termina ahora; no se puede reanudar.",
  },
  archivar: {
    label: "Archivar",
    icon: Archive,
    ayuda: "La saca del listado; no se borra.",
  },
};

/** Apartado Ofertas (SISTEMA-103): listado, alta, edición, acciones y detalle. */
export function OfertasWorkspace({
  token,
  organizationId,
  branches,
  products,
  stock,
  canManage: puedeGestionar,
  canSeeCosts,
  crearPara,
  onCrearParaUsado,
  onError,
}: {
  token: string;
  organizationId: string;
  branches: { id: string; name: string }[];
  products: CatalogProduct[];
  stock: StockLot[];
  canManage: boolean;
  canSeeCosts: boolean;
  /** "Crear oferta para este producto" desde Productos. */
  crearPara?: string;
  onCrearParaUsado?: () => void;
  onError: (mensaje: string) => void;
}) {
  // Sin internet se ven las ofertas guardadas en la PC (Ventas las sigue
  // aplicando), pero crear, editar o cambiar el estado necesita el servidor.
  const { enLinea } = useConectividad();
  const sinConexion = !enLinea || token === TOKEN_SIN_CONEXION;
  const canManage = puedeGestionar && !sinConexion;
  const [filtros, setFiltros] = useState<{
    q: string;
    estado: EstadoOferta | "";
    tipo: TipoOferta | "";
    branchId: string;
  }>({ q: "", estado: "", tipo: "", branchId: "" });
  const [ofertas, setOfertas] = useState<Oferta[]>([]);
  const [cargando, setCargando] = useState(true);
  const [editor, setEditor] = useState<
    { oferta?: Oferta; destinos?: DestinoFormulario[] } | undefined
  >();
  const [detalle, setDetalle] = useState<DetalleOferta>();
  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const todas = await getOfertas(token, organizationId, filtros);
      // Las archivadas salen del listado habitual: se ven filtrando por estado.
      setOfertas(
        filtros.estado
          ? todas
          : todas.filter((oferta) => oferta.estado !== "ARCHIVADA"),
      );
    } catch (cause) {
      // Sin conexión y sin copia de esta búsqueda: lo explica el aviso.
      if (cause instanceof SinConexionError) setOfertas([]);
      else
        onError(
          cause instanceof Error
            ? cause.message
            : "No se pudieron cargar las ofertas.",
        );
    } finally {
      setCargando(false);
    }
  }, [token, organizationId, filtros, onError]);
  useEffect(() => {
    const espera = window.setTimeout(() => void cargar(), filtros.q ? 250 : 0);
    return () => window.clearTimeout(espera);
    // Al volver la conexión se recarga para traer lo último.
  }, [cargar, filtros.q, sinConexion]);
  // Desde Productos: el alta abre con el producto ya elegido.
  useEffect(() => {
    if (!crearPara || !canManage) return;
    const producto = products.find((item) => item.id === crearPara);
    if (!producto) return;
    setEditor({
      destinos: [
        {
          kind: "PRODUCT",
          id: producto.id,
          name: [producto.name, producto.presentation]
            .filter(Boolean)
            .join(" · "),
          exclude: false,
          quantity: "",
        },
      ],
    });
    onCrearParaUsado?.();
  }, [crearPara, canManage, products, onCrearParaUsado]);
  const costos = useMemo(() => {
    if (!canSeeCosts) return undefined;
    // Costo del lote más reciente de cada producto en la sucursal.
    const ultimos = new Map<string, { fecha: string; costo: number }>();
    for (const lote of stock) {
      if (!lote.unitCostMinor) continue;
      const fecha = lote.createdAt ?? "";
      const actual = ultimos.get(lote.productId);
      if (!actual || fecha > actual.fecha)
        ultimos.set(lote.productId, {
          fecha,
          costo: Number(lote.unitCostMinor),
        });
    }
    return new Map([...ultimos].map(([id, { costo }]) => [id, costo]));
  }, [stock, canSeeCosts]);
  // Las acciones que cambian el estado se confirman en un diálogo del
  // sistema.
  const [confirmacion, setConfirmacion] = useState<{
    oferta: Oferta;
    accion: AccionOferta;
  }>();
  // Mientras se confirma una acción, los botones quedan bloqueados.
  const busy = Boolean(confirmacion);
  const realizar = async (oferta: Oferta, accion: AccionOferta) => {
    const resultado = await accionOferta(
      token,
      organizationId,
      oferta.id,
      accion,
    );
    if (detalle) setDetalle(resultado);
    await cargar();
  };
  const ejecutar = (oferta: Oferta, accion: AccionOferta) =>
    setConfirmacion({ oferta, accion });
  const abrirDetalle = async (oferta: Oferta) => {
    try {
      setDetalle(await getOferta(token, organizationId, oferta.id));
    } catch (cause) {
      onError(
        cause instanceof Error ? cause.message : "No se pudo abrir la oferta.",
      );
    }
  };
  const cantidadFiltros = Object.values(filtros).filter(Boolean).length;
  return (
    <div className="space-y-4">
      {sinConexion && (
        <p
          role="status"
          className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-800"
        >
          <WifiOff size={16} className="mt-0.5 shrink-0" aria-hidden />
          <span>
            <strong className="font-semibold">Sin conexión.</strong> Ves las
            ofertas guardadas en esta PC y Ventas las sigue aplicando. Para
            crear, editar, pausar o finalizar ofertas hace falta internet.
          </span>
        </p>
      )}
      <div className="rounded-2xl border border-slate-200/80 bg-gradient-to-r from-white to-teal-50/30 p-4 shadow-[0_8px_20px_-18px_rgba(15,80,90,.3)]">
        <div className="grid gap-3 md:grid-cols-[minmax(0,2fr)_repeat(3,minmax(0,1fr))_auto_auto]">
          <label className="flex min-w-0 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 shadow-sm focus-within:ring-2 focus-within:ring-teal-500">
            <Search size={17} className="shrink-0 text-teal-600" />
            <input
              aria-label="Buscar ofertas"
              value={filtros.q}
              onChange={(event) =>
                setFiltros({ ...filtros, q: event.target.value })
              }
              placeholder="Buscar por nombre o producto"
              className="h-12 w-full min-w-0 border-0 bg-transparent p-0 !text-sm shadow-none outline-none"
            />
          </label>
          <ProductFilterSelect
            label="Estado"
            icon={<BadgePercent size={18} />}
            value={filtros.estado}
            options={[{ value: "", label: "Todos" }, ...ESTADOS_OFERTA]}
            onChange={(estado) =>
              setFiltros({ ...filtros, estado: estado as EstadoOferta | "" })
            }
          />
          <ProductFilterSelect
            label="Tipo"
            icon={<Layers size={18} />}
            value={filtros.tipo}
            options={[
              { value: "", label: "Todos" },
              ...TIPOS_OFERTA.map((tipo) => ({
                value: tipo.type,
                label: tipo.titulo,
              })),
            ]}
            onChange={(tipo) =>
              setFiltros({ ...filtros, tipo: tipo as TipoOferta | "" })
            }
          />
          <ProductFilterSelect
            label="Sucursal"
            icon={<Building2 size={18} />}
            value={filtros.branchId}
            options={[
              { value: "", label: "Todas" },
              ...branches.map((branch) => ({
                value: branch.id,
                label: branch.name,
              })),
            ]}
            onChange={(branchId) => setFiltros({ ...filtros, branchId })}
          />
          <button
            type="button"
            disabled={!cantidadFiltros}
            onClick={() =>
              setFiltros({ q: "", estado: "", tipo: "", branchId: "" })
            }
            className={`${secondary} h-12!`}
          >
            <FilterX size={16} /> Limpiar
          </button>
          {canManage && (
            <button
              type="button"
              className={`${primary} h-12!`}
              onClick={() => setEditor({})}
            >
              <Plus size={16} /> Nueva oferta
            </button>
          )}
        </div>
      </div>
      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
        <table className="w-full min-w-[960px] text-sm">
          <thead className="bg-slate-50 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Nombre</th>
              <th className="px-3 py-3">Tipo</th>
              <th className="px-3 py-3">Alcance</th>
              <th className="px-3 py-3">Vigencia</th>
              <th className="px-3 py-3">Sucursales</th>
              <th className="px-3 py-3">Estado</th>
              <th className="px-3 py-3 text-right">Ventas</th>
              <th className="px-3 py-3 text-right">Unidades</th>
              <th className="px-3 py-3 text-right">Descuento</th>
              <th className="px-3 py-3 text-center">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {ofertas.map((oferta) => (
              <tr key={oferta.id} className="hover:bg-teal-50/30">
                <td className="px-4 py-2.5">
                  <button
                    type="button"
                    className="text-left font-semibold text-slate-800 hover:text-teal-700"
                    onClick={() => void abrirDetalle(oferta)}
                  >
                    {oferta.name}
                  </button>
                </td>
                <td className="px-3 py-2.5">
                  <span className="inline-block whitespace-nowrap rounded-md bg-rose-50 px-1.5 py-0.5 text-xs font-bold text-rose-700">
                    {oferta.label}
                  </span>
                  <span className="mt-0.5 block text-xs text-slate-500">
                    {
                      TIPOS_OFERTA.find((tipo) => tipo.type === oferta.type)
                        ?.titulo
                    }
                  </span>
                </td>
                <td
                  className="max-w-56 truncate px-3 py-2.5"
                  title={oferta.alcance}
                >
                  {oferta.alcance}
                </td>
                <td className="px-3 py-2.5 text-slate-600">
                  {textoVigencia(oferta)}
                </td>
                <td className="px-3 py-2.5 text-slate-600">
                  {oferta.allBranches
                    ? "Todas"
                    : branches
                        .filter((branch) =>
                          oferta.branchIds.includes(branch.id),
                        )
                        .map((branch) => branch.name)
                        .join(", ")}
                </td>
                <td className="px-3 py-2.5">
                  <EstadoOfertaBadge estado={oferta.estado} />
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums">
                  {oferta.stats.ventas}
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums">
                  {oferta.stats.unidades}
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums">
                  {pesos(BigInt(oferta.stats.descuentoMinor))}
                </td>
                <td className="px-3 py-2.5">
                  <div className="flex justify-center gap-1">
                    <BotonConAyuda
                      label={`Ver ${oferta.name}`}
                      title="Ver detalle"
                      description="Ventas con la oferta e historial de cambios."
                      icon={Eye}
                      onClick={() => void abrirDetalle(oferta)}
                    />
                    {canManage &&
                      oferta.status !== "FINISHED" &&
                      oferta.status !== "ARCHIVED" && (
                        <BotonConAyuda
                          label={`Editar ${oferta.name}`}
                          title="Editar"
                          description="Cambiar productos, descuento o vigencia."
                          icon={Pencil}
                          disabled={busy}
                          onClick={() => setEditor({ oferta })}
                        />
                      )}
                    {canManage &&
                      accionesDe(oferta).map((accion) => (
                        <BotonConAyuda
                          key={accion}
                          label={`${ACCION[accion].label} ${oferta.name}`}
                          title={ACCION[accion].label}
                          description={ACCION[accion].ayuda}
                          tone={
                            accion === "finalizar" || accion === "archivar"
                              ? "danger"
                              : "neutral"
                          }
                          icon={ACCION[accion].icon}
                          disabled={busy}
                          onClick={() => ejecutar(oferta, accion)}
                        />
                      ))}
                  </div>
                </td>
              </tr>
            ))}
            {!ofertas.length && (
              <tr>
                <td
                  colSpan={10}
                  className="px-4 py-10 text-center text-slate-500"
                >
                  {cargando
                    ? "Cargando ofertas…"
                    : cantidadFiltros
                      ? "No hay ofertas con esos filtros."
                      : "Todavía no hay ofertas. Creá la primera con «Nueva oferta»."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {editor && (
        <OfertaEditor
          token={token}
          organizationId={organizationId}
          oferta={editor.oferta}
          destinosIniciales={editor.destinos}
          products={products}
          branches={branches}
          costos={costos}
          onClose={() => setEditor(undefined)}
          onSaved={(guardada) => {
            setEditor(undefined);
            if (detalle) setDetalle(guardada);
            void cargar();
          }}
        />
      )}
      {confirmacion && (
        <OfertaAccionDialog
          oferta={confirmacion.oferta}
          accion={confirmacion.accion}
          onConfirm={() => realizar(confirmacion.oferta, confirmacion.accion)}
          onClose={() => setConfirmacion(undefined)}
        />
      )}
      {detalle && (
        <OfertaDetalle
          oferta={detalle}
          branches={branches}
          canManage={canManage}
          busy={busy}
          onClose={() => setDetalle(undefined)}
          onEdit={() => setEditor({ oferta: detalle })}
          onAction={(accion) => ejecutar(detalle, accion)}
        />
      )}
    </div>
  );
}

const ACCIONES_AUDITORIA: Record<string, string> = {
  OFFER_CREATED: "Alta",
  OFFER_UPDATED: "Edición",
  OFFER_PUBLISHED: "Publicada",
  OFFER_PAUSED: "Pausada",
  OFFER_RESUMED: "Reanudada",
  OFFER_FINISHED: "Finalizada",
  OFFER_ARCHIVED: "Archivada",
  OFFER_DUPLICATED: "Duplicada",
};

export function OfertaDetalle({
  oferta,
  branches,
  canManage,
  busy,
  onClose,
  onEdit,
  onAction,
}: {
  oferta: DetalleOferta;
  branches: { id: string; name: string }[];
  canManage: boolean;
  busy: boolean;
  onClose: () => void;
  onEdit: () => void;
  onAction: (accion: AccionOferta) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const destinos = agruparDestinosOferta(oferta.targets);
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  return (
    <dialog
      ref={dialog}
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      className="m-auto w-[min(960px,calc(100vw-2rem))] overflow-hidden rounded-3xl border border-slate-200 bg-white p-0 text-slate-800 shadow-2xl backdrop:bg-slate-950/40 backdrop:backdrop-blur-[2px]"
    >
      <div className="flex max-h-[92dvh] flex-col">
        <header className="flex shrink-0 items-start gap-3 bg-gradient-to-r from-teal-700 to-teal-600 px-6 py-5 text-white">
          <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-white/15">
            <BadgePercent size={22} />
          </span>
          <div className="min-w-0">
            <h2 id={titleId} className="truncate text-xl font-semibold">
              {oferta.name}
            </h2>
            <div className="mt-1.5 flex flex-wrap items-center gap-2 text-sm text-teal-50">
              <span className="rounded-md bg-white px-2 py-0.5 text-xs font-bold text-rose-700">
                {oferta.label}
              </span>
              <EstadoOfertaBadge estado={oferta.estado} />
              <span>
                {textoVigencia(oferta)} · versión {oferta.version}
              </span>
            </div>
          </div>
          <button
            type="button"
            aria-label="Cerrar ventana"
            onClick={onClose}
            className="ml-auto rounded-xl p-2 text-teal-50 hover:bg-white/15"
          >
            <X size={20} />
          </button>
        </header>
        <div className="min-h-0 space-y-5 overflow-y-auto bg-slate-50/70 p-6">
          <dl className="grid gap-3 sm:grid-cols-4">
            {[
              ["Ventas", String(oferta.stats.ventas)],
              ["Unidades", String(oferta.stats.unidades)],
              [
                "Descuento otorgado",
                pesos(BigInt(oferta.stats.descuentoMinor)),
              ],
              ["Facturación", pesos(BigInt(oferta.stats.facturacionMinor))],
            ].map(([titulo, valor]) => (
              <div
                key={titulo}
                className="rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_1px_2px_rgb(15_23_42_/_4%)]"
              >
                <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
                  {titulo}
                </dt>
                <dd className="mt-1 text-2xl font-semibold tabular-nums text-slate-900">
                  {valor}
                </dd>
              </div>
            ))}
          </dl>
          <section className="rounded-2xl border border-slate-200 bg-white p-4">
            <h3 className="mb-3 font-semibold text-slate-900">Se aplica a</h3>
            {oferta.allProducts && (
              <p className="mb-2 rounded-xl border border-teal-200 bg-teal-50 px-3 py-2.5 font-medium text-teal-900">
                Todos los productos
              </p>
            )}
            <ul className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 empty:hidden">
              {destinos.incluidos.map((destino) => (
                <li
                  key={`${destino.kind}:${destino.id}`}
                  className="flex items-center gap-3 px-3 py-2.5"
                >
                  {destino.quantity ? (
                    <span className="grid h-8 min-w-10 shrink-0 place-items-center rounded-lg bg-teal-50 px-2 text-sm font-bold tabular-nums text-teal-800">
                      {destino.quantity} ×
                    </span>
                  ) : (
                    <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-slate-100 text-slate-500">
                      <Package size={16} aria-hidden />
                    </span>
                  )}
                  <span className="min-w-0 flex-1 font-medium text-slate-900">
                    {destino.name}
                  </span>
                  {destino.kind !== "PRODUCT" && (
                    <span className="shrink-0 rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                      {TIPO_DESTINO_OFERTA[destino.kind]}
                    </span>
                  )}
                </li>
              ))}
            </ul>
            {destinos.excluidos.length > 0 && (
              <p className="mt-2 text-sm text-slate-600">
                <span className="font-medium">Excepto:</span>{" "}
                {destinos.excluidos
                  .map(
                    (destino) =>
                      `${destino.name}${destino.kind === "PRODUCT" ? "" : ` (${TIPO_DESTINO_OFERTA[destino.kind].toLowerCase()})`}`,
                  )
                  .join(", ")}
              </p>
            )}
            <p className="mt-3 text-sm text-slate-500">
              Sucursales:{" "}
              {oferta.allBranches
                ? "todas"
                : branches
                    .filter((branch) => oferta.branchIds.includes(branch.id))
                    .map((branch) => branch.name)
                    .join(", ")}
              {oferta.maxUnitsTotal
                ? ` · Stock de oferta: ${oferta.unitsUsed} de ${oferta.maxUnitsTotal}`
                : ""}
              {oferta.maxUnitsPerSale
                ? ` · Tope por venta: ${oferta.maxUnitsPerSale}`
                : ""}
              {oferta.combinable ? " · Combinable" : ""}
            </p>
          </section>
          <section className="rounded-2xl border border-slate-200 bg-white p-4">
            <h3 className="mb-2 font-semibold text-slate-900">
              Ventas con la oferta
            </h3>
            {oferta.ventas.length ? (
              <table className="w-full text-sm">
                <thead className="text-left text-xs uppercase text-slate-500">
                  <tr>
                    <th className="py-1">Venta</th>
                    <th>Fecha</th>
                    <th>Sucursal</th>
                    <th className="text-right">Unidades</th>
                    <th className="text-right">Descuento</th>
                    <th className="text-right">Total venta</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {oferta.ventas.map((venta) => (
                    <tr key={venta.saleId}>
                      <td className="py-1.5">
                        #{venta.number}
                        {venta.status === "CANCELLED" ? " (anulada)" : ""}
                      </td>
                      <td>
                        {venta.completedAt
                          ? new Date(venta.completedAt).toLocaleString(
                              "es-AR",
                              {
                                timeZone: "America/Argentina/Buenos_Aires",
                              },
                            )
                          : ""}
                      </td>
                      <td>{venta.branchName}</td>
                      <td className="text-right tabular-nums">{venta.units}</td>
                      <td className="text-right tabular-nums">
                        {pesos(BigInt(venta.discountMinor))}
                      </td>
                      <td className="text-right tabular-nums">
                        {pesos(BigInt(venta.totalMinor))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="text-sm text-slate-500">
                Todavía no se usó en ventas.
              </p>
            )}
          </section>
          <section className="rounded-2xl border border-slate-200 bg-white p-4">
            <h3 className="mb-2 font-semibold text-slate-900">
              Historial de cambios
            </h3>
            <ol className="space-y-1.5 text-sm">
              {oferta.historial.map((item) => (
                <li key={item.id} className="flex flex-wrap gap-x-2">
                  <span className="text-slate-500">
                    {new Date(item.createdAt).toLocaleString("es-AR", {
                      timeZone: "America/Argentina/Buenos_Aires",
                    })}
                  </span>
                  <span className="font-medium">
                    {ACCIONES_AUDITORIA[item.action] ?? item.action}
                  </span>
                  {item.actor && (
                    <span className="text-slate-600">por {item.actor}</span>
                  )}
                  {item.action === "OFFER_UPDATED" && (
                    <span className="text-slate-500">
                      ·{" "}
                      {describirCambiosOferta(item.before, item.after) ||
                        "sin cambios de datos"}
                    </span>
                  )}
                </li>
              ))}
            </ol>
          </section>
        </div>
        {canManage && (
          <footer className="flex shrink-0 flex-wrap justify-end gap-2 border-t border-slate-200 bg-white px-6 py-4">
            {accionesDe(oferta).map((accion) => {
              const Icono = ACCION[accion].icon;
              return (
                <button
                  key={accion}
                  type="button"
                  className={secondary}
                  disabled={busy}
                  onClick={() => onAction(accion)}
                >
                  <Icono size={15} /> {ACCION[accion].label}
                </button>
              );
            })}
            {oferta.status !== "FINISHED" && oferta.status !== "ARCHIVED" && (
              <button
                type="button"
                className={primary}
                disabled={busy}
                onClick={onEdit}
              >
                <Pencil size={15} /> Editar
              </button>
            )}
          </footer>
        )}
      </div>
    </dialog>
  );
}
