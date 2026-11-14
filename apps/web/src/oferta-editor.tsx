import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  AlertTriangle,
  BadgePercent,
  CalendarDays,
  Check,
  CircleDollarSign,
  Clock,
  Gift,
  Layers,
  ListOrdered,
  Package,
  Percent,
  Plus,
  ScanBarcode,
  SlidersHorizontal,
  Store,
  Tag,
  Trash2,
  Wallet,
  ShoppingBag,
  X,
  type LucideIcon,
} from "lucide-react";
import {
  getCatalogOptions,
  getPriceLists,
  type CatalogOptions,
  type CatalogProduct,
  type PriceList,
} from "./lib/api";
import {
  crearOferta,
  editarOferta,
  type DetalleOferta,
  type Oferta,
} from "./lib/ofertas-api";
import {
  armarEntrada,
  DIAS_SEMANA,
  MEDIOS_OFERTA,
  pesosAMinor,
  erroresPaso,
  formularioDesdeOferta,
  formularioVacio,
  textoVigencia,
  TIPOS_OFERTA,
  vistaPrevia,
  type DestinoFormulario,
  type FormularioOferta,
} from "./lib/oferta-formulario";
import { pesos, textoMedios, type TipoOferta } from "./lib/ofertas-motor";
import { PreciosOferta } from "./oferta-precios";
import { ProductFilterSelect } from "./product-filter-select";
import { SearchableSaleSelect } from "./searchable-sale-select";
import { primary, secondary } from "./supplier-payables/dialog";

const PASOS = [
  {
    id: "tipo",
    titulo: "Tipo",
    ayuda: "Poné un nombre y elegí cómo se descuenta.",
  },
  {
    id: "productos",
    titulo: "Productos",
    ayuda: "Elegí a qué productos, categorías o laboratorios se aplica.",
  },
  {
    id: "parametros",
    titulo: "Descuento",
    ayuda: "Indicá cuánto se descuenta. Al costado ves cómo queda cada precio.",
  },
  {
    id: "vigencia",
    titulo: "Vigencia",
    ayuda: "Cuándo, dónde y con qué límites se aplica.",
  },
  {
    id: "resumen",
    titulo: "Resumen",
    ayuda: "Revisá la oferta antes de guardarla.",
  },
] as const;

type Paso = (typeof PASOS)[number]["id"];

const ICONOS: Record<TipoOferta, LucideIcon> = {
  PERCENT: Percent,
  AMOUNT_OFF: CircleDollarSign,
  FIXED_PRICE: Tag,
  BUY_X_PAY_Y: Gift,
  NTH_UNIT_PERCENT: Layers,
  TIERED: ListOrdered,
  BUNDLE: Package,
  PAYMENT_METHOD: Wallet,
  SPEND_THRESHOLD: ShoppingBag,
};

const etiquetaCampo = "mb-1.5 block text-sm font-medium text-slate-700";

/**
 * Alta y edición de ofertas en pasos (SISTEMA-103). Valida para guiar; las
 * reglas las impone la API al guardar.
 */
export function OfertaEditor({
  token,
  organizationId,
  oferta,
  destinosIniciales = [],
  products,
  branches,
  costos,
  onClose,
  onSaved,
}: {
  token: string;
  organizationId: string;
  /** Con oferta se edita; sin oferta es un alta. */
  oferta?: Oferta;
  destinosIniciales?: DestinoFormulario[];
  products: CatalogProduct[];
  branches: { id: string; name: string }[];
  /** Costo de la última recepción por producto (sólo con permiso de costos). */
  costos?: Map<string, number>;
  onClose: () => void;
  onSaved: (oferta: DetalleOferta) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [formulario, setFormulario] = useState<FormularioOferta>(() =>
    oferta
      ? formularioDesdeOferta(oferta)
      : formularioVacio(new Date(), destinosIniciales),
  );
  const [paso, setPaso] = useState<Paso>("tipo");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [opciones, setOpciones] = useState<CatalogOptions>({
    categories: [],
    laboratories: [],
  });
  const [listas, setListas] = useState<PriceList[]>([]);
  const [codigo, setCodigo] = useState("");
  const [precioEjemplo, setPrecioEjemplo] = useState("10000");
  useEffect(() => {
    dialog.current?.showModal();
    void getCatalogOptions(token, organizationId)
      .then(setOpciones)
      .catch(() => {});
    void getPriceLists(token, organizationId)
      .then(setListas)
      .catch(() => {});
  }, [token, organizationId]);
  const cambiar = (parcial: Partial<FormularioOferta>) => {
    setFormulario((actual) => ({ ...actual, ...parcial }));
    setError("");
  };
  const productosPorId = useMemo(
    () => new Map(products.map((producto) => [producto.id, producto])),
    [products],
  );
  const opcionesProductos = useMemo(
    () =>
      products
        .filter((producto) => producto.active)
        .map((producto) => ({
          value: producto.id,
          label: [
            producto.name,
            producto.presentation,
            producto.prices[0]
              ? pesos(BigInt(producto.prices[0].amountMinor))
              : null,
            producto.barcodes[0]?.code,
          ]
            .filter(Boolean)
            .join(" · "),
        })),
    [products],
  );
  const agregarDestino = (destino: Omit<DestinoFormulario, "quantity">) => {
    if (!destino.id) return;
    if (
      formulario.destinos.some(
        (item) => item.kind === destino.kind && item.id === destino.id,
      )
    )
      return;
    cambiar({
      destinos: [
        ...formulario.destinos,
        {
          ...destino,
          // Con «Todos los productos», lo que se elige queda excluido.
          exclude: destino.exclude || (formulario.todos && !combo),
          quantity: formulario.type === "BUNDLE" ? "1" : "",
        },
      ],
    });
  };
  const agregarProducto = (id: string) => {
    const producto = productosPorId.get(id);
    if (!producto) return;
    agregarDestino({
      kind: "PRODUCT",
      id,
      name: [producto.name, producto.presentation].filter(Boolean).join(" · "),
      exclude: false,
    });
  };
  const escanear = () => {
    const leido = codigo.trim();
    if (!leido) return;
    const producto = products.find((item) =>
      item.barcodes.some((barcode) => barcode.code === leido),
    );
    if (!producto) setError("No se encontró un producto con ese código.");
    else agregarProducto(producto.id);
    setCodigo("");
  };
  const indice = PASOS.findIndex((item) => item.id === paso);
  const pasoActual = PASOS[indice]!;
  const avanzar = () => {
    if (paso === "resumen") return;
    const problema = erroresPaso(formulario, paso);
    if (problema) return setError(problema);
    setPaso(PASOS[indice + 1]!.id);
  };
  const resultado = armarEntrada(formulario);
  const entrada = typeof resultado === "string" ? null : resultado;
  const precios = new Map(
    formulario.destinos.map((destino) => [
      destino.id,
      Number(productosPorId.get(destino.id)?.prices[0]?.amountMinor ?? 0),
    ]),
  );
  const etiqueta = entrada
    ? (vistaPrevia(entrada, 1_000_000)?.etiqueta ??
      vistaPrevia(entrada, 0, precios)?.etiqueta)
    : undefined;
  // Aviso (no bloquea): la oferta deja algún producto debajo del costo.
  const debajoDelCosto =
    !entrada || !costos
      ? []
      : formulario.destinos.flatMap((destino) => {
          if (destino.kind !== "PRODUCT" || destino.exclude) return [];
          const costo = costos.get(destino.id);
          const precio = precios.get(destino.id);
          if (!costo || !precio) return [];
          const previa =
            entrada.type === "BUNDLE"
              ? vistaPrevia(entrada, 0, precios)
              : vistaPrevia(entrada, precio);
          return previa && previa.finalMinor / previa.cantidad < costo
            ? [{ nombre: destino.name, costo }]
            : [];
        });
  const guardar = async (publicar: boolean) => {
    if (typeof resultado === "string") return setError(resultado);
    const problema =
      erroresPaso(formulario, "tipo") ?? erroresPaso(formulario, "productos");
    if (problema) return setError(problema);
    setBusy(true);
    setError("");
    try {
      onSaved(
        oferta
          ? await editarOferta(token, organizationId, oferta.id, {
              ...resultado,
              expectedUpdatedAt: oferta.updatedAt,
            })
          : await crearOferta(token, organizationId, {
              ...resultado,
              publicar,
            }),
      );
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "No se pudo guardar la oferta.",
      );
    } finally {
      setBusy(false);
    }
  };
  const tipo = TIPOS_OFERTA.find((item) => item.type === formulario.type)!;
  const combo = formulario.type === "BUNDLE";
  // "Cómo queda" sólo cuando ya hay un descuento para mostrar.
  const conVistaPrevia = paso === "parametros" || paso === "resumen";
  return (
    <dialog
      ref={dialog}
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onClose();
      }}
      className="m-auto w-[min(1080px,calc(100vw-2rem))] overflow-hidden rounded-3xl border border-slate-200 bg-white p-0 text-slate-800 shadow-2xl backdrop:bg-velo/40 backdrop:backdrop-blur-[2px]"
    >
      <form
        className="flex max-h-[92dvh] flex-col"
        onSubmit={(event) => {
          event.preventDefault();
          if (paso === "resumen") void guardar(!oferta);
          else avanzar();
        }}
      >
        <header className="tema-claro shrink-0 bg-gradient-to-r from-teal-700 to-teal-600 px-6 pb-4 pt-5 text-white">
          <div className="flex items-start gap-3">
            <span className="grid size-11 place-items-center rounded-2xl bg-white/15">
              <BadgePercent size={22} />
            </span>
            <div className="min-w-0">
              <h2 id={titleId} className="text-xl font-semibold">
                {oferta ? "Editar oferta" : "Nueva oferta"}
              </h2>
              <p className="mt-0.5 truncate text-sm text-teal-50">
                {formulario.name.trim() ||
                  "Se aplica sola en Ventas mientras esté vigente."}
              </p>
            </div>
            <button
              type="button"
              aria-label="Cerrar ventana"
              disabled={busy}
              onClick={onClose}
              className="ml-auto rounded-xl p-2 text-teal-50 hover:bg-white/15"
            >
              <X size={20} />
            </button>
          </div>
          <nav
            aria-label="Pasos de la oferta"
            className="mt-4 grid grid-cols-5 gap-2"
          >
            {PASOS.map((item, posicion) => {
              const hecho = posicion < indice;
              const actual = item.id === paso;
              return (
                <button
                  key={item.id}
                  type="button"
                  aria-current={actual ? "step" : undefined}
                  disabled={busy || posicion > indice + 1}
                  onClick={() => {
                    if (posicion <= indice) return setPaso(item.id);
                    avanzar();
                  }}
                  className="min-w-0 text-left disabled:cursor-default"
                >
                  <span
                    className={`block h-1.5 rounded-full ${actual || hecho ? "bg-white" : "bg-white/25"}`}
                  />
                  <span
                    className={`mt-1.5 flex items-center gap-1.5 truncate text-xs ${actual ? "font-semibold text-white" : hecho ? "text-teal-50" : "text-teal-100/70"}`}
                  >
                    {hecho ? <Check size={12} /> : `${posicion + 1}.`}{" "}
                    {item.titulo}
                  </span>
                </button>
              );
            })}
          </nav>
        </header>
        <div
          data-product-editor-body
          className="min-h-0 flex-1 overflow-y-auto bg-slate-50/70"
        >
          <div className="px-6 pt-5">
            <h3 className="text-lg font-semibold text-slate-900">
              {pasoActual.titulo}
            </h3>
            <p className="text-sm text-slate-500">{pasoActual.ayuda}</p>
          </div>
          <div
            className={`grid items-start gap-5 px-6 pb-6 pt-4 ${conVistaPrevia ? "lg:grid-cols-[minmax(0,1fr)_340px]" : ""}`}
          >
            <fieldset disabled={busy} className="min-w-0 space-y-4">
              {paso === "tipo" && (
                <>
                  <Tarjeta>
                    <label
                      className={etiquetaCampo}
                      htmlFor={`${titleId}-nombre`}
                    >
                      Nombre de la oferta
                    </label>
                    <input
                      id={`${titleId}-nombre`}
                      autoFocus
                      aria-label="Nombre de la oferta"
                      className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-base outline-none focus:border-teal-500 focus:ring-4 focus:ring-teal-50"
                      value={formulario.name}
                      maxLength={120}
                      placeholder="Ej.: Martes 10% en protectores solares"
                      onChange={(event) =>
                        cambiar({ name: event.target.value })
                      }
                    />
                    <p className="mt-1.5 text-xs text-slate-500">
                      Lo ven la cajera y el cliente en el ticket.
                    </p>
                  </Tarjeta>
                  <div
                    role="radiogroup"
                    aria-label="Tipo de oferta"
                    className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
                  >
                    {TIPOS_OFERTA.map((item) => {
                      const Icono = ICONOS[item.type];
                      const elegido = formulario.type === item.type;
                      return (
                        <button
                          key={item.type}
                          type="button"
                          role="radio"
                          aria-checked={elegido}
                          // Una oferta ya usada en ventas no cambia de tipo.
                          disabled={
                            Boolean(oferta?.stats.ventas) &&
                            oferta?.type !== item.type
                          }
                          onClick={() =>
                            cambiar({
                              type: item.type,
                              destinos: formulario.destinos.map((destino) => ({
                                ...destino,
                                quantity:
                                  item.type === "BUNDLE"
                                    ? destino.quantity || "1"
                                    : "",
                              })),
                            })
                          }
                          className={`relative flex flex-col rounded-2xl border bg-white p-4 text-left transition disabled:opacity-40 ${elegido ? "border-teal-500 shadow-[0_0_0_4px_rgb(20_184_166_/_12%)]" : "border-slate-200 hover:border-teal-300 hover:shadow-sm"}`}
                        >
                          {elegido && (
                            <span className="absolute right-3 top-3 grid size-5 place-items-center rounded-full bg-teal-600 text-white">
                              <Check size={12} />
                            </span>
                          )}
                          <span
                            className={`grid size-9 place-items-center rounded-xl ${elegido ? "bg-teal-600 text-white" : "bg-teal-50 text-teal-700"}`}
                          >
                            <Icono size={18} />
                          </span>
                          <span className="mt-3 font-semibold text-slate-900">
                            {item.titulo}
                          </span>
                          <span className="mt-1 text-sm text-slate-600">
                            {item.descripcion}
                          </span>
                          <span className="mt-2 text-xs font-medium text-teal-700">
                            Ej.: {item.ejemplo}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </>
              )}
              {paso === "productos" && (
                <>
                  {!combo && (
                    <Tarjeta>
                      <label className="flex cursor-pointer items-start gap-3">
                        <input
                          type="checkbox"
                          role="switch"
                          className="peer sr-only"
                          checked={formulario.todos}
                          onChange={(event) =>
                            cambiar({
                              todos: event.target.checked,
                              // Lo ya elegido pasa a ser exclusión.
                              destinos: event.target.checked
                                ? formulario.destinos.map((destino) => ({
                                    ...destino,
                                    exclude: true,
                                  }))
                                : formulario.destinos,
                            })
                          }
                        />
                        <span
                          aria-hidden
                          className="relative mt-0.5 h-6 w-11 shrink-0 rounded-full bg-slate-300 transition after:absolute after:left-0.5 after:top-0.5 after:size-5 after:rounded-full after:bg-white after:shadow after:transition peer-checked:bg-teal-600 peer-checked:after:translate-x-5"
                        />
                        <span className="text-sm text-slate-700">
                          <span className="block font-semibold text-slate-900">
                            Todos los productos
                          </span>
                          La oferta vale para todo lo que vendés. Abajo podés
                          elegir productos, categorías o laboratorios para
                          dejarlos afuera.
                        </span>
                      </label>
                    </Tarjeta>
                  )}
                  <Tarjeta>
                    <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_240px]">
                      <div>
                        <p className={etiquetaCampo}>Producto</p>
                        <SearchableSaleSelect
                          label="Agregar producto"
                          compact
                          floatingOptions
                          maxResults={50}
                          placeholder="Buscá por nombre o código"
                          value=""
                          options={opcionesProductos}
                          onChange={(id) => agregarProducto(id)}
                        />
                      </div>
                      <div>
                        <p className={etiquetaCampo}>O escaneá</p>
                        <label className="flex h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 focus-within:border-teal-500 focus-within:ring-2 focus-within:ring-teal-50">
                          <ScanBarcode size={17} className="text-teal-600" />
                          <input
                            aria-label="Escanear código de barras"
                            className="h-full w-full min-w-0 border-0 bg-transparent text-sm outline-none"
                            placeholder="Código de barras"
                            value={codigo}
                            onChange={(event) => setCodigo(event.target.value)}
                            onKeyDown={(event) => {
                              if (event.key !== "Enter") return;
                              event.preventDefault();
                              escanear();
                            }}
                          />
                        </label>
                      </div>
                    </div>
                    {!combo && (
                      <div className="mt-3 grid gap-3 md:grid-cols-2">
                        <div>
                          <p className={etiquetaCampo}>
                            Categoría completa (con subcategorías)
                          </p>
                          <SearchableSaleSelect
                            label="Agregar categoría"
                            compact
                            floatingOptions
                            value=""
                            options={opciones.categories.map((item) => ({
                              value: item.id,
                              label: item.path ?? item.name,
                            }))}
                            onChange={(id) => {
                              const categoria = opciones.categories.find(
                                (item) => item.id === id,
                              );
                              if (categoria)
                                agregarDestino({
                                  kind: "CATEGORY",
                                  id,
                                  name: categoria.path ?? categoria.name,
                                  exclude: false,
                                });
                            }}
                          />
                        </div>
                        <div>
                          <p className={etiquetaCampo}>Laboratorio completo</p>
                          <SearchableSaleSelect
                            label="Agregar laboratorio"
                            compact
                            floatingOptions
                            value=""
                            options={opciones.laboratories.map((item) => ({
                              value: item.id,
                              label: item.name,
                            }))}
                            onChange={(id) => {
                              const laboratorio = opciones.laboratories.find(
                                (item) => item.id === id,
                              );
                              if (laboratorio)
                                agregarDestino({
                                  kind: "LABORATORY",
                                  id,
                                  name: laboratorio.name,
                                  exclude: false,
                                });
                            }}
                          />
                        </div>
                      </div>
                    )}
                    <p className="mt-3 text-xs text-slate-500">
                      {combo
                        ? "El combo se arma con productos puntuales; indicá cuántas unidades lleva cada uno."
                        : "Todo lo elegido cuenta junto: por ejemplo, un 2x1 en cualquier protector de una marca."}
                    </p>
                  </Tarjeta>
                  <Tarjeta
                    titulo={`${formulario.todos && !combo ? "Excluidos" : "Elegidos"} (${formulario.destinos.length})`}
                  >
                    {formulario.destinos.length ? (
                      <ul className="-mx-1 divide-y divide-slate-100">
                        {formulario.destinos.map((destino, posicion) => {
                          const precio = precios.get(destino.id);
                          const actualizar = (
                            parcial: Partial<DestinoFormulario>,
                          ) =>
                            cambiar({
                              destinos: formulario.destinos.map((item, otro) =>
                                otro === posicion
                                  ? { ...item, ...parcial }
                                  : item,
                              ),
                            });
                          return (
                            <li
                              key={`${destino.kind}:${destino.id}`}
                              className="flex flex-wrap items-center gap-3 px-1 py-2.5 text-sm"
                            >
                              <span
                                className={`rounded-md px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${destino.exclude ? "bg-rose-50 text-rose-700" : "bg-slate-100 text-slate-600"}`}
                              >
                                {destino.exclude
                                  ? "Excluido"
                                  : destino.kind === "PRODUCT"
                                    ? "Producto"
                                    : destino.kind === "CATEGORY"
                                      ? "Categoría"
                                      : "Laboratorio"}
                              </span>
                              <span
                                className={`min-w-0 flex-1 truncate ${destino.exclude ? "text-slate-400 line-through" : "font-medium"}`}
                              >
                                {destino.name}
                              </span>
                              {destino.kind === "PRODUCT" && precio ? (
                                <span className="text-xs text-slate-500 tabular-nums">
                                  {pesos(BigInt(precio))}
                                </span>
                              ) : null}
                              {combo ? (
                                <Numero
                                  etiqueta={`Unidades de ${destino.name}`}
                                  valor={destino.quantity}
                                  sufijo="u."
                                  ancho="w-24"
                                  alCambiar={(quantity) =>
                                    actualizar({ quantity })
                                  }
                                />
                              ) : (
                                destino.kind === "PRODUCT" && (
                                  <label className="flex items-center gap-1.5 text-xs text-slate-600">
                                    <input
                                      type="checkbox"
                                      className="accent-rose-600"
                                      checked={destino.exclude}
                                      onChange={(event) =>
                                        actualizar({
                                          exclude: event.target.checked,
                                        })
                                      }
                                    />
                                    Excluir
                                  </label>
                                )
                              )}
                              <button
                                type="button"
                                aria-label={`Quitar ${destino.name}`}
                                onClick={() =>
                                  cambiar({
                                    destinos: formulario.destinos.filter(
                                      (_, otro) => otro !== posicion,
                                    ),
                                  })
                                }
                                className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-700"
                              >
                                <Trash2 size={15} />
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    ) : (
                      <div className="grid place-items-center gap-1 py-6 text-center text-sm text-slate-500">
                        <Package size={26} className="text-slate-300" />
                        Todavía no elegiste nada.
                      </div>
                    )}
                  </Tarjeta>
                  {!combo && (
                    <Tarjeta>
                      <p className={etiquetaCampo}>Tipo de producto</p>
                      <ProductFilterSelect
                        compact
                        label="Tipo de producto"
                        icon={null}
                        value={formulario.productKind}
                        options={[
                          { value: "ALL", label: "Todos" },
                          { value: "MEDICATION", label: "Sólo medicamentos" },
                          {
                            value: "NON_MEDICATION",
                            label: "Sólo no medicamentos",
                          },
                        ]}
                        onChange={(value) =>
                          cambiar({
                            productKind:
                              value as FormularioOferta["productKind"],
                          })
                        }
                      />
                    </Tarjeta>
                  )}
                </>
              )}
              {paso === "parametros" && (
                <ParametrosOferta formulario={formulario} cambiar={cambiar} />
              )}
              {paso === "vigencia" && (
                <VigenciaOferta
                  formulario={formulario}
                  cambiar={cambiar}
                  branches={branches}
                  listas={listas}
                />
              )}
              {paso === "resumen" && (
                <Tarjeta>
                  <div className="flex flex-wrap items-start gap-3 border-b border-slate-100 pb-4">
                    <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-teal-50 text-teal-700">
                      {(() => {
                        const Icono = ICONOS[formulario.type];
                        return <Icono size={19} />;
                      })()}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xl font-semibold text-slate-900">
                        {formulario.name || "Sin nombre"}
                      </p>
                      <p className="text-sm text-slate-500">{tipo.titulo}</p>
                    </div>
                    {etiqueta && (
                      <span className="rounded-lg bg-rose-100 px-2.5 py-1 text-sm font-bold text-rose-700">
                        {etiqueta}
                      </span>
                    )}
                  </div>
                  {typeof resultado === "string" && (
                    <p
                      role="alert"
                      className="mt-3 rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700"
                    >
                      {resultado}
                    </p>
                  )}
                  <dl className="divide-y divide-slate-100 text-sm">
                    <Fila icono={Percent} titulo="Descuento">
                      {textoDescuento(formulario)}
                    </Fila>
                    <Fila icono={Package} titulo="Se aplica a">
                      {formulario.todos && !combo && <p>Todos los productos</p>}
                      <ul className="space-y-0.5">
                        {formulario.destinos
                          .filter((destino) => !destino.exclude)
                          .map((destino) => (
                            <li key={`${destino.kind}:${destino.id}`}>
                              {combo ? `${destino.quantity} × ` : ""}
                              {destino.name}
                              {destino.kind === "CATEGORY"
                                ? " (categoría)"
                                : destino.kind === "LABORATORY"
                                  ? " (laboratorio)"
                                  : ""}
                            </li>
                          ))}
                      </ul>
                      {formulario.destinos.some(
                        (destino) => destino.exclude,
                      ) && (
                        <p className="mt-1 text-slate-500">
                          Excepto:{" "}
                          {formulario.destinos
                            .filter((destino) => destino.exclude)
                            .map((destino) => destino.name)
                            .join(", ")}
                        </p>
                      )}
                    </Fila>
                    <Fila icono={CalendarDays} titulo="Vigencia">
                      {entrada
                        ? textoVigencia({
                            startsAt: entrada.startsAt,
                            endsAt: entrada.endsAt ?? null,
                            weekdays: null,
                            dayStartMinute: null,
                            dayEndMinute: null,
                          })
                        : "—"}
                      {formulario.fin ? "" : " · hasta que la pauses"}
                    </Fila>
                    <Fila icono={Clock} titulo="Días y horario">
                      {formulario.dias.length
                        ? DIAS_SEMANA.filter(({ dia }) =>
                            formulario.dias.includes(dia),
                          )
                            .map(({ nombre }) => nombre)
                            .join(", ")
                        : "Todos los días"}
                      {formulario.horaDesde
                        ? `, de ${formulario.horaDesde} a ${formulario.horaHasta}`
                        : ""}
                    </Fila>
                    <Fila icono={Store} titulo="Sucursales">
                      {formulario.sucursales.length
                        ? branches
                            .filter((branch) =>
                              formulario.sucursales.includes(branch.id),
                            )
                            .map((branch) => branch.name)
                            .join(", ")
                        : "Todas"}
                      {formulario.listas.length
                        ? ` · Listas: ${listas
                            .filter((lista) =>
                              formulario.listas.includes(lista.id),
                            )
                            .map((lista) => lista.name)
                            .join(", ")}`
                        : ""}
                    </Fila>
                    <Fila icono={SlidersHorizontal} titulo="Límites">
                      {[
                        formulario.topeVenta
                          ? `Hasta ${formulario.topeVenta} u. por venta`
                          : "Sin tope por venta",
                        formulario.topeTotal
                          ? `stock de oferta: ${formulario.topeTotal} u.`
                          : null,
                        formulario.combinable
                          ? "combinable"
                          : "no combinable (se aplica la de mayor ahorro)",
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </Fila>
                  </dl>
                  {debajoDelCosto.length > 0 && (
                    <p
                      role="status"
                      className="mt-4 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"
                    >
                      <AlertTriangle size={17} className="mt-0.5 shrink-0" />
                      <span>
                        Con la oferta quedan por debajo del costo de la última
                        recepción:{" "}
                        {debajoDelCosto
                          .map(
                            (item) =>
                              `${item.nombre} (costo ${pesos(BigInt(item.costo))})`,
                          )
                          .join(", ")}
                        . Podés guardarla igual.
                      </span>
                    </p>
                  )}
                </Tarjeta>
              )}
            </fieldset>
            {conVistaPrevia && (
              <aside className="lg:sticky lg:top-0 lg:self-start">
                <PreciosOferta
                  entrada={entrada}
                  error={typeof resultado === "string" ? resultado : undefined}
                  etiqueta={etiqueta}
                  destinos={formulario.destinos}
                  productosPorId={productosPorId}
                  costos={costos}
                  precioEjemplo={precioEjemplo}
                  onPrecioEjemplo={setPrecioEjemplo}
                />
              </aside>
            )}
          </div>
        </div>
        <footer className="flex shrink-0 flex-wrap items-center gap-2 border-t border-slate-200 bg-white px-6 py-4">
          {error ? (
            <p
              role="alert"
              className="mr-auto flex items-center gap-2 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700"
            >
              <AlertTriangle size={15} /> {error}
            </p>
          ) : (
            <p className="mr-auto text-xs text-slate-500">
              Paso {indice + 1} de {PASOS.length}
            </p>
          )}
          <button
            type="button"
            className={`${secondary} h-11! px-4`}
            disabled={busy || indice === 0}
            onClick={() => setPaso(PASOS[Math.max(indice - 1, 0)]!.id)}
          >
            Atrás
          </button>
          {paso !== "resumen" ? (
            <button className={`${primary} h-11! px-6`} disabled={busy}>
              Siguiente
            </button>
          ) : oferta ? (
            <button className={`${primary} h-11! px-6`} disabled={busy}>
              Guardar cambios
            </button>
          ) : (
            <>
              <button
                type="button"
                className={`${secondary} h-11! px-4`}
                disabled={busy}
                onClick={() => void guardar(false)}
              >
                Guardar borrador
              </button>
              <button className={`${primary} h-11! px-6`} disabled={busy}>
                Publicar
              </button>
            </>
          )}
        </footer>
      </form>
    </dialog>
  );
}

function Tarjeta({
  titulo,
  children,
}: {
  titulo?: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_1px_2px_rgb(15_23_42_/_4%)]">
      {titulo && (
        <h4 className="mb-2 text-sm font-semibold text-slate-800">{titulo}</h4>
      )}
      {children}
    </section>
  );
}

function Fila({
  icono: Icono,
  titulo,
  children,
}: {
  icono: LucideIcon;
  titulo: string;
  children: ReactNode;
}) {
  return (
    <div className="grid grid-cols-[150px_minmax(0,1fr)] gap-3 py-3">
      <dt className="flex items-center gap-2 self-start text-slate-500">
        <Icono size={16} className="shrink-0 text-teal-600" />
        {titulo}
      </dt>
      <dd className="text-slate-800">{children}</dd>
    </div>
  );
}

/** El descuento en palabras, para el resumen. */
function textoDescuento(formulario: FormularioOferta): string {
  const plata = (texto: string) => {
    const minor = pesosAMinor(texto);
    return minor === null ? "—" : pesos(BigInt(minor));
  };
  const pct = (texto: string) => `${texto.trim() || "—"}%`;
  switch (formulario.type) {
    case "PERCENT":
      return `${pct(formulario.porcentaje)} menos en cada unidad`;
    case "AMOUNT_OFF":
      return `${plata(formulario.monto)} menos en cada unidad`;
    case "FIXED_PRICE":
      return `Cada unidad a ${plata(formulario.precio)}`;
    case "BUY_X_PAY_Y":
      return `Llevando ${formulario.lleva} pagás ${formulario.paga} (regala la más barata)`;
    case "NTH_UNIT_PERCENT":
      return `La unidad ${formulario.unidad} con ${pct(formulario.porcentaje)} menos`;
    case "TIERED":
      return formulario.escalones
        .map(
          (escalon) =>
            `Desde ${escalon.desde}: ${escalon.modo === "PORCENTAJE" ? pct(escalon.valor) : plata(escalon.valor)} menos`,
        )
        .join(" · ");
    case "BUNDLE":
      return formulario.comboModo === "PRECIO"
        ? `Combo a ${plata(formulario.precio)} en total`
        : `Combo con ${pct(formulario.porcentaje)} menos`;
    case "SPEND_THRESHOLD":
      return `Comprando ${plata(formulario.minimo)} o más: ${formulario.montoModo === "PORCENTAJE" ? pct(formulario.porcentaje) : plata(formulario.monto)} menos, una vez por venta`;
    case "PAYMENT_METHOD":
      return `${pct(formulario.porcentaje)} menos pagando con ${textoMedios(formulario.medios) || "—"} (si pagan una parte con otro medio, sólo sobre esa parte)`;
  }
}

/** Campo numérico con prefijo ($) o sufijo (%) dentro del recuadro. */
function Numero({
  etiqueta,
  valor,
  alCambiar,
  prefijo,
  sufijo,
  ancho = "w-44",
  grande = false,
}: {
  etiqueta: string;
  valor: string;
  alCambiar: (valor: string) => void;
  prefijo?: string;
  sufijo?: string;
  ancho?: string;
  grande?: boolean;
}) {
  return (
    <label
      className={`flex items-center rounded-xl border border-slate-200 bg-white px-3 focus-within:border-teal-500 focus-within:ring-4 focus-within:ring-teal-50 ${grande ? "h-14" : "h-10"} ${ancho}`}
    >
      {prefijo && (
        <span className={`text-slate-400 ${grande ? "text-xl" : "text-sm"}`}>
          {prefijo}
        </span>
      )}
      <input
        aria-label={etiqueta}
        inputMode="decimal"
        className={`h-full w-full min-w-0 border-0 bg-transparent px-2 tabular-nums outline-none ${grande ? "text-2xl font-semibold" : "text-sm"}`}
        value={valor}
        onChange={(event) => alCambiar(event.target.value)}
      />
      {sufijo && (
        <span className={`text-slate-400 ${grande ? "text-xl" : "text-sm"}`}>
          {sufijo}
        </span>
      )}
    </label>
  );
}

function Rapidos({
  valores,
  actual,
  alElegir,
}: {
  valores: { valor: string; texto: string }[];
  actual: string;
  alElegir: (valor: string) => void;
}) {
  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {valores.map(({ valor, texto }) => (
        <button
          key={valor}
          type="button"
          aria-pressed={actual === valor}
          onClick={() => alElegir(valor)}
          className={`h-8 rounded-full border px-3 text-sm ${actual === valor ? "border-teal-600 bg-teal-600 font-semibold text-white" : "border-slate-200 bg-white text-slate-700 hover:border-teal-300 hover:bg-teal-50"}`}
        >
          {texto}
        </button>
      ))}
    </div>
  );
}

function Campo({
  etiqueta,
  ayuda,
  children,
}: {
  etiqueta: string;
  ayuda?: string;
  children: ReactNode;
}) {
  return (
    <div>
      <p className={etiquetaCampo}>{etiqueta}</p>
      {children}
      {ayuda && <p className="mt-1.5 text-xs text-slate-500">{ayuda}</p>}
    </div>
  );
}

function ParametrosOferta({
  formulario,
  cambiar,
}: {
  formulario: FormularioOferta;
  cambiar: (parcial: Partial<FormularioOferta>) => void;
}) {
  switch (formulario.type) {
    case "PAYMENT_METHOD":
      return (
        <Tarjeta>
          <Campo
            etiqueta="Porcentaje de descuento"
            ayuda="Sobre el precio de los productos de la oferta (después de otras ofertas combinables)."
          >
            <Numero
              grande
              etiqueta="Porcentaje de descuento"
              valor={formulario.porcentaje}
              sufijo="%"
              alCambiar={(porcentaje) => cambiar({ porcentaje })}
            />
          </Campo>
          <Rapidos
            actual={formulario.porcentaje}
            alElegir={(porcentaje) => cambiar({ porcentaje })}
            valores={["5", "10", "15", "20"].map((valor) => ({
              valor,
              texto: `${valor}%`,
            }))}
          />
          <div className="mt-4">
            <Campo
              etiqueta="Pagando con"
              ayuda="Si pagan una parte con otro medio, el descuento es sólo sobre la parte pagada con estos."
            >
              <Chips
                items={MEDIOS_OFERTA.map((medio) => ({
                  id: medio.value,
                  name: medio.label,
                }))}
                elegidos={formulario.medios}
                alCambiar={(elegidos) =>
                  cambiar({
                    medios: MEDIOS_OFERTA.map((medio) => medio.value).filter(
                      (medio) => elegidos.includes(medio),
                    ),
                  })
                }
              />
            </Campo>
          </div>
        </Tarjeta>
      );
    case "PERCENT":
      return (
        <Tarjeta>
          <Campo
            etiqueta="Porcentaje de descuento"
            ayuda="Sobre el precio de lista de cada producto."
          >
            <Numero
              grande
              etiqueta="Porcentaje de descuento"
              valor={formulario.porcentaje}
              sufijo="%"
              alCambiar={(porcentaje) => cambiar({ porcentaje })}
            />
          </Campo>
          <Rapidos
            actual={formulario.porcentaje}
            alElegir={(porcentaje) => cambiar({ porcentaje })}
            valores={["10", "15", "20", "25", "30", "50"].map((valor) => ({
              valor,
              texto: `${valor}%`,
            }))}
          />
        </Tarjeta>
      );
    case "SPEND_THRESHOLD":
      return (
        <Tarjeta>
          <Campo
            etiqueta="Desde un monto de compra de"
            ayuda="Se suma lo que entra en la oferta (ya con otras ofertas)."
          >
            <Numero
              grande
              etiqueta="Monto mínimo de compra"
              valor={formulario.minimo}
              prefijo="$"
              ancho="w-60"
              alCambiar={(minimo) => cambiar({ minimo })}
            />
          </Campo>
          <div
            role="radiogroup"
            aria-label="El descuento es"
            className="mt-4 inline-flex rounded-xl bg-slate-100 p-1"
          >
            {(
              [
                ["PORCENTAJE", "Un % de descuento"],
                ["MONTO", "Pesos de descuento"],
              ] as const
            ).map(([valor, texto]) => (
              <button
                key={valor}
                type="button"
                role="radio"
                aria-checked={formulario.montoModo === valor}
                onClick={() => cambiar({ montoModo: valor })}
                className={`h-9 rounded-lg px-4 text-sm ${formulario.montoModo === valor ? "bg-white font-semibold text-teal-800 shadow-sm" : "text-slate-600"}`}
              >
                {texto}
              </button>
            ))}
          </div>
          <div className="mt-4">
            {formulario.montoModo === "PORCENTAJE" ? (
              <Campo
                etiqueta="Porcentaje de descuento"
                ayuda="Sobre todo lo que entra en la oferta."
              >
                <Numero
                  grande
                  etiqueta="Porcentaje de descuento"
                  valor={formulario.porcentaje}
                  sufijo="%"
                  alCambiar={(porcentaje) => cambiar({ porcentaje })}
                />
              </Campo>
            ) : (
              <Campo
                etiqueta="Pesos de descuento"
                ayuda="Una vez por venta, repartido entre los productos."
              >
                <Numero
                  grande
                  etiqueta="Pesos de descuento"
                  valor={formulario.monto}
                  prefijo="$"
                  ancho="w-60"
                  alCambiar={(monto) => cambiar({ monto })}
                />
              </Campo>
            )}
          </div>
        </Tarjeta>
      );
    case "AMOUNT_OFF":
      return (
        <Tarjeta>
          <Campo
            etiqueta="Pesos menos por unidad"
            ayuda="Nunca deja un producto por debajo de $0."
          >
            <Numero
              grande
              etiqueta="Pesos menos por unidad"
              valor={formulario.monto}
              prefijo="$"
              ancho="w-56"
              alCambiar={(monto) => cambiar({ monto })}
            />
          </Campo>
        </Tarjeta>
      );
    case "FIXED_PRICE":
      return (
        <Tarjeta>
          <Campo
            etiqueta="Precio de oferta por unidad"
            ayuda="Si el precio de lista ya es menor, no se aplica."
          >
            <Numero
              grande
              etiqueta="Precio de oferta por unidad"
              valor={formulario.precio}
              prefijo="$"
              ancho="w-56"
              alCambiar={(precio) => cambiar({ precio })}
            />
          </Campo>
        </Tarjeta>
      );
    case "BUY_X_PAY_Y":
      return (
        <Tarjeta>
          <div className="flex flex-wrap items-end gap-4">
            <Campo etiqueta="Lleva">
              <Numero
                grande
                etiqueta="Lleva"
                valor={formulario.lleva}
                sufijo="u."
                ancho="w-32"
                alCambiar={(lleva) => cambiar({ lleva })}
              />
            </Campo>
            <span className="pb-4 text-2xl font-light text-slate-300">→</span>
            <Campo etiqueta="Paga">
              <Numero
                grande
                etiqueta="Paga"
                valor={formulario.paga}
                sufijo="u."
                ancho="w-32"
                alCambiar={(paga) => cambiar({ paga })}
              />
            </Campo>
          </div>
          <Rapidos
            actual={`${formulario.lleva}x${formulario.paga}`}
            alElegir={(valor) => {
              const [lleva = "2", paga = "1"] = valor.split("x");
              cambiar({ lleva, paga });
            }}
            valores={["2x1", "3x2", "4x3", "3x1"].map((valor) => ({
              valor,
              texto: valor,
            }))}
          />
          <p className="mt-3 text-xs text-slate-500">
            La unidad de regalo es la más barata de cada grupo.
          </p>
        </Tarjeta>
      );
    case "NTH_UNIT_PERCENT":
      return (
        <Tarjeta>
          <div className="flex flex-wrap items-end gap-4">
            <Campo
              etiqueta="Qué unidad"
              ayuda="2 = la segunda, 3 = la tercera."
            >
              <Numero
                grande
                etiqueta="Qué unidad (2 = la 2da)"
                valor={formulario.unidad}
                ancho="w-32"
                alCambiar={(unidad) => cambiar({ unidad })}
              />
            </Campo>
            <Campo etiqueta="Descuento de esa unidad">
              <Numero
                grande
                etiqueta="Descuento de esa unidad"
                valor={formulario.porcentaje}
                sufijo="%"
                alCambiar={(porcentaje) => cambiar({ porcentaje })}
              />
            </Campo>
          </div>
          <Rapidos
            actual={`${formulario.unidad}-${formulario.porcentaje}`}
            alElegir={(valor) => {
              const [unidad = "2", porcentaje = "50"] = valor.split("-");
              cambiar({ unidad, porcentaje });
            }}
            valores={[
              { valor: "2-50", texto: "2da al 50%" },
              { valor: "2-70", texto: "2da al 70%" },
              { valor: "2-100", texto: "2da gratis" },
              { valor: "3-50", texto: "3ra al 50%" },
            ]}
          />
        </Tarjeta>
      );
    case "TIERED":
      return (
        <Tarjeta titulo="Escalones">
          <div className="space-y-3">
            {formulario.escalones.map((escalon, posicion) => {
              const actualizar = (parcial: Partial<typeof escalon>) =>
                cambiar({
                  escalones: formulario.escalones.map((item, otro) =>
                    otro === posicion ? { ...item, ...parcial } : item,
                  ),
                });
              return (
                <div
                  key={posicion}
                  className="flex flex-wrap items-end gap-3 rounded-xl bg-slate-50 p-3"
                >
                  <Campo etiqueta="Desde">
                    <Numero
                      etiqueta="Desde (unidades)"
                      valor={escalon.desde}
                      sufijo="u."
                      ancho="w-28"
                      alCambiar={(desde) => actualizar({ desde })}
                    />
                  </Campo>
                  <div className="w-48">
                    <p className={etiquetaCampo}>Descuento en</p>
                    <ProductFilterSelect
                      compact
                      label="Descuento en"
                      icon={null}
                      value={escalon.modo}
                      options={[
                        { value: "PORCENTAJE", label: "Porcentaje" },
                        { value: "MONTO", label: "Pesos por unidad" },
                      ]}
                      onChange={(modo) =>
                        actualizar({ modo: modo as typeof escalon.modo })
                      }
                    />
                  </div>
                  <Campo etiqueta="Valor">
                    <Numero
                      etiqueta={
                        escalon.modo === "PORCENTAJE" ? "Porcentaje" : "Pesos"
                      }
                      valor={escalon.valor}
                      sufijo={escalon.modo === "PORCENTAJE" ? "%" : undefined}
                      prefijo={escalon.modo === "MONTO" ? "$" : undefined}
                      ancho="w-36"
                      alCambiar={(valor) => actualizar({ valor })}
                    />
                  </Campo>
                  {formulario.escalones.length > 1 && (
                    <button
                      type="button"
                      aria-label="Quitar escalón"
                      className="mb-1 rounded-lg p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-700"
                      onClick={() =>
                        cambiar({
                          escalones: formulario.escalones.filter(
                            (_, otro) => otro !== posicion,
                          ),
                        })
                      }
                    >
                      <Trash2 size={15} />
                    </button>
                  )}
                </div>
              );
            })}
            <button
              type="button"
              className={secondary}
              onClick={() =>
                cambiar({
                  escalones: [
                    ...formulario.escalones,
                    { desde: "", modo: "PORCENTAJE", valor: "" },
                  ],
                })
              }
            >
              <Plus size={15} /> Agregar escalón
            </button>
          </div>
        </Tarjeta>
      );
    case "BUNDLE":
      return (
        <Tarjeta>
          <div
            role="radiogroup"
            aria-label="El combo tiene"
            className="inline-flex rounded-xl bg-slate-100 p-1"
          >
            {(
              [
                ["PRECIO", "Un precio total"],
                ["PORCENTAJE", "Un % de descuento"],
              ] as const
            ).map(([valor, texto]) => (
              <button
                key={valor}
                type="button"
                role="radio"
                aria-checked={formulario.comboModo === valor}
                onClick={() => cambiar({ comboModo: valor })}
                className={`h-9 rounded-lg px-4 text-sm ${formulario.comboModo === valor ? "bg-white font-semibold text-teal-800 shadow-sm" : "text-slate-600"}`}
              >
                {texto}
              </button>
            ))}
          </div>
          <div className="mt-4">
            {formulario.comboModo === "PRECIO" ? (
              <Campo
                etiqueta="Precio total del combo"
                ayuda="Al costado ves el precio de lista de cada producto y cuánto queda el combo."
              >
                <Numero
                  grande
                  etiqueta="Precio total del combo"
                  valor={formulario.precio}
                  prefijo="$"
                  ancho="w-60"
                  alCambiar={(precio) => cambiar({ precio })}
                />
              </Campo>
            ) : (
              <Campo etiqueta="Porcentaje sobre el combo">
                <Numero
                  grande
                  etiqueta="Porcentaje sobre el combo"
                  valor={formulario.porcentaje}
                  sufijo="%"
                  alCambiar={(porcentaje) => cambiar({ porcentaje })}
                />
              </Campo>
            )}
          </div>
        </Tarjeta>
      );
  }
}

function Chips({
  items,
  elegidos,
  alCambiar,
}: {
  items: { id: string; name: string }[];
  elegidos: string[];
  alCambiar: (ids: string[]) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {items.map((item) => {
        const elegido = elegidos.includes(item.id);
        return (
          <button
            key={item.id}
            type="button"
            aria-pressed={elegido}
            onClick={() =>
              alCambiar(
                elegido
                  ? elegidos.filter((id) => id !== item.id)
                  : [...elegidos, item.id],
              )
            }
            className={`h-8 rounded-full border px-3 text-sm ${elegido ? "border-teal-600 bg-teal-50 font-semibold text-teal-800" : "border-slate-200 bg-white text-slate-600 hover:border-teal-300"}`}
          >
            {item.name}
          </button>
        );
      })}
    </div>
  );
}

function VigenciaOferta({
  formulario,
  cambiar,
  branches,
  listas,
}: {
  formulario: FormularioOferta;
  cambiar: (parcial: Partial<FormularioOferta>) => void;
  branches: { id: string; name: string }[];
  listas: PriceList[];
}) {
  const campoFecha =
    "h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-teal-500 focus:ring-4 focus:ring-teal-50";
  return (
    <div className="space-y-4">
      <Tarjeta titulo="Cuándo">
        <div className="grid gap-3 sm:grid-cols-2">
          <Campo etiqueta="Desde">
            <input
              type="datetime-local"
              aria-label="Desde"
              className={campoFecha}
              value={formulario.inicio}
              onChange={(event) => cambiar({ inicio: event.target.value })}
            />
          </Campo>
          <Campo
            etiqueta="Hasta"
            ayuda="Vacío: hasta que la pauses o finalices."
          >
            <input
              type="datetime-local"
              aria-label="Hasta"
              className={campoFecha}
              value={formulario.fin}
              onChange={(event) => cambiar({ fin: event.target.value })}
            />
          </Campo>
        </div>
      </Tarjeta>
      <Tarjeta titulo="Días y horario">
        <p className="mb-2 text-xs text-slate-500">
          Sin días marcados se aplica todos los días.
        </p>
        <div className="grid grid-cols-7 gap-1.5">
          {DIAS_SEMANA.map(({ dia, corto, nombre }) => {
            const elegido = formulario.dias.includes(dia);
            return (
              <button
                key={dia}
                type="button"
                aria-pressed={elegido}
                aria-label={nombre}
                onClick={() =>
                  cambiar({
                    dias: elegido
                      ? formulario.dias.filter((item) => item !== dia)
                      : [...formulario.dias, dia],
                  })
                }
                className={`h-10 rounded-xl border text-sm ${elegido ? "border-teal-600 bg-teal-600 font-semibold text-white" : "border-slate-200 bg-white text-slate-600 hover:border-teal-300"}`}
              >
                {corto}
              </button>
            );
          })}
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {(
            [
              ["horaDesde", "Franja desde (opcional)", "Franja desde"],
              ["horaHasta", "Franja hasta", "Franja hasta"],
            ] as const
          ).map(([clave, titulo, aria]) => (
            <Campo key={clave} etiqueta={titulo}>
              <span className="relative block">
                <Clock
                  size={15}
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                />
                <input
                  type="time"
                  aria-label={aria}
                  className={`${campoFecha} pl-9`}
                  value={formulario[clave]}
                  onChange={(event) => cambiar({ [clave]: event.target.value })}
                />
              </span>
            </Campo>
          ))}
        </div>
      </Tarjeta>
      {(branches.length > 1 || listas.length > 1) && (
        <Tarjeta titulo="Dónde">
          <div className="space-y-4">
            {branches.length > 1 && (
              <Campo
                etiqueta="Sucursales"
                ayuda="Sin ninguna marcada se aplica en todas."
              >
                <Chips
                  items={branches}
                  elegidos={formulario.sucursales}
                  alCambiar={(sucursales) => cambiar({ sucursales })}
                />
              </Campo>
            )}
            {listas.length > 1 && (
              <Campo
                etiqueta="Listas de precios"
                ayuda="Sin ninguna marcada se aplica con todas."
              >
                <Chips
                  items={listas}
                  elegidos={formulario.listas}
                  alCambiar={(elegidas) => cambiar({ listas: elegidas })}
                />
              </Campo>
            )}
          </div>
        </Tarjeta>
      )}
      <Tarjeta titulo="Límites">
        <div className="grid gap-3 sm:grid-cols-3">
          {formulario.type !== "PAYMENT_METHOD" &&
            formulario.type !== "SPEND_THRESHOLD" && (
              <>
                <Campo
                  etiqueta="Tope por venta"
                  ayuda="Unidades con descuento."
                >
                  <Numero
                    etiqueta="Tope por venta"
                    valor={formulario.topeVenta}
                    sufijo="u."
                    ancho="w-full"
                    alCambiar={(topeVenta) => cambiar({ topeVenta })}
                  />
                </Campo>
                <Campo
                  etiqueta="Stock de oferta"
                  ayuda="Total entre todas las ventas."
                >
                  <Numero
                    etiqueta="Stock de oferta"
                    valor={formulario.topeTotal}
                    sufijo="u."
                    ancho="w-full"
                    alCambiar={(topeTotal) => cambiar({ topeTotal })}
                  />
                </Campo>
              </>
            )}
          <Campo
            etiqueta="Prioridad"
            ayuda="Desempata ofertas con igual ahorro."
          >
            <Numero
              etiqueta="Prioridad"
              valor={formulario.prioridad}
              ancho="w-full"
              alCambiar={(prioridad) => cambiar({ prioridad })}
            />
          </Campo>
        </div>
        <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-xl bg-slate-50 p-3">
          <input
            type="checkbox"
            role="switch"
            className="peer sr-only"
            checked={formulario.combinable}
            onChange={(event) => cambiar({ combinable: event.target.checked })}
          />
          <span
            aria-hidden
            className="relative mt-0.5 h-6 w-11 shrink-0 rounded-full bg-slate-300 transition after:absolute after:left-0.5 after:top-0.5 after:size-5 after:rounded-full after:bg-white after:shadow after:transition peer-checked:bg-teal-600 peer-checked:after:translate-x-5"
          />
          <span className="text-sm text-slate-700">
            <span className="block font-medium">Combinable</span>
            Se suma a otras ofertas combinables del mismo producto. Si no, el
            producto recibe sólo la de mayor ahorro.
          </span>
        </label>
      </Tarjeta>
    </div>
  );
}
