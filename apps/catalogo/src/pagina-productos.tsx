import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  BadgePercent,
  ChevronLeft,
  ChevronRight,
  Expand,
  Minus,
  Plus,
  Search,
  ShoppingBag,
  X,
} from "lucide-react";

import type { ContextoCatalogo } from "./catalogo";
import { DetalleProducto } from "./detalle-producto";
import { FotoProducto } from "./foto-producto";
import { PildoraOferta, PrecioConOferta } from "./oferta-ui";
import { SelectorCategoria } from "./selector-categoria";
import {
  getCategoriasCatalogo,
  getProductosCatalogo,
  IngresoRequeridoError,
  type ProductoCatalogo,
} from "./lib/api";
import {
  agregarAlCarrito,
  cambiarCantidad,
  pesos,
  totalEstimado,
  unidadesEnCarrito,
  type RenglonCarrito,
} from "./lib/carrito";
import { paginasVisibles, totalDePaginas } from "./lib/paginas";

/** Catálogo de productos (SISTEMA-107): pensado primero para el celular. */
export function CatalogoPublicoProductos({
  contexto,
  soloOfertas = false,
}: {
  contexto: ContextoCatalogo;
  /** Apartado Ofertas: sólo los productos con alguna oferta vigente. */
  soloOfertas?: boolean;
}) {
  const { slug, portada, carrito, setCarrito, recargar, cotizacion } = contexto;
  const [busqueda, setBusqueda] = useState("");
  const [q, setQ] = useState("");
  const [categoria, setCategoria] = useState("");
  const [categorias, setCategorias] = useState<{ id: string; name: string }[]>(
    [],
  );
  const [productos, setProductos] = useState<ProductoCatalogo[]>([]);
  const [total, setTotal] = useState(0);
  const [porPagina, setPorPagina] = useState(40);
  const [pagina, setPagina] = useState(1);
  const [cargando, setCargando] = useState(true);
  const [falla, setFalla] = useState("");
  const [ampliado, setAmpliado] = useState<ProductoCatalogo>();
  const arriba = useRef<HTMLDivElement>(null);

  // La búsqueda espera a que se deje de escribir.
  useEffect(() => {
    const espera = window.setTimeout(() => {
      setQ(busqueda.trim());
      setPagina(1);
    }, 300);
    return () => window.clearTimeout(espera);
  }, [busqueda]);

  useEffect(() => {
    void getCategoriasCatalogo(slug)
      .then(setCategorias)
      .catch(() => setCategorias([]));
  }, [slug, portada.user]);

  useEffect(() => {
    let vigente = true;
    setCargando(true);
    void getProductosCatalogo(slug, { q, categoria, pagina, soloOfertas })
      .then((datos) => {
        if (!vigente) return;
        setProductos(datos.items);
        setTotal(datos.total);
        setPorPagina(datos.porPagina);
        setFalla("");
      })
      .catch((cause: unknown) => {
        if (!vigente) return;
        if (cause instanceof IngresoRequeridoError) void recargar();
        setFalla(cause instanceof Error ? cause.message : String(cause));
      })
      .finally(() => {
        if (vigente) setCargando(false);
      });
    return () => {
      vigente = false;
    };
  }, [slug, q, categoria, pagina, soloOfertas, portada.user, recargar]);

  const irA = (nueva: number) => {
    setPagina(nueva);
    // Al cambiar de página se vuelve al principio de la lista.
    const y =
      (arriba.current?.getBoundingClientRect().top ?? 0) + window.scrollY - 72;
    window.scrollTo({ top: Math.max(0, y), behavior: "smooth" });
  };

  const cantidadDe = (id: string) =>
    carrito.find((r) => r.productId === id)?.quantity ?? 0;
  const fijarCantidad = (producto: ProductoCatalogo, cantidad: number) => {
    const renglon: Omit<RenglonCarrito, "quantity"> = {
      productId: producto.id,
      name: producto.name,
      priceMinor: producto.priceMinor,
      hasImage: producto.hasImage,
      imageVersion: producto.imageVersion,
      presentation: producto.presentation,
    };
    setCarrito(
      carrito.some((r) => r.productId === producto.id)
        ? cambiarCantidad(carrito, producto.id, cantidad)
        : agregarAlCarrito(carrito, renglon, cantidad),
    );
  };
  const cerrarAmpliado = useCallback(() => setAmpliado(undefined), []);
  const paginas = totalDePaginas(total, porPagina);
  const unidades = unidadesEnCarrito(carrito);
  // Con ofertas, el total lo da el servidor; mientras tanto, la estimación.
  const estimado = cotizacion?.totalMinor ?? totalEstimado(carrito);

  return (
    <div ref={arriba} className="flex flex-col gap-4">
      {soloOfertas ? (
        <div className="flex items-center gap-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-rose-700">
          <BadgePercent size={26} className="shrink-0" aria-hidden />
          <div>
            <h1 className="text-lg font-bold leading-tight">Ofertas</h1>
            <p className="text-xs text-rose-700/80">
              Los productos con descuento de {portada.name}.
            </p>
          </div>
        </div>
      ) : null}
      <div className="sticky top-16 z-20 -mx-4 flex gap-2 bg-slate-50/95 px-4 pb-3 pt-1 backdrop-blur-md">
        <label className="flex h-12 min-w-0 flex-1 items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 shadow-sm focus-within:border-teal-500 focus-within:ring-2 focus-within:ring-teal-100">
          <Search size={18} className="shrink-0 text-slate-400" aria-hidden />
          <input
            type="search"
            enterKeyHint="search"
            value={busqueda}
            onChange={(event) => setBusqueda(event.target.value)}
            placeholder="¿Qué estás buscando?"
            aria-label="Buscar productos"
            className="w-full min-w-0 bg-transparent text-[15px] outline-none placeholder:text-slate-400 [&::-webkit-search-cancel-button]:hidden"
          />
          {busqueda ? (
            <button
              type="button"
              aria-label="Borrar búsqueda"
              onClick={() => setBusqueda("")}
              className="rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            >
              <X size={16} aria-hidden />
            </button>
          ) : null}
        </label>

        {categorias.length ? (
          <SelectorCategoria
            value={categoria}
            options={[
              { value: "", label: "Todas" },
              ...categorias.map((c) => ({ value: c.id, label: c.name })),
            ]}
            onChange={(valor) => {
              setCategoria(valor);
              setPagina(1);
            }}
          />
        ) : null}
      </div>

      <p className="-mt-2 text-xs text-slate-500">
        {cargando && !total
          ? "Buscando productos…"
          : `${total === 1 ? "1 producto" : `${total} productos`}${q ? ` para “${q}”` : ""}${
              paginas > 1 ? ` · página ${pagina} de ${paginas}` : ""
            }`}
      </p>

      {falla ? (
        <p className="rounded-2xl bg-rose-50 p-4 text-sm text-rose-800">
          {falla}
        </p>
      ) : null}

      <ul
        className={`grid grid-cols-2 gap-3 transition-opacity sm:grid-cols-3 sm:gap-4 lg:grid-cols-4 xl:grid-cols-5 ${
          cargando && productos.length ? "opacity-50" : ""
        }`}
      >
        {cargando && !productos.length
          ? Array.from({ length: 10 }, (_, i) => <TarjetaCargando key={i} />)
          : productos.map((producto) => (
              <Tarjeta
                key={producto.id}
                slug={slug}
                producto={producto}
                cantidad={cantidadDe(producto.id)}
                onCantidad={(cantidad) => fijarCantidad(producto, cantidad)}
                onAmpliar={() => setAmpliado(producto)}
              />
            ))}
      </ul>

      {!cargando && !productos.length && !falla ? (
        <div className="flex flex-col items-center gap-2 py-16 text-center">
          <span className="flex size-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
            <Search size={22} aria-hidden />
          </span>
          <p className="font-medium text-slate-700">
            No encontramos productos{q ? ` para “${q}”` : ""}.
          </p>
          <p className="text-sm text-slate-500">
            Probá con otra palabra o elegí otra categoría.
          </p>
        </div>
      ) : null}

      {paginas > 1 ? (
        <Paginador
          pagina={pagina}
          paginas={paginas}
          deshabilitado={cargando}
          onPagina={irA}
        />
      ) : null}

      {/* Espacio para que la barra del carrito no tape el paginador. */}
      {unidades ? <div className="h-16 md:h-12" /> : null}

      {unidades ? (
        <Link
          to={`/${slug}/carrito`}
          className="fixed inset-x-3 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-20 mx-auto flex max-w-md items-center gap-3 rounded-2xl bg-teal-700 px-4 py-3 text-white shadow-xl shadow-teal-900/20 transition-transform active:scale-[0.98] md:bottom-6 md:left-auto md:right-6 md:mx-0 md:w-96"
        >
          <span className="relative">
            <ShoppingBag size={22} aria-hidden />
            <span className="absolute -right-2 -top-2 min-w-5 rounded-full bg-white px-1 text-center text-[11px] font-bold leading-5 text-teal-800">
              {unidades}
            </span>
          </span>
          <span className="flex-1 font-semibold">Ver carrito</span>
          {estimado !== null ? (
            <span className="font-bold tabular-nums">{pesos(estimado)}</span>
          ) : null}
          <ArrowRight size={18} aria-hidden />
        </Link>
      ) : null}

      {ampliado ? (
        <DetalleProducto
          slug={slug}
          producto={ampliado}
          cotizacion={cotizacion}
          cantidad={cantidadDe(ampliado.id)}
          onCantidad={(cantidad) => fijarCantidad(ampliado, cantidad)}
          onCerrar={cerrarAmpliado}
        />
      ) : null}
    </div>
  );
}

function Paginador({
  pagina,
  paginas,
  deshabilitado,
  onPagina,
}: {
  pagina: number;
  paginas: number;
  deshabilitado: boolean;
  onPagina: (pagina: number) => void;
}) {
  const boton =
    "flex h-10 min-w-10 items-center justify-center rounded-xl px-2 text-sm font-medium transition-colors disabled:opacity-40";
  return (
    <nav
      aria-label="Páginas"
      className="flex items-center justify-center gap-1 pt-2"
    >
      <button
        type="button"
        aria-label="Página anterior"
        disabled={deshabilitado || pagina <= 1}
        onClick={() => onPagina(pagina - 1)}
        className={`${boton} border border-slate-200 bg-white text-slate-700 hover:bg-slate-50`}
      >
        <ChevronLeft size={18} aria-hidden />
      </button>
      {paginasVisibles(pagina, paginas).map((p, i) =>
        p === "…" ? (
          <span
            key={`salto-${i}`}
            className="w-6 text-center text-sm text-slate-400"
          >
            …
          </span>
        ) : (
          <button
            key={p}
            type="button"
            aria-label={`Página ${p}`}
            aria-current={p === pagina ? "page" : undefined}
            disabled={deshabilitado}
            onClick={() => p !== pagina && onPagina(p)}
            className={`${boton} ${
              p === pagina
                ? "bg-teal-700 font-semibold text-white"
                : "text-slate-700 hover:bg-white"
            }`}
          >
            {p}
          </button>
        ),
      )}
      <button
        type="button"
        aria-label="Página siguiente"
        disabled={deshabilitado || pagina >= paginas}
        onClick={() => onPagina(pagina + 1)}
        className={`${boton} border border-slate-200 bg-white text-slate-700 hover:bg-slate-50`}
      >
        <ChevronRight size={18} aria-hidden />
      </button>
    </nav>
  );
}

function Tarjeta({
  slug,
  producto,
  cantidad,
  onCantidad,
  onAmpliar,
}: {
  slug: string;
  producto: ProductoCatalogo;
  cantidad: number;
  onCantidad: (cantidad: number) => void;
  onAmpliar: () => void;
}) {
  return (
    <li
      className={`group flex flex-col overflow-hidden rounded-2xl border bg-white transition-shadow hover:shadow-md ${
        cantidad ? "border-teal-400 ring-1 ring-teal-400" : "border-slate-200"
      }`}
    >
      <button
        type="button"
        aria-label={`Ver ${producto.name}`}
        onClick={onAmpliar}
        className="relative block cursor-zoom-in"
      >
        <FotoProducto
          slug={slug}
          productId={producto.id}
          name={producto.name}
          hasImage={producto.hasImage}
          version={producto.imageVersion}
          className="aspect-square w-full transition-transform duration-300 group-hover:scale-[1.03]"
        />
        <span className="absolute bottom-2 right-2 flex size-8 items-center justify-center rounded-full bg-white/90 text-slate-600 opacity-0 shadow ring-1 ring-slate-200 transition-opacity group-hover:opacity-100">
          <Expand size={15} aria-hidden />
        </span>
        <span className="absolute left-2 top-2 flex max-w-[calc(100%-3rem)] flex-col items-start gap-1">
          {producto.ofertas[0] ? (
            <PildoraOferta oferta={producto.ofertas[0]} chica />
          ) : null}
          {!producto.inStock ? (
            <span className="rounded-full bg-slate-900/75 px-2 py-0.5 text-[11px] font-medium text-white">
              Sin stock
            </span>
          ) : null}
        </span>
        {cantidad ? (
          <span className="absolute right-2 top-2 flex size-7 items-center justify-center rounded-full bg-teal-600 text-xs font-bold text-white shadow">
            {cantidad}
          </span>
        ) : null}
      </button>
      <div className="flex flex-1 flex-col gap-1 border-t border-slate-100 p-3">
        {producto.brand ? (
          <p className="truncate text-[11px] font-semibold uppercase tracking-wide text-teal-700">
            {producto.brand}
          </p>
        ) : null}
        <button
          type="button"
          onClick={onAmpliar}
          className="line-clamp-2 text-left text-sm font-medium leading-snug text-slate-800 hover:text-teal-800"
        >
          {producto.name}
        </button>
        {producto.presentation ? (
          <p className="truncate text-xs text-slate-500">
            {producto.presentation}
          </p>
        ) : null}
        <div className="mt-auto pt-1">
          <PrecioConOferta
            priceMinor={producto.priceMinor}
            oferta={producto.ofertas[0]}
          />
        </div>
        {cantidad ? (
          <div className="flex h-10 items-center justify-between rounded-xl bg-teal-50 ring-1 ring-teal-200">
            <button
              type="button"
              aria-label={`Quitar uno de ${producto.name}`}
              onClick={() => onCantidad(cantidad - 1)}
              className="flex h-full w-10 items-center justify-center rounded-l-xl text-teal-800 active:bg-teal-100"
            >
              <Minus size={16} aria-hidden />
            </button>
            <span className="text-sm font-bold tabular-nums text-teal-900">
              {cantidad}
            </span>
            <button
              type="button"
              aria-label={`Agregar uno de ${producto.name}`}
              onClick={() => onCantidad(cantidad + 1)}
              className="flex h-full w-10 items-center justify-center rounded-r-xl bg-teal-700 text-white active:bg-teal-800"
            >
              <Plus size={16} aria-hidden />
            </button>
          </div>
        ) : (
          <button
            type="button"
            aria-label={`Agregar ${producto.name} al carrito`}
            onClick={() => onCantidad(1)}
            className="inline-flex h-10 items-center justify-center gap-1.5 rounded-xl bg-teal-700 text-sm font-semibold text-white transition-colors hover:bg-teal-800 active:scale-[0.98]"
          >
            <Plus size={16} aria-hidden /> Agregar
          </button>
        )}
      </div>
    </li>
  );
}

function TarjetaCargando() {
  return (
    <li className="flex animate-pulse flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white">
      <div className="aspect-square w-full bg-slate-100" />
      <div className="flex flex-col gap-2 p-3">
        <div className="h-3 w-1/3 rounded bg-slate-100" />
        <div className="h-4 w-5/6 rounded bg-slate-100" />
        <div className="h-5 w-1/2 rounded bg-slate-100" />
        <div className="h-10 rounded-xl bg-slate-100" />
      </div>
    </li>
  );
}
