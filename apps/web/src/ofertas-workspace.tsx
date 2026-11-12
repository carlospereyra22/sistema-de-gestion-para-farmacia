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
  Copy,
  Eye,
  FilterX,
  Layers,
  Pause,
  Pencil,
  Play,
  Plus,
  Search,
  Archive,
  Square,
  Send,
  X,
} from "lucide-react";
import type { CatalogProduct, StockLot } from "./lib/api";
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
import { pesos, type EstadoOferta, type TipoOferta } from "./lib/ofertas-motor";
import { OfertaEditor } from "./oferta-editor";
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
  { label: string; icon: typeof Pause; confirmar?: string }
> = {
  publicar: { label: "Publicar", icon: Send },
  pausar: { label: "Pausar", icon: Pause },
  reanudar: { label: "Reanudar", icon: Play },
  finalizar: {
    label: "Finalizar ya",
    icon: Square,
    confirmar: "La oferta deja de aplicarse ahora y no se puede reanudar.",
  },
  duplicar: { label: "Duplicar", icon: Copy },
  archivar: {
    label: "Archivar",
    icon: Archive,
    confirmar: "La oferta deja de aplicarse y sale del listado habitual.",
  },
};

/** Apartado Ofertas (SISTEMA-103): listado, alta, edición, acciones y detalle. */
export function OfertasWorkspace({
  token,
  organizationId,
  branches,
  products,
  stock,
  canManage,
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
  const [busy, setBusy] = useState(false);
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
  }, [cargar, filtros.q]);
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
  const ejecutar = async (oferta: Oferta, accion: AccionOferta) => {
    const confirmar = ACCION[accion].confirmar;
    if (confirmar && !window.confirm(`${ACCION[accion].label}: ${confirmar}`))
      return;
    setBusy(true);
    try {
      const resultado = await accionOferta(
        token,
        organizationId,
        oferta.id,
        accion,
      );
      // La copia queda en borrador y se abre para editarla.
      if (accion === "duplicar") {
        setDetalle(undefined);
        setEditor({ oferta: resultado });
      } else if (detalle) setDetalle(resultado);
      await cargar();
    } catch (cause) {
      onError(
        cause instanceof Error
          ? cause.message
          : "No se pudo completar la acción.",
      );
    } finally {
      setBusy(false);
    }
  };
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
                  <span className="ml-2 rounded-md bg-rose-50 px-1.5 py-0.5 text-xs font-bold text-rose-700">
                    {oferta.label}
                  </span>
                </td>
                <td className="px-3 py-2.5 text-slate-600">
                  {
                    TIPOS_OFERTA.find((tipo) => tipo.type === oferta.type)
                      ?.titulo
                  }
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
                    <IconoAccion
                      label={`Ver ${oferta.name}`}
                      icon={Eye}
                      onClick={() => void abrirDetalle(oferta)}
                    />
                    {canManage &&
                      oferta.status !== "FINISHED" &&
                      oferta.status !== "ARCHIVED" && (
                        <IconoAccion
                          label={`Editar ${oferta.name}`}
                          icon={Pencil}
                          disabled={busy}
                          onClick={() => setEditor({ oferta })}
                        />
                      )}
                    {canManage &&
                      accionesDe(oferta).map((accion) => (
                        <IconoAccion
                          key={accion}
                          label={`${ACCION[accion].label} ${oferta.name}`}
                          icon={ACCION[accion].icon}
                          disabled={busy}
                          onClick={() => void ejecutar(oferta, accion)}
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
      {detalle && (
        <OfertaDetalle
          oferta={detalle}
          branches={branches}
          canManage={canManage}
          busy={busy}
          onClose={() => setDetalle(undefined)}
          onEdit={() => setEditor({ oferta: detalle })}
          onAction={(accion) => void ejecutar(detalle, accion)}
        />
      )}
    </div>
  );
}

function IconoAccion({
  label,
  icon: Icono,
  onClick,
  disabled,
}: {
  label: string;
  icon: typeof Pause;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className="rounded-md p-1.5 text-slate-500 hover:bg-teal-50 hover:text-teal-700 disabled:opacity-40"
    >
      <Icono size={16} />
    </button>
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

/** Qué campos cambió una edición, para el historial. */
function cambiosDe(antes: unknown, despues: unknown): string {
  if (
    !antes ||
    !despues ||
    typeof antes !== "object" ||
    typeof despues !== "object"
  )
    return "";
  const a = antes as Record<string, unknown>;
  const b = despues as Record<string, unknown>;
  return Object.keys(b)
    .filter(
      (clave) =>
        clave !== "version" &&
        JSON.stringify(a[clave]) !== JSON.stringify(b[clave]),
    )
    .join(", ");
}

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
      className="m-auto w-[min(920px,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-slate-200 bg-white p-0 text-slate-800 shadow-xl backdrop:bg-slate-950/35"
    >
      <div className="flex max-h-[90dvh] flex-col">
        <header className="flex shrink-0 items-center gap-3 border-b border-slate-100 px-5 py-4">
          <span className="grid size-10 place-items-center rounded-xl bg-rose-50 text-sm font-bold text-rose-700">
            <BadgePercent size={21} />
          </span>
          <div className="min-w-0">
            <h2 id={titleId} className="truncate text-lg font-semibold">
              {oferta.name}{" "}
              <span className="ml-1 rounded-md bg-rose-50 px-1.5 py-0.5 text-sm font-bold text-rose-700">
                {oferta.label}
              </span>
            </h2>
            <p className="mt-0.5 text-sm text-slate-500">
              {textoVigencia(oferta)} · versión {oferta.version}
            </p>
          </div>
          <EstadoOfertaBadge estado={oferta.estado} />
          <button
            type="button"
            aria-label="Cerrar ventana"
            onClick={onClose}
            className="ml-auto rounded-lg p-2 text-slate-400 hover:bg-slate-50"
          >
            <X size={19} />
          </button>
        </header>
        <div className="min-h-0 space-y-5 overflow-y-auto p-5">
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
                className="rounded-xl border border-slate-200 p-3"
              >
                <dt className="text-xs text-slate-500">{titulo}</dt>
                <dd className="text-lg font-semibold tabular-nums">{valor}</dd>
              </div>
            ))}
          </dl>
          <section>
            <h3 className="mb-2 font-semibold">Se aplica a</h3>
            <p className="text-sm text-slate-700">
              {oferta.targets
                .filter((target) => !target.exclude)
                .map((target) =>
                  target.quantity
                    ? `${target.quantity} × ${target.name}`
                    : target.name,
                )
                .join(", ")}
              {oferta.targets.some((target) => target.exclude) &&
                ` · Excepto: ${oferta.targets
                  .filter((target) => target.exclude)
                  .map((target) => target.name)
                  .join(", ")}`}
            </p>
            <p className="mt-1 text-sm text-slate-500">
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
          <section>
            <h3 className="mb-2 font-semibold">Ventas con la oferta</h3>
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
          <section>
            <h3 className="mb-2 font-semibold">Historial de cambios</h3>
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
                      (
                      {cambiosDe(item.before, item.after) ||
                        "sin cambios de datos"}
                      )
                    </span>
                  )}
                </li>
              ))}
            </ol>
          </section>
        </div>
        {canManage && (
          <footer className="flex shrink-0 flex-wrap justify-end gap-2 border-t border-slate-100 px-5 py-3">
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
