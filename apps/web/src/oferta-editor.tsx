import { useEffect, useId, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  BadgePercent,
  Check,
  Plus,
  ScanBarcode,
  Trash2,
  X,
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
  erroresPaso,
  formularioDesdeOferta,
  formularioVacio,
  TIPOS_OFERTA,
  vistaPrevia,
  type DestinoFormulario,
  type FormularioOferta,
} from "./lib/oferta-formulario";
import { pesos } from "./lib/ofertas-motor";
import { ProductFilterSelect } from "./product-filter-select";
import { SearchableSaleSelect } from "./searchable-sale-select";
import { field, primary, secondary } from "./supplier-payables/dialog";

const PASOS = [
  { id: "tipo", titulo: "Tipo" },
  { id: "productos", titulo: "Productos" },
  { id: "parametros", titulo: "Descuento" },
  { id: "vigencia", titulo: "Vigencia" },
  { id: "resumen", titulo: "Resumen" },
] as const;

type Paso = (typeof PASOS)[number]["id"];

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
        { ...destino, quantity: formulario.type === "BUNDLE" ? "1" : "" },
      ],
    });
  };
  const agregarProducto = (id: string, exclude = false) => {
    const producto = productosPorId.get(id);
    if (!producto) return;
    agregarDestino({
      kind: "PRODUCT",
      id,
      name: [producto.name, producto.presentation].filter(Boolean).join(" · "),
      exclude,
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
  const avanzar = () => {
    if (paso === "resumen") return;
    const problema = erroresPaso(formulario, paso);
    if (problema) return setError(problema);
    setPaso(PASOS[indice + 1]!.id);
  };
  const entrada = armarEntrada(formulario);
  const precios = new Map(
    formulario.destinos.map((destino) => [
      destino.id,
      Number(productosPorId.get(destino.id)?.prices[0]?.amountMinor ?? 0),
    ]),
  );
  const primerPrecio = formulario.destinos.find(
    (destino) => destino.kind === "PRODUCT" && precios.get(destino.id),
  );
  const ejemploMinor = primerPrecio
    ? precios.get(primerPrecio.id)!
    : Math.round(Number(precioEjemplo.replace(",", ".")) * 100) || 0;
  const previa =
    typeof entrada === "string"
      ? null
      : vistaPrevia(entrada, ejemploMinor, precios);
  // Aviso (no bloquea): la oferta deja algún producto debajo del costo.
  const debajoDelCosto =
    typeof entrada === "string" || !costos
      ? []
      : formulario.destinos.flatMap((destino) => {
          if (destino.kind !== "PRODUCT" || destino.exclude) return [];
          const costo = costos.get(destino.id);
          const precio = precios.get(destino.id);
          if (!costo || !precio) return [];
          const resultado =
            entrada.type === "BUNDLE" ? previa : vistaPrevia(entrada, precio);
          return resultado && resultado.unidadMinor < costo
            ? [{ nombre: destino.name, costo }]
            : [];
        });
  const guardar = async (publicar: boolean) => {
    if (typeof entrada === "string") return setError(entrada);
    const problema =
      erroresPaso(formulario, "tipo") ?? erroresPaso(formulario, "productos");
    if (problema) return setError(problema);
    setBusy(true);
    setError("");
    try {
      onSaved(
        oferta
          ? await editarOferta(token, organizationId, oferta.id, {
              ...entrada,
              expectedUpdatedAt: oferta.updatedAt,
            })
          : await crearOferta(token, organizationId, { ...entrada, publicar }),
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
  return (
    <dialog
      ref={dialog}
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onClose();
      }}
      className="m-auto w-[min(920px,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-slate-200 bg-white p-0 text-slate-800 shadow-xl backdrop:bg-slate-950/35"
    >
      <form
        className="flex max-h-[90dvh] flex-col"
        onSubmit={(event) => {
          event.preventDefault();
          if (paso === "resumen") void guardar(!oferta);
          else avanzar();
        }}
      >
        <header className="flex shrink-0 items-center gap-3 border-b border-slate-100 px-5 py-4">
          <span className="grid size-10 place-items-center rounded-xl bg-teal-50 text-teal-700">
            <BadgePercent size={21} />
          </span>
          <div>
            <h2 id={titleId} className="text-lg font-semibold">
              {oferta ? "Editar oferta" : "Nueva oferta"}
            </h2>
            <p className="mt-0.5 text-sm text-slate-500">
              Se aplica sola en Ventas mientras esté vigente.
            </p>
          </div>
          <button
            type="button"
            aria-label="Cerrar ventana"
            disabled={busy}
            onClick={onClose}
            className="ml-auto rounded-lg p-2 text-slate-400 hover:bg-slate-50"
          >
            <X size={19} />
          </button>
        </header>
        <nav
          aria-label="Pasos de la oferta"
          className="flex shrink-0 flex-wrap gap-2 border-b border-slate-100 px-5 py-3"
        >
          {PASOS.map((item, posicion) => (
            <button
              key={item.id}
              type="button"
              aria-current={item.id === paso ? "step" : undefined}
              disabled={busy || posicion > indice + 1}
              onClick={() => {
                if (posicion <= indice) return setPaso(item.id);
                avanzar();
              }}
              className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-sm ${item.id === paso ? "border-teal-600 bg-teal-50 font-semibold text-teal-800" : posicion < indice ? "border-teal-200 text-teal-700" : "border-slate-200 text-slate-500"}`}
            >
              <span className="grid size-5 place-items-center rounded-full bg-white text-xs">
                {posicion < indice ? <Check size={12} /> : posicion + 1}
              </span>
              {item.titulo}
            </button>
          ))}
        </nav>
        <div data-product-editor-body className="min-h-0 overflow-y-auto p-5">
          <fieldset disabled={busy} className="space-y-4">
            {paso === "tipo" && (
              <>
                <label className="block text-sm text-slate-500">
                  <span className="mb-1 block font-medium text-slate-700">
                    Nombre
                  </span>
                  <input
                    autoFocus
                    aria-label="Nombre de la oferta"
                    className={field}
                    value={formulario.name}
                    maxLength={120}
                    placeholder="Ej.: Martes 10% en protectores solares"
                    onChange={(event) => cambiar({ name: event.target.value })}
                  />
                </label>
                <div
                  role="radiogroup"
                  aria-label="Tipo de oferta"
                  className="grid gap-3 sm:grid-cols-2"
                >
                  {TIPOS_OFERTA.map((item) => (
                    <button
                      key={item.type}
                      type="button"
                      role="radio"
                      aria-checked={formulario.type === item.type}
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
                      className={`rounded-xl border p-3 text-left disabled:opacity-40 ${formulario.type === item.type ? "border-teal-500 bg-teal-50/60 ring-2 ring-teal-100" : "border-slate-200 hover:border-teal-300"}`}
                    >
                      <p className="font-semibold text-slate-800">
                        {item.titulo}
                      </p>
                      <p className="mt-1 text-sm text-slate-600">
                        {item.descripcion}
                      </p>
                      <p className="mt-1 text-xs text-teal-700">
                        Ej.: {item.ejemplo}
                      </p>
                    </button>
                  ))}
                </div>
              </>
            )}
            {paso === "productos" && (
              <>
                <p className="text-sm text-slate-600">
                  {combo
                    ? "Elegí los productos del combo y cuántas unidades lleva cada uno."
                    : "Elegí productos, categorías (incluye sus subcategorías) o laboratorios. Todo lo elegido cuenta junto: por ejemplo, un 2x1 en cualquier protector de una marca."}
                </p>
                <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_220px]">
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
                  <label className="flex items-center gap-2 rounded-lg border border-slate-200 px-3">
                    <ScanBarcode size={17} className="text-teal-600" />
                    <input
                      aria-label="Escanear código de barras"
                      className="h-10 w-full min-w-0 border-0 bg-transparent text-sm outline-none"
                      placeholder="Escaneá un código"
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
                {!combo && (
                  <div className="grid gap-3 md:grid-cols-2">
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
                )}
                <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
                  {formulario.destinos.length ? (
                    formulario.destinos.map((destino, posicion) => (
                      <li
                        key={`${destino.kind}:${destino.id}`}
                        className="flex flex-wrap items-center gap-3 px-3 py-2 text-sm"
                      >
                        <span className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                          {destino.kind === "PRODUCT"
                            ? "Producto"
                            : destino.kind === "CATEGORY"
                              ? "Categoría"
                              : "Laboratorio"}
                        </span>
                        <span
                          className={`min-w-0 flex-1 truncate ${destino.exclude ? "text-rose-700 line-through" : ""}`}
                        >
                          {destino.name}
                        </span>
                        {combo ? (
                          <label className="flex items-center gap-2 text-xs text-slate-500">
                            Unidades
                            <input
                              aria-label={`Unidades de ${destino.name}`}
                              inputMode="numeric"
                              className={`${field} w-20`}
                              value={destino.quantity}
                              onChange={(event) =>
                                cambiar({
                                  destinos: formulario.destinos.map(
                                    (item, otro) =>
                                      otro === posicion
                                        ? {
                                            ...item,
                                            quantity: event.target.value,
                                          }
                                        : item,
                                  ),
                                })
                              }
                            />
                          </label>
                        ) : (
                          destino.kind === "PRODUCT" && (
                            <label className="flex items-center gap-1.5 text-xs text-slate-600">
                              <input
                                type="checkbox"
                                checked={destino.exclude}
                                onChange={(event) =>
                                  cambiar({
                                    destinos: formulario.destinos.map(
                                      (item, otro) =>
                                        otro === posicion
                                          ? {
                                              ...item,
                                              exclude: event.target.checked,
                                            }
                                          : item,
                                    ),
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
                          className="rounded-md p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-700"
                        >
                          <Trash2 size={15} />
                        </button>
                      </li>
                    ))
                  ) : (
                    <li className="px-3 py-6 text-center text-sm text-slate-500">
                      Todavía no elegiste nada.
                    </li>
                  )}
                </ul>
                {!combo && (
                  <div className="text-sm text-slate-500">
                    <p className="mb-1">Tipo de producto</p>
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
                          productKind: value as FormularioOferta["productKind"],
                        })
                      }
                    />
                  </div>
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
              <section className="space-y-3">
                <div className="rounded-xl border border-teal-100 bg-teal-50/50 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-teal-700">
                    {tipo.titulo}
                    {previa ? ` · ${previa.etiqueta}` : ""}
                  </p>
                  <p className="mt-1 text-lg font-semibold">
                    {formulario.name || "Sin nombre"}
                  </p>
                  {previa ? (
                    <p className="mt-2 text-base text-teal-900">
                      {previa.texto}
                    </p>
                  ) : typeof entrada === "string" ? (
                    <p role="alert" className="mt-2 text-sm text-rose-700">
                      {entrada}
                    </p>
                  ) : null}
                  {!primerPrecio && !combo && (
                    <label className="mt-3 flex items-center gap-2 text-sm text-slate-600">
                      Precio de ejemplo $
                      <input
                        aria-label="Precio de ejemplo"
                        className={`${field} w-32`}
                        value={precioEjemplo}
                        onChange={(event) =>
                          setPrecioEjemplo(event.target.value)
                        }
                      />
                    </label>
                  )}
                </div>
                <dl className="grid gap-2 text-sm sm:grid-cols-2">
                  <div>
                    <dt className="text-slate-500">Se aplica a</dt>
                    <dd>
                      {formulario.destinos
                        .filter((destino) => !destino.exclude)
                        .map((destino) =>
                          combo
                            ? `${destino.quantity} × ${destino.name}`
                            : destino.name,
                        )
                        .join(", ")}
                      {formulario.destinos.some((destino) => destino.exclude)
                        ? ` (sin ${formulario.destinos
                            .filter((destino) => destino.exclude)
                            .map((destino) => destino.name)
                            .join(", ")})`
                        : ""}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">Sucursales</dt>
                    <dd>
                      {formulario.sucursales.length
                        ? branches
                            .filter((branch) =>
                              formulario.sucursales.includes(branch.id),
                            )
                            .map((branch) => branch.name)
                            .join(", ")
                        : "Todas"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">Días y horario</dt>
                    <dd>
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
                    </dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">Combinable</dt>
                    <dd>
                      {formulario.combinable
                        ? "Sí, se suma a otras combinables"
                        : "No: se aplica la de mayor ahorro"}
                    </dd>
                  </div>
                </dl>
                {debajoDelCosto.length > 0 && (
                  <p
                    role="status"
                    className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"
                  >
                    <AlertTriangle size={17} className="mt-0.5 shrink-0" />
                    Con la oferta quedan por debajo del costo de la última
                    recepción:{" "}
                    {debajoDelCosto
                      .map(
                        (item) =>
                          `${item.nombre} (costo ${pesos(BigInt(item.costo))})`,
                      )
                      .join(", ")}
                    . Podés guardarla igual.
                  </p>
                )}
              </section>
            )}
          </fieldset>
        </div>
        <footer className="flex shrink-0 flex-wrap items-center gap-2 border-t border-slate-100 px-5 py-3">
          {error && (
            <p role="alert" className="mr-auto text-sm text-rose-700">
              {error}
            </p>
          )}
          <button
            type="button"
            className={`${secondary} ml-auto`}
            disabled={busy || indice === 0}
            onClick={() => setPaso(PASOS[Math.max(indice - 1, 0)]!.id)}
          >
            Atrás
          </button>
          {paso !== "resumen" ? (
            <button className={primary} disabled={busy}>
              Siguiente
            </button>
          ) : oferta ? (
            <button className={primary} disabled={busy}>
              Guardar cambios
            </button>
          ) : (
            <>
              <button
                type="button"
                className={secondary}
                disabled={busy}
                onClick={() => void guardar(false)}
              >
                Guardar borrador
              </button>
              <button className={primary} disabled={busy}>
                Publicar
              </button>
            </>
          )}
        </footer>
      </form>
    </dialog>
  );
}

function ParametrosOferta({
  formulario,
  cambiar,
}: {
  formulario: FormularioOferta;
  cambiar: (parcial: Partial<FormularioOferta>) => void;
}) {
  const campo = (
    etiqueta: string,
    valor: string,
    alCambiar: (valor: string) => void,
    sufijo?: string,
    prefijo?: string,
  ) => (
    <label className="block text-sm text-slate-500">
      <span className="mb-1 block font-medium text-slate-700">{etiqueta}</span>
      <span className="flex items-center gap-2">
        {prefijo && <span className="text-slate-500">{prefijo}</span>}
        <input
          aria-label={etiqueta}
          inputMode="decimal"
          className={`${field} max-w-40`}
          value={valor}
          onChange={(event) => alCambiar(event.target.value)}
        />
        {sufijo && <span className="text-slate-500">{sufijo}</span>}
      </span>
    </label>
  );
  switch (formulario.type) {
    case "PERCENT":
      return campo(
        "Porcentaje de descuento",
        formulario.porcentaje,
        (porcentaje) => cambiar({ porcentaje }),
        "%",
      );
    case "AMOUNT_OFF":
      return campo(
        "Pesos menos por unidad",
        formulario.monto,
        (monto) => cambiar({ monto }),
        undefined,
        "$",
      );
    case "FIXED_PRICE":
      return campo(
        "Precio de oferta por unidad",
        formulario.precio,
        (precio) => cambiar({ precio }),
        undefined,
        "$",
      );
    case "BUY_X_PAY_Y":
      return (
        <div className="flex flex-wrap gap-4">
          {campo("Lleva", formulario.lleva, (lleva) => cambiar({ lleva }))}
          {campo("Paga", formulario.paga, (paga) => cambiar({ paga }))}
        </div>
      );
    case "NTH_UNIT_PERCENT":
      return (
        <div className="flex flex-wrap gap-4">
          {campo("Qué unidad (2 = la 2da)", formulario.unidad, (unidad) =>
            cambiar({ unidad }),
          )}
          {campo(
            "Descuento de esa unidad",
            formulario.porcentaje,
            (porcentaje) => cambiar({ porcentaje }),
            "%",
          )}
        </div>
      );
    case "TIERED":
      return (
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
                className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 p-3"
              >
                {campo("Desde (unidades)", escalon.desde, (desde) =>
                  actualizar({ desde }),
                )}
                <div className="text-sm text-slate-500">
                  <p className="mb-1 font-medium text-slate-700">
                    Descuento en
                  </p>
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
                {campo(
                  escalon.modo === "PORCENTAJE" ? "Porcentaje" : "Pesos",
                  escalon.valor,
                  (valor) => actualizar({ valor }),
                  escalon.modo === "PORCENTAJE" ? "%" : undefined,
                  escalon.modo === "MONTO" ? "$" : undefined,
                )}
                {formulario.escalones.length > 1 && (
                  <button
                    type="button"
                    aria-label="Quitar escalón"
                    className="mb-1 rounded-md p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-700"
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
      );
    case "BUNDLE":
      return (
        <div className="space-y-3">
          <div className="text-sm text-slate-500">
            <p className="mb-1 font-medium text-slate-700">El combo tiene</p>
            <ProductFilterSelect
              compact
              label="El combo tiene"
              icon={null}
              value={formulario.comboModo}
              options={[
                { value: "PRECIO", label: "Un precio total" },
                { value: "PORCENTAJE", label: "Un porcentaje de descuento" },
              ]}
              onChange={(comboModo) =>
                cambiar({
                  comboModo: comboModo as FormularioOferta["comboModo"],
                })
              }
            />
          </div>
          {formulario.comboModo === "PRECIO"
            ? campo(
                "Precio total del combo",
                formulario.precio,
                (precio) => cambiar({ precio }),
                undefined,
                "$",
              )
            : campo(
                "Porcentaje sobre el combo",
                formulario.porcentaje,
                (porcentaje) => cambiar({ porcentaje }),
                "%",
              )}
        </div>
      );
  }
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
  const alternar = (lista: string[], id: string) =>
    lista.includes(id) ? lista.filter((item) => item !== id) : [...lista, id];
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm text-slate-500">
          <span className="mb-1 block font-medium text-slate-700">Desde</span>
          <input
            type="datetime-local"
            aria-label="Desde"
            className={field}
            value={formulario.inicio}
            onChange={(event) => cambiar({ inicio: event.target.value })}
          />
        </label>
        <label className="block text-sm text-slate-500">
          <span className="mb-1 block font-medium text-slate-700">
            Hasta (vacío: hasta que la pauses)
          </span>
          <input
            type="datetime-local"
            aria-label="Hasta"
            className={field}
            value={formulario.fin}
            onChange={(event) => cambiar({ fin: event.target.value })}
          />
        </label>
      </div>
      <fieldset>
        <legend className="mb-1 text-sm font-medium text-slate-700">
          Días (ninguno: todos los días)
        </legend>
        <div className="flex flex-wrap gap-2">
          {DIAS_SEMANA.map(({ dia, corto, nombre }) => (
            <button
              key={dia}
              type="button"
              aria-pressed={formulario.dias.includes(dia)}
              aria-label={nombre}
              onClick={() =>
                cambiar({
                  dias: formulario.dias.includes(dia)
                    ? formulario.dias.filter((item) => item !== dia)
                    : [...formulario.dias, dia],
                })
              }
              className={`h-9 min-w-12 rounded-lg border px-2 text-sm ${formulario.dias.includes(dia) ? "border-teal-600 bg-teal-50 font-semibold text-teal-800" : "border-slate-200 text-slate-600"}`}
            >
              {corto}
            </button>
          ))}
        </div>
      </fieldset>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm text-slate-500">
          <span className="mb-1 block font-medium text-slate-700">
            Franja desde (opcional)
          </span>
          <input
            type="time"
            aria-label="Franja desde"
            className={field}
            value={formulario.horaDesde}
            onChange={(event) => cambiar({ horaDesde: event.target.value })}
          />
        </label>
        <label className="block text-sm text-slate-500">
          <span className="mb-1 block font-medium text-slate-700">
            Franja hasta
          </span>
          <input
            type="time"
            aria-label="Franja hasta"
            className={field}
            value={formulario.horaHasta}
            onChange={(event) => cambiar({ horaHasta: event.target.value })}
          />
        </label>
      </div>
      {branches.length > 1 && (
        <fieldset>
          <legend className="mb-1 text-sm font-medium text-slate-700">
            Sucursales (ninguna marcada: todas)
          </legend>
          <div className="flex flex-wrap gap-3">
            {branches.map((branch) => (
              <label
                key={branch.id}
                className="flex items-center gap-1.5 text-sm"
              >
                <input
                  type="checkbox"
                  checked={formulario.sucursales.includes(branch.id)}
                  onChange={() =>
                    cambiar({
                      sucursales: alternar(formulario.sucursales, branch.id),
                    })
                  }
                />
                {branch.name}
              </label>
            ))}
          </div>
        </fieldset>
      )}
      {listas.length > 1 && (
        <fieldset>
          <legend className="mb-1 text-sm font-medium text-slate-700">
            Listas de precios (ninguna marcada: todas)
          </legend>
          <div className="flex flex-wrap gap-3">
            {listas.map((lista) => (
              <label
                key={lista.id}
                className="flex items-center gap-1.5 text-sm"
              >
                <input
                  type="checkbox"
                  checked={formulario.listas.includes(lista.id)}
                  onChange={() =>
                    cambiar({ listas: alternar(formulario.listas, lista.id) })
                  }
                />
                {lista.name}
              </label>
            ))}
          </div>
        </fieldset>
      )}
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="block text-sm text-slate-500">
          <span className="mb-1 block font-medium text-slate-700">
            Tope por venta (unidades)
          </span>
          <input
            aria-label="Tope por venta"
            inputMode="numeric"
            className={field}
            value={formulario.topeVenta}
            onChange={(event) => cambiar({ topeVenta: event.target.value })}
          />
        </label>
        <label className="block text-sm text-slate-500">
          <span className="mb-1 block font-medium text-slate-700">
            Stock de oferta (unidades)
          </span>
          <input
            aria-label="Stock de oferta"
            inputMode="numeric"
            className={field}
            value={formulario.topeTotal}
            onChange={(event) => cambiar({ topeTotal: event.target.value })}
          />
        </label>
        <label className="block text-sm text-slate-500">
          <span className="mb-1 block font-medium text-slate-700">
            Prioridad
          </span>
          <input
            aria-label="Prioridad"
            inputMode="numeric"
            className={field}
            value={formulario.prioridad}
            onChange={(event) => cambiar({ prioridad: event.target.value })}
          />
        </label>
      </div>
      <label className="flex items-start gap-2 text-sm text-slate-700">
        <input
          type="checkbox"
          className="mt-1"
          checked={formulario.combinable}
          onChange={(event) => cambiar({ combinable: event.target.checked })}
        />
        <span>
          Combinable: se suma a otras ofertas combinables del mismo producto. Si
          no, el producto recibe sólo la de mayor ahorro.
        </span>
      </label>
    </div>
  );
}
