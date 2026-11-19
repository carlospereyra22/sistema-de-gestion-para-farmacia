import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  CheckCircle2,
  Crosshair,
  Map as MapaIcono,
  MapPinOff,
  Navigation,
  Phone,
  Route,
  Truck,
  Wallet,
} from "lucide-react";

import {
  preventaApi,
  type ContextoPreventa,
  type MiembroEquipo,
  type PedidoPreventa,
} from "./lib/preventa-api";
import {
  conUbicacion,
  linkMapa,
  linkRecorrido,
  mensajeDe,
  numeroDePedido,
  pesos,
  recorrido,
  type Punto,
} from "./lib/preventa";
import { ProductFilterSelect } from "./product-filter-select";
import { PreventaPedidoDetalle } from "./preventa-pedido-detalle";
import {
  Aviso,
  Indicador,
  Pastilla,
  Segmento,
  Vacio,
  botonIcono,
  botonPrimario,
  botonSecundario,
} from "./preventa-ui";

const PreventaMapa = lazy(() => import("./preventa-mapa"));

/**
 * Reparto (SISTEMA-108): lo que tengo que entregar hoy, en el mapa y en un
 * recorrido sugerido desde donde estoy. También los pendientes sin
 * repartidor, para tomarlos.
 */
export function PreventaReparto({
  token,
  organizationId,
  contexto,
  equipo,
  recarga,
}: {
  token: string;
  organizationId: string;
  contexto: ContextoPreventa;
  equipo: MiembroEquipo[];
  recarga: number;
}) {
  const administra = contexto.permisos.administrar;
  const [vista, setVista] = useState<"mias" | "libres">("mias");
  const [repartidor, setRepartidor] = useState(contexto.usuario.id);
  const [pedidos, setPedidos] = useState<PedidoPreventa[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [aviso, setAviso] = useState("");
  const [yo, setYo] = useState<Punto | null>(null);
  const [ordenar, setOrdenar] = useState(false);
  const [verMapa, setVerMapa] = useState(false);
  const [abierto, setAbierto] = useState<PedidoPreventa | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const datos =
        vista === "mias"
          ? await preventaApi.pedidos(token, organizationId, {
              estado: "IN_DELIVERY",
              ...(administra && repartidor !== contexto.usuario.id
                ? { repartidor }
                : { repartir: true, mios: true }),
            })
          : await preventaApi.pedidos(token, organizationId, {
              estado: "PENDING",
              repartir: true,
            });
      setPedidos(
        vista === "libres"
          ? datos.items.filter((p) => !p.delivererId)
          : datos.items,
      );
      setError("");
    } catch (causa) {
      setError(mensajeDe(causa));
    } finally {
      setCargando(false);
    }
  }, [
    token,
    organizationId,
    vista,
    repartidor,
    administra,
    contexto.usuario.id,
  ]);

  useEffect(() => {
    void cargar();
  }, [cargar, recarga]);

  const ubicar = () => {
    if (!navigator.geolocation) {
      setError("Este teléfono no comparte la ubicación.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setYo({ latitude: p.coords.latitude, longitude: p.coords.longitude });
        setOrdenar(true);
      },
      () =>
        setError(
          "No pudimos leer tu ubicación. Revisá el permiso del navegador.",
        ),
      { enableHighAccuracy: true, timeout: 15_000 },
    );
  };

  const { orden, km } = useMemo(
    () => (ordenar ? recorrido(pedidos, yo) : { orden: pedidos, km: 0 }),
    [ordenar, pedidos, yo],
  );
  const ubicadas = orden.filter(conUbicacion);
  const aCobrar = pedidos.reduce(
    (s, p) => s + BigInt(p.totalMinor) - BigInt(p.paidMinor),
    0n,
  );
  const rutaGoogle = linkRecorrido(ubicadas, yo);

  return (
    <div className="grid gap-3">
      <Segmento
        etiqueta="Qué pedidos ver"
        valor={vista}
        onChange={(v) => {
          setVista(v);
          setOrdenar(false);
        }}
        opciones={[
          { id: "mias", label: "Mis entregas" },
          { id: "libres", label: "Sin repartidor" },
        ]}
      />
      {administra && vista === "mias" ? (
        <ProductFilterSelect
          label="Repartidor"
          value={repartidor}
          icon={<Truck size={16} aria-hidden />}
          options={[
            { value: contexto.usuario.id, label: "Yo" },
            ...equipo
              .filter((m) => m.reparte && m.userId !== contexto.usuario.id)
              .map((m) => ({ value: m.userId, label: m.name })),
          ]}
          onChange={setRepartidor}
        />
      ) : null}

      <div className="grid grid-cols-2 gap-2">
        <Indicador
          titulo="Paradas"
          valor={String(pedidos.length)}
          detalle={
            ordenar && yo
              ? `Recorrido aprox. ${km.toFixed(1)} km`
              : `${ubicadas.length} con ubicación`
          }
          tono="marca"
        />
        <Indicador titulo="A cobrar" valor={pesos(aCobrar)} tono="aviso" />
      </div>

      {vista === "mias" && pedidos.length ? (
        <div className="grid grid-cols-2 gap-2 sm:flex">
          <button
            type="button"
            className={`${botonPrimario} col-span-2 sm:flex-1`}
            onClick={ubicar}
          >
            <Crosshair size={16} aria-hidden /> Ordenar por cercanía
          </button>
          <button
            type="button"
            className={`${botonSecundario} sm:flex-1`}
            onClick={() => setVerMapa((v) => !v)}
          >
            <MapaIcono size={16} aria-hidden />{" "}
            {verMapa ? "Ocultar mapa" : "Ver mapa"}
          </button>
          {rutaGoogle ? (
            <a
              href={rutaGoogle}
              target="_blank"
              rel="noreferrer"
              className={`${botonSecundario} sm:flex-1`}
            >
              <Route size={16} aria-hidden /> Google Maps
            </a>
          ) : null}
        </div>
      ) : null}

      {aviso ? <Aviso tipo="bien">{aviso}</Aviso> : null}
      {error ? <Aviso tipo="error">{error}</Aviso> : null}

      {verMapa && vista === "mias" ? (
        <Suspense
          fallback={
            <div className="h-72 animate-pulse rounded-2xl bg-slate-100" />
          }
        >
          <PreventaMapa
            puntos={ubicadas.map((p) => ({
              id: p.id,
              latitude: p.latitude,
              longitude: p.longitude,
              titulo: `${orden.indexOf(p) + 1}. ${p.customerName}`,
              numero: orden.indexOf(p) + 1,
            }))}
            miUbicacion={yo}
            onElegir={(id) =>
              setAbierto(pedidos.find((p) => p.id === id) ?? null)
            }
          />
        </Suspense>
      ) : null}

      {!cargando && !pedidos.length ? (
        <Vacio
          icono={<Truck size={22} aria-hidden />}
          titulo={
            vista === "mias"
              ? "No tenés entregas pendientes"
              : "No hay pedidos sin repartidor"
          }
          detalle={
            vista === "mias"
              ? 'Tomá pedidos de "Sin repartidor" o esperá a que te asignen.'
              : undefined
          }
        />
      ) : null}

      <ol className="grid gap-2 lg:grid-cols-2">
        {orden.map((pedido, indice) => {
          const mapa = linkMapa({ ...pedido, address: pedido.deliveryAddress });
          return (
            <li
              key={pedido.id}
              className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm"
            >
              <button
                type="button"
                onClick={() => setAbierto(pedido)}
                className="flex w-full items-start gap-3 text-left"
              >
                <span className="grid size-9 shrink-0 place-items-center rounded-full bg-teal-700 text-sm font-bold text-white">
                  {indice + 1}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-bold text-slate-900">
                    {pedido.customerName}
                  </span>
                  <span className="block truncate text-xs text-slate-500">
                    {pedido.deliveryAddress ?? "Sin dirección"}
                  </span>
                  <span className="mt-1 flex flex-wrap items-center gap-1.5">
                    <span className="text-sm font-bold tabular-nums text-emerald-700">
                      {pesos(pedido.totalMinor)}
                    </span>
                    <span className="text-xs text-slate-500">
                      {numeroDePedido(pedido.number)} · {pedido.items.length}{" "}
                      prod.
                    </span>
                    {!conUbicacion(pedido) ? (
                      <Pastilla tono="neutro">
                        <MapPinOff size={10} aria-hidden /> Sin mapa
                      </Pastilla>
                    ) : null}
                  </span>
                </span>
              </button>
              <div className="mt-2 flex gap-2">
                {mapa ? (
                  <a
                    href={mapa}
                    target="_blank"
                    rel="noreferrer"
                    aria-label={`Cómo llegar a ${pedido.customerName}`}
                    className={botonIcono}
                  >
                    <Navigation size={16} aria-hidden />
                  </a>
                ) : null}
                {pedido.customerPhone ? (
                  <a
                    href={`tel:${pedido.customerPhone}`}
                    aria-label={`Llamar a ${pedido.customerName}`}
                    className={botonIcono}
                  >
                    <Phone size={16} aria-hidden />
                  </a>
                ) : null}
                {vista === "libres" ? (
                  <button
                    type="button"
                    className={`${botonPrimario} min-h-10 flex-1`}
                    onClick={async () => {
                      try {
                        await preventaApi.asignar(
                          token,
                          organizationId,
                          [pedido.id],
                          contexto.usuario.id,
                        );
                        setAviso(`${pedido.customerName} quedó en tu reparto.`);
                        void cargar();
                      } catch (causa) {
                        setError(mensajeDe(causa));
                      }
                    }}
                  >
                    <Truck size={16} aria-hidden /> Llevarlo yo
                  </button>
                ) : (
                  <button
                    type="button"
                    className={`${botonPrimario} min-h-10 flex-1`}
                    onClick={() => setAbierto(pedido)}
                  >
                    {BigInt(pedido.totalMinor) > BigInt(pedido.paidMinor) ? (
                      <Wallet size={16} aria-hidden />
                    ) : (
                      <CheckCircle2 size={16} aria-hidden />
                    )}
                    Entregar
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ol>

      {abierto ? (
        <PreventaPedidoDetalle
          token={token}
          organizationId={organizationId}
          contexto={contexto}
          pedido={abierto}
          equipo={equipo}
          onCambio={(nuevo, mensaje) => {
            setAviso(mensaje);
            if (nuevo.status === "IN_DELIVERY" && vista === "mias")
              setPedidos((lista) =>
                lista.map((p) => (p.id === nuevo.id ? nuevo : p)),
              );
            else {
              setPedidos((lista) => lista.filter((p) => p.id !== nuevo.id));
              setAbierto(null);
            }
          }}
          onEditar={() => setAbierto(null)}
          onClose={() => setAbierto(null)}
        />
      ) : null}
    </div>
  );
}
