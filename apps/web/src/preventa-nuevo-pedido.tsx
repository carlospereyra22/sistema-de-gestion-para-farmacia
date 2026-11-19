import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  BadgePercent,
  CalendarDays,
  Check,
  ChevronRight,
  CloudOff,
  Minus,
  PackageSearch,
  Plus,
  Search,
  ShoppingBag,
  Sparkles,
  Store,
  Trash2,
  UserPlus,
} from "lucide-react";

import { SinConexionError } from "./lib/api-fetch";
import {
  preventaApi,
  type ClientePreventa,
  type ContextoPreventa,
  type Cotizacion,
  type OfertaDeProducto,
  type PedidoPreventa,
  type ProductoPreventa,
} from "./lib/preventa-api";
import { agregarABandeja } from "./lib/preventa-bandeja";
import {
  borradorVacio,
  borrarBorrador,
  clienteCoincide,
  guardarBorrador,
  guardarClienteActual,
  leerBorrador,
  leerClienteActual,
  type Borrador,
  type ClienteBorrador,
  type RenglonBorrador,
} from "./lib/preventa-borrador";
import { diasDeVisita, mensajeDe, pesos, pesosACentavos } from "./lib/preventa";
import { ProductThumbnail } from "./product-image";
import { PreventaClienteEditor } from "./preventa-clientes";
import {
  Aviso,
  Hoja,
  Pastilla,
  Segmento,
  Vacio,
  botonPrimario,
  botonSecundario,
  campo,
} from "./preventa-ui";

type Renglon = RenglonBorrador;

function borradorDeEdicion(pedido: PedidoPreventa): Borrador {
  return {
    renglones: pedido.items.map((i) => ({
      productId: i.productId,
      quantity: i.quantity,
      ...(i.unitPriceMinor !== i.listUnitPriceMinor
        ? { unitPriceMinor: i.unitPriceMinor }
        : {}),
    })),
    notas: pedido.notes ?? "",
    productos: Object.fromEntries(
      pedido.items.map((i) => [
        i.productId,
        {
          id: i.productId,
          name: i.productName,
          brand: null,
          presentation: null,
          hasImage: false,
          imageVersion: null,
          priceMinor: i.listUnitPriceMinor,
          stock: null,
          inStock: true,
          ofertas: [],
        },
      ]),
    ),
    actualizado: 0,
  };
}

/**
 * Armar un pedido (SISTEMA-108): cliente, productos con sus ofertas y
 * resumen. Como en la app de preventistas anterior, cada cliente tiene su
 * propio pedido sin enviar guardado en el teléfono: cambiar de cliente no
 * arrastra productos y, al volver a uno con un pedido a medio armar, se
 * ofrece retomarlo. Los precios y el total los calcula la API (cotizar); sin
 * señal se muestra un total estimado y el pedido espera en la bandeja.
 */
export function PreventaNuevoPedido({
  token,
  organizationId,
  contexto,
  editando,
  clienteInicial,
  onListo,
  onCancelarEdicion,
}: {
  token: string;
  organizationId: string;
  contexto: ContextoPreventa;
  editando?: PedidoPreventa | null;
  clienteInicial?: ClientePreventa | null;
  onListo: (pedido: PedidoPreventa | null, mensaje: string) => void;
  onCancelarEdicion?: () => void;
}) {
  const usuarioId = contexto.usuario.id;
  const [cliente, setCliente] = useState<ClienteBorrador | null>(() =>
    editando
      ? {
          id: editando.customerId,
          name: editando.customerName,
          address: editando.deliveryAddress,
        }
      : clienteInicial
        ? null
        : leerClienteActual(organizationId, usuarioId),
  );
  const [borrador, setBorrador] = useState<Borrador>(() => {
    if (editando) return borradorDeEdicion(editando);
    const actual = clienteInicial
      ? null
      : leerClienteActual(organizationId, usuarioId);
    return (
      (actual && leerBorrador(organizationId, usuarioId, actual.id)) ??
      borradorVacio()
    );
  });
  // Mientras se decide si retomar un pedido guardado, no se pisa nada.
  const [retomar, setRetomar] = useState<{
    cliente: ClienteBorrador;
    guardado: Borrador;
  } | null>(null);
  const [paso, setPaso] = useState<"cliente" | "productos" | "resumen">(
    cliente ? "productos" : "cliente",
  );

  const elegirCliente = useCallback(
    (elegido: ClienteBorrador) => {
      const guardado = leerBorrador(organizationId, usuarioId, elegido.id);
      setCliente(elegido);
      setBorrador(borradorVacio());
      setRetomar(guardado ? { cliente: elegido, guardado } : null);
      setPaso("productos");
    },
    [organizationId, usuarioId],
  );

  // Desde Clientes → "Pedido": arranca con ese cliente.
  const inicial = useRef(clienteInicial);
  useEffect(() => {
    const c = inicial.current;
    if (c && !editando)
      elegirCliente({ id: c.id, name: c.name, address: c.address });
  }, [elegirCliente, editando]);

  // Cada cambio queda guardado para ese cliente (salvo al editar un pedido).
  useEffect(() => {
    if (editando || retomar) return;
    guardarClienteActual(organizationId, usuarioId, cliente);
    if (cliente)
      guardarBorrador(organizationId, usuarioId, cliente.id, borrador);
  }, [borrador, cliente, editando, retomar, organizationId, usuarioId]);

  const cambiarCantidad = useCallback(
    (producto: ProductoPreventa, cantidad: number) =>
      setBorrador((b) => {
        const productos = { ...b.productos, [producto.id]: producto };
        const sin = b.renglones.filter((r) => r.productId !== producto.id);
        if (!Number.isFinite(cantidad) || cantidad <= 0)
          return { ...b, productos, renglones: sin };
        const previo = b.renglones.find((r) => r.productId === producto.id);
        const renglon = {
          ...previo,
          productId: producto.id,
          quantity: Math.min(Math.floor(cantidad), 9999),
        };
        return {
          ...b,
          productos,
          renglones: previo
            ? b.renglones.map((r) =>
                r.productId === producto.id ? renglon : r,
              )
            : [...b.renglones, renglon],
        };
      }),
    [],
  );

  const cotizacion = useCotizacion(
    token,
    organizationId,
    cliente?.id,
    borrador.renglones,
  );

  const unidades = borrador.renglones.reduce((s, r) => s + r.quantity, 0);
  const estimado = borrador.renglones.reduce((s, r) => {
    const precio =
      r.unitPriceMinor ?? borrador.productos[r.productId]?.priceMinor ?? "0";
    return s + Number(precio) * r.quantity;
  }, 0);
  const total = cotizacion.datos?.totalMinor ?? String(estimado);

  if (paso === "cliente" || !cliente)
    return (
      <ElegirCliente
        token={token}
        organizationId={organizationId}
        contexto={contexto}
        onElegir={(c) =>
          elegirCliente({ id: c.id, name: c.name, address: c.address })
        }
      />
    );

  const terminar = (pedido: PedidoPreventa | null, mensaje: string) => {
    borrarBorrador(organizationId, usuarioId, cliente.id);
    guardarClienteActual(organizationId, usuarioId, null);
    setBorrador(borradorVacio());
    onListo(pedido, mensaje);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {retomar ? (
        <Hoja
          titulo="Retomar pedido"
          onClose={() => {
            setBorrador(retomar.guardado);
            setRetomar(null);
          }}
          pie={
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                className={botonSecundario}
                onClick={() => {
                  borrarBorrador(organizationId, usuarioId, retomar.cliente.id);
                  setBorrador(borradorVacio());
                  setRetomar(null);
                }}
              >
                Empezar de nuevo
              </button>
              <button
                type="button"
                className={botonPrimario}
                onClick={() => {
                  setBorrador(retomar.guardado);
                  setRetomar(null);
                }}
              >
                Continuar
              </button>
            </div>
          }
        >
          <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
            Pedido sin enviar
          </p>
          <div className="mt-2 rounded-xl border border-slate-200 p-3">
            <p className="text-[11px] font-bold uppercase text-slate-500">
              Cliente
            </p>
            <p className="text-base font-bold text-teal-800">
              {retomar.cliente.name}
            </p>
            <p className="text-sm text-slate-600">
              {retomar.guardado.renglones.length} producto
              {retomar.guardado.renglones.length === 1 ? "" : "s"} ·{" "}
              {retomar.guardado.renglones.reduce((s, r) => s + r.quantity, 0)}{" "}
              u.
            </p>
          </div>
          <p className="mt-3 text-sm text-slate-600">
            Guardamos los productos y precios cargados. ¿Querés continuar con el
            carrito armado?
          </p>
        </Hoja>
      ) : null}
      <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-teal-50 text-teal-700">
          <Store size={20} aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-xs text-slate-500">
            {editando ? `Editando pedido de` : "Pedido para"}
          </p>
          <p className="truncate text-sm font-bold text-slate-900">
            {cliente.name}
          </p>
          {cliente.address ? (
            <p className="truncate text-xs text-slate-500">{cliente.address}</p>
          ) : null}
        </div>
        {editando ? (
          <button
            type="button"
            className={botonSecundario}
            onClick={onCancelarEdicion}
          >
            Volver
          </button>
        ) : (
          <button
            type="button"
            className="text-sm font-semibold text-teal-700 hover:underline"
            onClick={() => setPaso("cliente")}
          >
            Cambiar
          </button>
        )}
      </div>

      {paso === "productos" ? (
        <ElegirProductos
          token={token}
          organizationId={organizationId}
          contexto={contexto}
          clienteId={cliente.id}
          renglones={borrador.renglones}
          onCantidad={cambiarCantidad}
        />
      ) : (
        <Resumen
          contexto={contexto}
          borrador={borrador}
          cotizacion={cotizacion}
          onVolver={() => setPaso("productos")}
          onCantidad={(id, cantidad) => {
            const producto = borrador.productos[id];
            if (producto) cambiarCantidad(producto, cantidad);
          }}
          onPrecio={(id, unitPriceMinor) =>
            setBorrador((b) => ({
              ...b,
              renglones: b.renglones.map((r) =>
                r.productId === id ? { ...r, unitPriceMinor } : r,
              ),
            }))
          }
          onNotas={(notas) => setBorrador((b) => ({ ...b, notas }))}
          onConfirmar={async (requestId) => {
            const items = borrador.renglones.map((r) => ({
              productId: r.productId,
              quantity: r.quantity,
              ...(r.unitPriceMinor ? { unitPriceMinor: r.unitPriceMinor } : {}),
            }));
            try {
              if (editando) {
                const pedido = await preventaApi.editarPedido(
                  token,
                  organizationId,
                  editando.id,
                  {
                    expectedUpdatedAt: editando.updatedAt,
                    items,
                    notes: borrador.notas || null,
                  },
                );
                onListo(pedido, "Pedido actualizado.");
                return;
              }
              const pedido = await preventaApi.crearPedido(
                token,
                organizationId,
                {
                  requestId,
                  customerId: cliente.id,
                  items,
                  notes: borrador.notas || null,
                },
              );
              terminar(pedido, `Pedido de ${cliente.name} enviado.`);
            } catch (causa) {
              if (causa instanceof SinConexionError && !editando) {
                agregarABandeja(usuarioId, organizationId, {
                  requestId,
                  customerId: cliente.id,
                  customerName: cliente.name,
                  items: items.map((i) => ({
                    ...i,
                    productName:
                      borrador.productos[i.productId]?.name ?? "Producto",
                  })),
                  notes: borrador.notas || null,
                  totalEstimadoMinor: total,
                  tomadoEl: new Date().toISOString(),
                });
                terminar(
                  null,
                  "Sin señal: el pedido quedó guardado en el teléfono y se manda solo cuando vuelva la conexión.",
                );
                return;
              }
              throw causa;
            }
          }}
        />
      )}

      {paso === "productos" && unidades > 0 ? (
        <div className="sticky bottom-[calc(var(--preventa-pie,0px)+0.5rem)] z-10 -mx-1 mt-3">
          <button
            type="button"
            onClick={() => setPaso("resumen")}
            className="flex min-h-14 w-full items-center justify-between gap-3 rounded-2xl bg-teal-700 px-4 text-white shadow-lg hover:bg-teal-800"
          >
            <span className="flex items-center gap-2 text-sm font-semibold">
              <ShoppingBag size={18} aria-hidden />
              {borrador.renglones.length} producto
              {borrador.renglones.length === 1 ? "" : "s"} · {unidades} u.
            </span>
            <span className="flex items-center gap-1 text-base font-bold tabular-nums">
              {pesos(total)}
              <ChevronRight size={18} aria-hidden />
            </span>
          </button>
        </div>
      ) : null}
    </div>
  );
}

/** Cotiza el pedido en el servidor un rato después de cada cambio. */
function useCotizacion(
  token: string,
  organizationId: string,
  customerId: string | undefined,
  renglones: Renglon[],
) {
  const [datos, setDatos] = useState<Cotizacion | null>(null);
  const [sinSenal, setSinSenal] = useState(false);
  const [cargando, setCargando] = useState(false);
  const firma = JSON.stringify([customerId, renglones]);
  useEffect(() => {
    if (!renglones.length) {
      setDatos(null);
      return;
    }
    let vigente = true;
    setCargando(true);
    const espera = window.setTimeout(() => {
      preventaApi
        .cotizar(token, organizationId, { customerId, items: renglones })
        .then((resultado) => {
          if (!vigente) return;
          setDatos(resultado);
          setSinSenal(false);
        })
        .catch(() => {
          if (!vigente) return;
          setDatos(null);
          setSinSenal(true);
        })
        .finally(() => vigente && setCargando(false));
    }, 350);
    return () => {
      vigente = false;
      window.clearTimeout(espera);
    };
    // La firma resume cliente y renglones.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firma, token, organizationId]);
  return { datos, sinSenal, cargando };
}

function ElegirCliente({
  token,
  organizationId,
  contexto,
  onElegir,
}: {
  token: string;
  organizationId: string;
  contexto: ContextoPreventa;
  onElegir: (cliente: ClientePreventa) => void;
}) {
  const [q, setQ] = useState("");
  const [hoy, setHoy] = useState(false);
  const [clientes, setClientes] = useState<ClientePreventa[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [creando, setCreando] = useState(false);
  useEffect(() => {
    let vigente = true;
    setCargando(true);
    const espera = window.setTimeout(() => {
      preventaApi
        .clientes(token, organizationId, { hoy })
        .then((lista) => vigente && (setClientes(lista), setError("")))
        .catch((causa) => vigente && setError(mensajeDe(causa)))
        .finally(() => vigente && setCargando(false));
    }, 250);
    return () => {
      vigente = false;
      window.clearTimeout(espera);
    };
  }, [token, organizationId, hoy]);
  // Se busca en el teléfono: sin tildes, por nombre, dirección o teléfono.
  const visibles = clientes.filter((c) => clienteCoincide(c, q));
  return (
    <div className="grid gap-3">
      <div className="flex items-center gap-2">
        <label className="relative flex-1">
          <span className="sr-only">Buscar cliente</span>
          <Search
            size={18}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-teal-700"
            aria-hidden
          />
          <input
            className={`${campo} mt-0 pl-10`}
            placeholder="Buscar cliente, CUIT o dirección"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            aria-label="Buscar cliente"
          />
        </label>
        <button
          type="button"
          onClick={() => setCreando(true)}
          aria-label="Nuevo cliente"
          className="grid size-11 shrink-0 place-items-center rounded-xl bg-teal-700 text-white hover:bg-teal-800"
        >
          <UserPlus size={20} aria-hidden />
        </button>
      </div>
      <Segmento
        etiqueta="Qué clientes ver"
        valor={hoy ? "hoy" : "todos"}
        onChange={(v) => setHoy(v === "hoy")}
        opciones={[
          { id: "todos", label: "Todos" },
          { id: "hoy", label: "Para visitar hoy" },
        ]}
      />
      {error ? <Aviso tipo="error">{error}</Aviso> : null}
      {!cargando && !visibles.length ? (
        <Vacio
          icono={<Store size={22} aria-hidden />}
          titulo={
            hoy ? "Hoy no tenés visitas cargadas" : "No encontramos clientes"
          }
          detalle={
            hoy
              ? "Cargá los días de visita de cada cliente en Clientes."
              : "Probá con otra búsqueda o cargá uno nuevo."
          }
        />
      ) : null}
      <ul className="grid gap-2">
        {visibles.map((cliente) => (
          <li key={cliente.id}>
            <button
              type="button"
              onClick={() => onElegir(cliente)}
              className="flex w-full items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3 text-left shadow-sm hover:border-teal-300"
            >
              <span className="grid size-12 shrink-0 place-items-center rounded-full bg-violet-100 text-violet-700">
                <Store size={22} aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-bold text-slate-900">
                  {cliente.name}
                </span>
                <span className="block truncate text-xs text-slate-500">
                  {cliente.address ?? "Sin dirección"}
                </span>
                <span className="mt-1 flex flex-wrap items-center gap-1.5">
                  {cliente.visitDays ? (
                    <span className="inline-flex items-center gap-1 text-[11px] text-slate-500">
                      <CalendarDays size={12} aria-hidden />
                      {diasDeVisita(cliente.visitDays)}
                    </span>
                  ) : null}
                  {cliente.balanceMinor && BigInt(cliente.balanceMinor) > 0n ? (
                    <Pastilla tono="mal">
                      Debe {pesos(cliente.balanceMinor)}
                    </Pastilla>
                  ) : null}
                </span>
              </span>
              <ChevronRight size={18} className="text-slate-400" aria-hidden />
            </button>
          </li>
        ))}
      </ul>
      {creando ? (
        <PreventaClienteEditor
          token={token}
          organizationId={organizationId}
          contexto={contexto}
          equipo={[]}
          cliente={null}
          onClose={() => setCreando(false)}
          onGuardado={(nuevo) => {
            setCreando(false);
            if (nuevo) onElegir(nuevo);
          }}
        />
      ) : null}
    </div>
  );
}

function ElegirProductos({
  token,
  organizationId,
  contexto,
  clienteId,
  renglones,
  onCantidad,
}: {
  token: string;
  organizationId: string;
  contexto: ContextoPreventa;
  clienteId: string;
  renglones: Renglon[];
  onCantidad: (producto: ProductoPreventa, cantidad: number) => void;
}) {
  const [q, setQ] = useState("");
  const [filtro, setFiltro] = useState<"todos" | "ofertas" | "stock">("todos");
  const [items, setItems] = useState<ProductoPreventa[]>([]);
  const [pagina, setPagina] = useState(1);
  const [total, setTotal] = useState(0);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [oferta, setOferta] = useState<{
    producto: ProductoPreventa;
    oferta: OfertaDeProducto;
  } | null>(null);
  const pedidoActual = useRef(0);

  const cargar = useCallback(
    async (numero: number) => {
      const id = ++pedidoActual.current;
      setCargando(true);
      try {
        const datos = await preventaApi.productos(token, organizationId, {
          q: q.trim() || undefined,
          cliente: clienteId,
          pagina: numero,
          ofertas: filtro === "ofertas",
          conStock: filtro === "stock",
        });
        if (id !== pedidoActual.current) return;
        setItems((previos) =>
          numero === 1 ? datos.items : [...previos, ...datos.items],
        );
        setTotal(datos.total);
        setPagina(numero);
        setError("");
      } catch (causa) {
        if (id === pedidoActual.current) setError(mensajeDe(causa));
      } finally {
        if (id === pedidoActual.current) setCargando(false);
      }
    },
    [token, organizationId, q, clienteId, filtro],
  );

  useEffect(() => {
    const espera = window.setTimeout(() => void cargar(1), 250);
    return () => window.clearTimeout(espera);
  }, [cargar]);

  const cantidades = useMemo(
    () => new Map(renglones.map((r) => [r.productId, r.quantity])),
    [renglones],
  );

  return (
    <div className="mt-3 grid gap-3">
      <label className="relative">
        <span className="sr-only">Buscar producto</span>
        <Search
          size={18}
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-teal-700"
          aria-hidden
        />
        <input
          className={`${campo} mt-0 pl-10`}
          placeholder="Buscar producto, marca o código"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          aria-label="Buscar producto"
          inputMode="search"
        />
      </label>
      <Segmento
        etiqueta="Filtrar productos"
        valor={filtro}
        onChange={setFiltro}
        opciones={[
          { id: "todos", label: "Todos" },
          { id: "ofertas", label: "Con oferta" },
          { id: "stock", label: "Con stock" },
        ]}
      />
      {error ? <Aviso tipo="error">{error}</Aviso> : null}
      {!cargando && !items.length && !error ? (
        <Vacio
          icono={<PackageSearch size={22} aria-hidden />}
          titulo="No hay productos con esa búsqueda"
        />
      ) : null}
      <ul className="grid gap-2 lg:grid-cols-2">
        {items.map((producto) => {
          const cantidad = cantidades.get(producto.id) ?? 0;
          const sinStock =
            !producto.inStock && !contexto.ajustes.allowOutOfStock;
          return (
            <li
              key={producto.id}
              className={`flex gap-3 rounded-2xl border bg-white p-3 shadow-sm ${
                cantidad
                  ? "border-teal-400 ring-1 ring-teal-200"
                  : "border-slate-200"
              }`}
            >
              <ProductThumbnail
                token={token}
                organizationId={organizationId}
                productId={producto.id}
                version={producto.imageVersion ?? undefined}
                name={producto.name}
              />
              <div className="min-w-0 flex-1">
                <p className="line-clamp-2 text-sm font-semibold leading-snug text-slate-900">
                  {producto.name}
                </p>
                <p className="truncate text-xs text-slate-500">
                  {[producto.brand, producto.presentation]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
                <div className="mt-1 flex flex-wrap items-center gap-1.5">
                  <span className="text-base font-bold tabular-nums text-emerald-700">
                    {producto.priceMinor
                      ? pesos(producto.priceMinor)
                      : "Sin precio"}
                  </span>
                  {producto.stock !== null ? (
                    <Pastilla
                      tono={
                        producto.stock > 5
                          ? "neutro"
                          : producto.stock > 0
                            ? "aviso"
                            : "mal"
                      }
                    >
                      {producto.stock > 0
                        ? `Stock ${producto.stock}`
                        : "Sin stock"}
                    </Pastilla>
                  ) : !producto.inStock ? (
                    <Pastilla tono="mal">Sin stock</Pastilla>
                  ) : null}
                </div>
                {producto.ofertas.length ? (
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {producto.ofertas.map((o) => (
                      <button
                        key={o.id}
                        type="button"
                        onClick={() => setOferta({ producto, oferta: o })}
                        className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-800 hover:bg-amber-200"
                      >
                        <BadgePercent size={12} aria-hidden />
                        {o.corta}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
              <div className="flex shrink-0 flex-col items-end justify-center">
                {cantidad ? (
                  <Cantidad
                    valor={cantidad}
                    nombre={producto.name}
                    onCambiar={(n) => onCantidad(producto, n)}
                  />
                ) : (
                  <button
                    type="button"
                    disabled={sinStock || !producto.priceMinor}
                    onClick={() => onCantidad(producto, 1)}
                    aria-label={`Agregar ${producto.name}`}
                    className="grid size-11 place-items-center rounded-xl bg-teal-700 text-white hover:bg-teal-800 disabled:bg-slate-200 disabled:text-slate-400"
                  >
                    <Plus size={20} aria-hidden />
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      {items.length < total ? (
        <button
          type="button"
          className={botonSecundario}
          disabled={cargando}
          onClick={() => void cargar(pagina + 1)}
        >
          {cargando ? "Cargando…" : `Ver más (${total - items.length})`}
        </button>
      ) : null}
      {oferta ? (
        <Hoja titulo="Oferta" onClose={() => setOferta(null)}>
          <DetalleOferta producto={oferta.producto} oferta={oferta.oferta} />
        </Hoja>
      ) : null}
    </div>
  );
}

export function DetalleOferta({
  producto,
  oferta,
}: {
  producto: ProductoPreventa;
  oferta: OfertaDeProducto;
}) {
  return (
    <div className="grid gap-3">
      <div className="flex items-center gap-3 rounded-2xl bg-amber-50 p-3">
        <span className="grid size-11 place-items-center rounded-xl bg-amber-100 text-amber-800">
          <Sparkles size={20} aria-hidden />
        </span>
        <div className="min-w-0">
          <p className="text-lg font-bold text-amber-900">{oferta.label}</p>
          <p className="truncate text-sm text-amber-900">{producto.name}</p>
        </div>
      </div>
      <ul className="grid gap-1.5">
        {oferta.detalle.map((linea) => (
          <li
            key={linea}
            className="flex items-start gap-2 text-sm text-slate-700"
          >
            <Check size={16} className="mt-0.5 text-teal-700" aria-hidden />
            {linea}
          </li>
        ))}
      </ul>
      {producto.priceMinor ? (
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-xl border border-slate-200 p-3">
            <p className="text-xs text-slate-500">Precio de lista</p>
            <p className="text-base font-bold tabular-nums text-slate-500 line-through">
              {pesos(producto.priceMinor)}
            </p>
          </div>
          <div className="rounded-xl border border-teal-200 bg-teal-50 p-3">
            <p className="text-xs text-teal-800">
              {oferta.porCantidad
                ? `Cada una llevando ${oferta.porCantidad.cantidad}`
                : "Con la oferta"}
            </p>
            <p className="text-base font-bold tabular-nums text-teal-800">
              {oferta.porCantidad
                ? pesos(oferta.porCantidad.precioUnitarioMinor)
                : oferta.precioOfertaMinor
                  ? pesos(oferta.precioOfertaMinor)
                  : "Según cantidad"}
            </p>
          </div>
        </div>
      ) : null}
      <p className="text-xs text-slate-500">
        La oferta se aplica sola al confirmar el pedido si se cumplen las
        condiciones.
      </p>
    </div>
  );
}

function Cantidad({
  valor,
  nombre,
  onCambiar,
}: {
  valor: number;
  nombre: string;
  onCambiar: (valor: number) => void;
}) {
  const [texto, setTexto] = useState<string | null>(null);
  return (
    <div className="flex items-center rounded-xl border border-slate-200 bg-white">
      <button
        type="button"
        onClick={() => onCambiar(valor - 1)}
        aria-label={`Quitar uno de ${nombre}`}
        className="grid size-10 place-items-center text-slate-600 hover:text-rose-600"
      >
        {valor === 1 ? (
          <Trash2 size={16} aria-hidden />
        ) : (
          <Minus size={16} aria-hidden />
        )}
      </button>
      <input
        value={texto ?? valor}
        inputMode="numeric"
        aria-label={`Cantidad de ${nombre}`}
        onFocus={(e) => {
          setTexto(String(valor));
          e.target.select();
        }}
        onChange={(e) => {
          const limpio = e.target.value.replace(/\D/g, "").slice(0, 4);
          setTexto(limpio);
          // Mientras se escribe, vacío o 0 no quitan el producto.
          if (Number(limpio) > 0) onCambiar(Number(limpio));
        }}
        onBlur={() => {
          // Vacío: vuelve lo que había. Un 0 escrito a propósito lo quita.
          if (texto === "0") onCambiar(0);
          setTexto(null);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
        }}
        className="w-12 bg-transparent text-center text-sm font-bold tabular-nums text-slate-900 outline-none"
      />
      <button
        type="button"
        onClick={() => onCambiar(valor + 1)}
        aria-label={`Sumar uno de ${nombre}`}
        className="grid size-10 place-items-center text-teal-700"
      >
        <Plus size={16} aria-hidden />
      </button>
    </div>
  );
}

function Resumen({
  contexto,
  borrador,
  cotizacion,
  onVolver,
  onCantidad,
  onPrecio,
  onNotas,
  onConfirmar,
}: {
  contexto: ContextoPreventa;
  borrador: Borrador;
  cotizacion: ReturnType<typeof useCotizacion>;
  onVolver: () => void;
  onCantidad: (productId: string, cantidad: number) => void;
  onPrecio: (productId: string, unitPriceMinor: string | undefined) => void;
  onNotas: (notas: string) => void;
  onConfirmar: (requestId: string) => Promise<void>;
}) {
  // Un id por intento: si la red falla y se reintenta, no se duplica.
  const requestId = useRef(crypto.randomUUID());
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState("");
  const [precioDe, setPrecioDe] = useState<string | null>(null);
  const datos = cotizacion.datos;
  const porId = new Map(datos?.items.map((i) => [i.productId, i]) ?? []);
  const noDisponibles = new Set(datos?.noDisponibles ?? []);

  if (!borrador.renglones.length)
    return (
      <div className="mt-3">
        <Vacio
          icono={<ShoppingBag size={22} aria-hidden />}
          titulo="El pedido está vacío"
        >
          <button type="button" className={botonPrimario} onClick={onVolver}>
            Agregar productos
          </button>
        </Vacio>
      </div>
    );

  return (
    <div className="mt-3 grid gap-3 pb-4">
      <button
        type="button"
        onClick={onVolver}
        className="inline-flex items-center gap-1.5 justify-self-start text-sm font-semibold text-teal-700"
      >
        <ArrowLeft size={16} aria-hidden /> Seguir agregando
      </button>
      {cotizacion.sinSenal ? (
        <Aviso tipo="info">
          <CloudOff size={14} className="mr-1 inline" aria-hidden />
          Sin señal: el total es estimado. Al enviarlo, la farmacia confirma
          precios y ofertas.
        </Aviso>
      ) : null}
      <ul className="grid gap-2">
        {borrador.renglones.map((renglon) => {
          const producto = borrador.productos[renglon.productId];
          const cotizado = porId.get(renglon.productId);
          const lista =
            cotizado?.listUnitPriceMinor ?? producto?.priceMinor ?? "0";
          const unitario =
            renglon.unitPriceMinor ?? cotizado?.unitPriceMinor ?? lista;
          const rebajado = BigInt(unitario) < BigInt(lista);
          return (
            <li
              key={renglon.productId}
              className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm"
            >
              <div className="flex items-start justify-between gap-3">
                <p className="min-w-0 text-sm font-semibold text-slate-900">
                  {producto?.name ?? "Producto"}
                </p>
                <p className="shrink-0 text-sm font-bold tabular-nums text-slate-900">
                  {pesos(
                    cotizado?.totalMinor ??
                      String(Number(unitario) * renglon.quantity),
                  )}
                </p>
              </div>
              {noDisponibles.has(renglon.productId) ? (
                <p className="mt-1 text-xs font-semibold text-rose-700">
                  No disponible: sin stock o sin precio. Quitalo para seguir.
                </p>
              ) : null}
              <div className="mt-2 flex items-center justify-between gap-2">
                <Cantidad
                  valor={renglon.quantity}
                  nombre={producto?.name ?? "producto"}
                  onCambiar={(n) => onCantidad(renglon.productId, n)}
                />
                <div className="text-right">
                  {contexto.ajustes.sellerCanChangePrice ? (
                    <button
                      type="button"
                      onClick={() => setPrecioDe(renglon.productId)}
                      className="text-xs font-semibold text-teal-700 hover:underline"
                    >
                      {pesos(unitario)} c/u ✎
                    </button>
                  ) : (
                    <p className="text-xs text-slate-500">
                      {pesos(unitario)} c/u
                    </p>
                  )}
                  {rebajado ? (
                    <p className="text-[11px] text-slate-400 line-through">
                      {pesos(lista)}
                    </p>
                  ) : null}
                </div>
              </div>
              {cotizado?.labels.length ? (
                <div className="mt-2 flex flex-wrap gap-1">
                  {cotizado.labels.map((l) => (
                    <Pastilla key={l} tono="aviso">
                      {l}
                    </Pastilla>
                  ))}
                  {BigInt(cotizado.discountMinor) > 0n ? (
                    <span className="text-xs font-semibold text-emerald-700">
                      Ahorra {pesos(cotizado.discountMinor)}
                    </span>
                  ) : null}
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
      {datos?.sugerencias.map((s) => (
        <Aviso key={s.offerId} tipo="info">
          <Sparkles size={14} className="mr-1 inline" aria-hidden />
          {s.mensaje}
        </Aviso>
      ))}
      <label className="text-sm font-medium text-slate-700">
        Nota para el reparto
        <textarea
          className={`${campo} min-h-20 py-2`}
          maxLength={500}
          placeholder="Ej.: dejar en el depósito, pasar después de las 10"
          value={borrador.notas}
          onChange={(e) => onNotas(e.target.value)}
        />
      </label>
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        {datos && BigInt(datos.ahorroMinor) > 0n ? (
          <p className="flex justify-between text-sm text-emerald-700">
            <span>Ahorro por ofertas</span>
            <span className="font-semibold tabular-nums">
              -{pesos(datos.ahorroMinor)}
            </span>
          </p>
        ) : null}
        <p className="mt-1 flex items-baseline justify-between">
          <span className="text-sm font-semibold text-slate-700">
            Total {cotizacion.sinSenal ? "estimado" : ""}
          </span>
          <span className="text-2xl font-bold tabular-nums text-slate-900">
            {pesos(
              datos?.totalMinor ??
                String(
                  borrador.renglones.reduce(
                    (s, r) =>
                      s +
                      Number(
                        r.unitPriceMinor ??
                          borrador.productos[r.productId]?.priceMinor ??
                          0,
                      ) *
                        r.quantity,
                    0,
                  ),
                ),
            )}
          </span>
        </p>
      </div>
      {error ? <Aviso tipo="error">{error}</Aviso> : null}
      <button
        type="button"
        className={`${botonPrimario} min-h-14 text-base`}
        disabled={enviando || cotizacion.cargando || noDisponibles.size > 0}
        onClick={async () => {
          setEnviando(true);
          setError("");
          try {
            await onConfirmar(requestId.current);
          } catch (causa) {
            setError(mensajeDe(causa));
          } finally {
            setEnviando(false);
          }
        }}
      >
        <Check size={20} aria-hidden />
        {enviando ? "Guardando…" : "Confirmar pedido"}
      </button>
      {precioDe ? (
        <EditarPrecio
          nombre={borrador.productos[precioDe]?.name ?? "Producto"}
          listaMinor={
            porId.get(precioDe)?.listUnitPriceMinor ??
            borrador.productos[precioDe]?.priceMinor ??
            "0"
          }
          actualMinor={
            borrador.renglones.find((r) => r.productId === precioDe)
              ?.unitPriceMinor
          }
          onClose={() => setPrecioDe(null)}
          onGuardar={(valor) => {
            onPrecio(precioDe, valor);
            setPrecioDe(null);
          }}
        />
      ) : null}
    </div>
  );
}

function EditarPrecio({
  nombre,
  listaMinor,
  actualMinor,
  onClose,
  onGuardar,
}: {
  nombre: string;
  listaMinor: string;
  actualMinor?: string;
  onClose: () => void;
  onGuardar: (valor: string | undefined) => void;
}) {
  const [texto, setTexto] = useState(
    actualMinor ? (Number(actualMinor) / 100).toLocaleString("es-AR") : "",
  );
  const centavos = pesosACentavos(texto);
  const invalido = centavos === null || centavos > Number(listaMinor);
  return (
    <Hoja
      titulo="Precio especial"
      onClose={onClose}
      pie={
        <div className="flex gap-2">
          <button
            type="button"
            className={`${botonSecundario} flex-1`}
            onClick={() => onGuardar(undefined)}
          >
            Volver a lista
          </button>
          <button
            type="button"
            className={`${botonPrimario} flex-1`}
            disabled={invalido || !texto.trim()}
            onClick={() => onGuardar(String(centavos))}
          >
            Aplicar
          </button>
        </div>
      }
    >
      <p className="text-sm text-slate-700">{nombre}</p>
      <p className="text-xs text-slate-500">
        Precio de lista: {pesos(listaMinor)}
      </p>
      <label className="mt-3 block text-sm font-medium text-slate-700">
        Precio por unidad
        <input
          className={campo}
          inputMode="decimal"
          autoFocus
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder="0,00"
        />
      </label>
      {invalido && texto.trim() ? (
        <p className="mt-2 text-xs text-rose-700">
          Sólo se puede bajar el precio, nunca superar la lista.
        </p>
      ) : null}
      <p className="mt-2 text-xs text-slate-500">
        Con precio especial, las ofertas no se aplican a este producto.
      </p>
    </Hoja>
  );
}
