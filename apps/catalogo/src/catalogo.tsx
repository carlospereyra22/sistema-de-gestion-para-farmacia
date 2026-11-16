import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  NavLink,
  Route,
  Routes,
  useLocation,
  useNavigate,
  useParams,
} from "react-router-dom";
import {
  BadgePercent,
  LogIn,
  LogOut,
  MapPin,
  Package,
  Phone,
  ShoppingBag,
  Store,
  UserRound,
} from "lucide-react";

import {
  cotizarCarrito,
  getPortada,
  logoDelCatalogo,
  salirDelCatalogo,
  type Cotizacion,
  type PortadaCatalogo,
} from "./lib/api";
import {
  guardarCarrito,
  iniciales,
  leerCarrito,
  unidadesEnCarrito,
  type RenglonCarrito,
} from "./lib/carrito";
import { CatalogoPublicoCarrito } from "./pagina-carrito";
import { CatalogoPublicoIngresar } from "./pagina-ingresar";
import { CatalogoPublicoPedidos } from "./pagina-pedidos";
import { CatalogoPublicoProductos } from "./pagina-productos";

const almacen = () => {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
};

/** Lo que comparten las páginas del catálogo público. */
export type ContextoCatalogo = {
  slug: string;
  portada: PortadaCatalogo;
  carrito: RenglonCarrito[];
  setCarrito: (carrito: RenglonCarrito[]) => void;
  /** Precios y ofertas del carrito según el servidor (null: sin carrito). */
  cotizacion: Cotizacion | null;
  /** Volver a pedir la portada (después de ingresar o si venció la sesión). */
  recargar: () => Promise<void>;
};

/**
 * Catálogo online público de una farmacia (SISTEMA-107): <sitio>/<slug>.
 * Es un sitio aparte de la gestión: no tiene su código ni su sesión.
 */
export default function CatalogoPublico() {
  return (
    <Routes>
      <Route path="/:slug/*" element={<CatalogoDeFarmacia />} />
      <Route path="*" element={<NoDisponible />} />
    </Routes>
  );
}

function CatalogoDeFarmacia() {
  const { slug = "" } = useParams();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [portada, setPortada] = useState<PortadaCatalogo>();
  const [falla, setFalla] = useState("");
  const [carrito, setCarritoEstado] = useState<RenglonCarrito[]>(() =>
    leerCarrito(slug, almacen()),
  );

  const [cotizacion, setCotizacion] = useState<Cotizacion | null>(null);
  // El carrito se cotiza en el servidor (ofertas incluidas) cada vez que
  // cambia; espera un momento para no consultar en cada clic.
  const claveCarrito = carrito
    .map((r) => `${r.productId}:${r.quantity}`)
    .join(",");
  useEffect(() => {
    if (!claveCarrito) {
      setCotizacion(null);
      return;
    }
    let vigente = true;
    const espera = window.setTimeout(() => {
      void cotizarCarrito(
        slug,
        claveCarrito.split(",").map((parte) => {
          const [productId = "", cantidad = "0"] = parte.split(":");
          return { productId, quantity: Number(cantidad) };
        }),
      )
        .then((resultado) => {
          if (vigente) setCotizacion(resultado);
        })
        .catch(() => {
          if (vigente) setCotizacion(null);
        });
    }, 250);
    return () => {
      vigente = false;
      window.clearTimeout(espera);
    };
  }, [slug, claveCarrito, portada?.user?.email]);

  const recargar = useCallback(async () => {
    try {
      setPortada(await getPortada(slug));
      setFalla("");
    } catch (cause) {
      setFalla(cause instanceof Error ? cause.message : String(cause));
    }
  }, [slug]);

  useEffect(() => {
    void recargar();
  }, [recargar]);

  useEffect(() => {
    if (portada) document.title = portada.name;
  }, [portada]);

  // Cada página nueva arranca arriba (en el celular se nota mucho).
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [pathname]);

  const setCarrito = (nuevo: RenglonCarrito[]) => {
    setCarritoEstado(nuevo);
    guardarCarrito(slug, nuevo, almacen());
  };

  if (falla && !portada) return <NoDisponible mensaje={falla} />;
  if (!portada) return <Cargando />;

  const contexto: ContextoCatalogo = {
    slug,
    portada,
    carrito,
    setCarrito,
    cotizacion,
    recargar,
  };
  const unidades = unidadesEnCarrito(carrito);
  const raiz = `/${slug}`;
  const salir = () =>
    void salirDelCatalogo(slug)
      .catch(() => undefined)
      .then(recargar)
      .then(() => navigate(raiz));
  const bloqueado = portada.requireLogin && !portada.user;

  return (
    <div className="min-h-dvh bg-slate-50 text-slate-900">
      <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/90 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-4">
          <NavLink to={raiz} end className="flex min-w-0 items-center gap-3">
            <Logo portada={portada} slug={slug} />
            <span className="min-w-0">
              <span className="block truncate text-[15px] font-semibold leading-tight">
                {portada.name}
              </span>
              <span className="block truncate text-xs text-slate-500">
                {portada.user
                  ? `Hola, ${portada.user.name.split(" ")[0]}`
                  : "Catálogo online"}
              </span>
            </span>
          </NavLink>

          {!bloqueado ? (
            <nav
              aria-label="Catálogo"
              className="ml-auto hidden items-center gap-1 md:flex"
            >
              <EnlaceArriba to={raiz} end icono={<Store size={18} />}>
                Catálogo
              </EnlaceArriba>
              {portada.hayOfertas ? (
                <EnlaceArriba
                  to={`${raiz}/ofertas`}
                  icono={<BadgePercent size={18} />}
                >
                  Ofertas
                </EnlaceArriba>
              ) : null}
              {portada.user ? (
                <EnlaceArriba
                  to={`${raiz}/pedidos`}
                  icono={<Package size={18} />}
                >
                  Mis pedidos
                </EnlaceArriba>
              ) : null}
              <EnlaceArriba
                to={`${raiz}/carrito`}
                icono={<ShoppingBag size={18} />}
                cantidad={unidades}
              >
                Carrito
              </EnlaceArriba>
            </nav>
          ) : null}

          <div className="ml-auto flex items-center gap-2 md:ml-2">
            {portada.user ? (
              <MenuCuenta
                nombre={portada.user.name}
                email={portada.user.email}
                onSalir={salir}
              />
            ) : !bloqueado ? (
              <NavLink
                to={`${raiz}/ingresar`}
                className="hidden h-10 items-center gap-2 rounded-xl bg-teal-700 px-3.5 text-sm font-semibold text-white shadow-sm hover:bg-teal-800 md:inline-flex"
              >
                <LogIn size={17} aria-hidden /> Ingresar
              </NavLink>
            ) : null}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 pb-8 pt-4 md:pb-12 md:pt-6">
        {bloqueado ? (
          <CatalogoPublicoIngresar contexto={contexto} />
        ) : (
          <Routes>
            <Route
              index
              element={<CatalogoPublicoProductos contexto={contexto} />}
            />
            <Route
              path="ofertas"
              element={
                portada.hayOfertas ? (
                  <CatalogoPublicoProductos contexto={contexto} soloOfertas />
                ) : (
                  <NoDisponible mensaje="Por ahora no hay ofertas." />
                )
              }
            />
            <Route
              path="carrito"
              element={<CatalogoPublicoCarrito contexto={contexto} />}
            />
            <Route
              path="pedidos/*"
              element={<CatalogoPublicoPedidos contexto={contexto} />}
            />
            <Route
              path="ingresar"
              element={<CatalogoPublicoIngresar contexto={contexto} />}
            />
            <Route
              path="*"
              element={<NoDisponible mensaje="No encontramos esa página." />}
            />
          </Routes>
        )}
      </main>

      <footer className="mx-auto mb-[calc(4rem+env(safe-area-inset-bottom))] flex max-w-6xl flex-col gap-2 border-t border-slate-200 px-4 py-5 text-xs text-slate-500 md:mb-0 md:flex-row md:flex-wrap md:items-center md:justify-between md:py-6">
        <DatosFarmacia portada={portada} />
        <span>
          Los medicamentos de venta bajo receta se piden en el mostrador.
        </span>
      </footer>

      {!bloqueado ? (
        <nav
          aria-label="Navegación"
          className="pie-seguro fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 backdrop-blur-md md:hidden"
        >
          <div
            className={`grid h-16 ${portada.hayOfertas ? "grid-cols-4" : "grid-cols-3"}`}
          >
            <EnlaceAbajo to={raiz} end icono={<Store size={22} />}>
              Catálogo
            </EnlaceAbajo>
            {portada.hayOfertas ? (
              <EnlaceAbajo
                to={`${raiz}/ofertas`}
                icono={<BadgePercent size={22} />}
              >
                Ofertas
              </EnlaceAbajo>
            ) : null}
            {portada.user ? (
              <EnlaceAbajo to={`${raiz}/pedidos`} icono={<Package size={22} />}>
                Pedidos
              </EnlaceAbajo>
            ) : (
              <EnlaceAbajo
                to={`${raiz}/ingresar`}
                icono={<UserRound size={22} />}
              >
                Ingresar
              </EnlaceAbajo>
            )}
            <EnlaceAbajo
              to={`${raiz}/carrito`}
              icono={<ShoppingBag size={22} />}
              cantidad={unidades}
            >
              Carrito
            </EnlaceAbajo>
          </div>
        </nav>
      ) : null}
    </div>
  );
}

function Logo({ portada, slug }: { portada: PortadaCatalogo; slug: string }) {
  const [roto, setRoto] = useState(false);
  if (portada.hasLogo && !roto)
    return (
      <img
        src={logoDelCatalogo(slug)}
        alt=""
        onError={() => setRoto(true)}
        className="size-10 shrink-0 rounded-xl border border-slate-200 bg-white object-contain p-0.5"
      />
    );
  return (
    <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-teal-600 to-teal-800 text-white shadow-sm">
      <Store size={20} aria-hidden />
    </span>
  );
}

/** Dirección y teléfono de la farmacia. */
export function DatosFarmacia({
  portada,
  className = "",
}: {
  portada: PortadaCatalogo;
  className?: string;
}) {
  return (
    <span
      className={`flex flex-wrap items-center gap-x-4 gap-y-1 ${className}`}
    >
      {portada.address ? (
        <span className="inline-flex items-center gap-1.5">
          <MapPin size={14} aria-hidden /> {portada.address}
        </span>
      ) : null}
      {portada.phone ? (
        <a
          href={`tel:${portada.phone.replace(/[^\d+]/g, "")}`}
          className="inline-flex items-center gap-1.5 hover:underline"
        >
          <Phone size={14} aria-hidden /> {portada.phone}
        </a>
      ) : null}
    </span>
  );
}

function Contador({ cantidad }: { cantidad: number }) {
  if (!cantidad) return null;
  return (
    <span className="min-w-5 rounded-full bg-teal-600 px-1.5 text-center text-[11px] font-bold leading-5 text-white">
      {cantidad > 99 ? "99+" : cantidad}
    </span>
  );
}

function EnlaceArriba({
  to,
  end,
  icono,
  cantidad = 0,
  children,
}: {
  to: string;
  end?: boolean;
  icono: ReactNode;
  cantidad?: number;
  children: ReactNode;
}) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        `inline-flex h-10 items-center gap-2 rounded-xl px-3 text-sm font-medium transition-colors ${
          isActive
            ? "bg-teal-50 text-teal-800"
            : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
        }`
      }
    >
      {icono}
      {children}
      <Contador cantidad={cantidad} />
    </NavLink>
  );
}

function EnlaceAbajo({
  to,
  end,
  icono,
  cantidad = 0,
  children,
}: {
  to: string;
  end?: boolean;
  icono: ReactNode;
  cantidad?: number;
  children: ReactNode;
}) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        `relative flex flex-col items-center justify-center gap-0.5 text-[11px] font-medium transition-colors ${
          isActive ? "text-teal-700" : "text-slate-500"
        }`
      }
    >
      {({ isActive }) => (
        <>
          {isActive ? (
            <span className="absolute top-0 h-0.5 w-10 rounded-full bg-teal-600" />
          ) : null}
          <span className="relative">
            {icono}
            {cantidad ? (
              <span className="absolute -right-2.5 -top-1.5">
                <Contador cantidad={cantidad} />
              </span>
            ) : null}
          </span>
          {children}
        </>
      )}
    </NavLink>
  );
}

function MenuCuenta({
  nombre,
  email,
  onSalir,
}: {
  nombre: string;
  email: string;
  onSalir: () => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const raiz = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!abierto) return;
    const cerrar = (event: PointerEvent) => {
      if (!raiz.current?.contains(event.target as Node)) setAbierto(false);
    };
    document.addEventListener("pointerdown", cerrar);
    return () => document.removeEventListener("pointerdown", cerrar);
  }, [abierto]);
  return (
    <div ref={raiz} className="relative">
      <button
        type="button"
        aria-label="Tu cuenta"
        aria-expanded={abierto}
        onClick={() => setAbierto(!abierto)}
        className="flex size-10 items-center justify-center rounded-full bg-teal-100 text-sm font-semibold text-teal-800 ring-teal-600 hover:ring-2"
      >
        {iniciales(nombre)}
      </button>
      {abierto ? (
        <div className="absolute right-0 top-12 w-64 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl">
          <div className="border-b border-slate-100 p-4">
            <p className="truncate text-sm font-semibold">{nombre}</p>
            <p className="truncate text-xs text-slate-500">{email}</p>
          </div>
          <button
            type="button"
            onClick={onSalir}
            className="flex w-full items-center gap-2 px-4 py-3 text-sm text-slate-700 hover:bg-slate-50"
          >
            <LogOut size={16} aria-hidden /> Salir
          </button>
        </div>
      ) : null}
    </div>
  );
}

function Cargando() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-slate-50">
      <span className="size-8 animate-spin rounded-full border-2 border-teal-600 border-t-transparent" />
    </div>
  );
}

function NoDisponible({
  mensaje = "Abrí el catálogo con el link que te pasó la farmacia.",
}: {
  mensaje?: string;
}) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-3 bg-slate-50 p-6 text-center">
      <span className="flex size-14 items-center justify-center rounded-2xl bg-teal-50 text-teal-700">
        <Store size={28} aria-hidden />
      </span>
      <p className="text-lg font-semibold text-slate-800">{mensaje}</p>
      <p className="text-sm text-slate-500">
        Si el link no funciona, consultá a la farmacia.
      </p>
    </div>
  );
}
