import { useCallback, useEffect, useState } from "react";
import {
  Link,
  Route,
  Routes,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom";
import {
  ArrowLeft,
  Check,
  ChevronRight,
  CircleCheck,
  MapPin,
  Package,
  RotateCcw,
  Store,
  Truck,
} from "lucide-react";

import type { ContextoCatalogo } from "./catalogo";
import { EstadoPedidoEtiqueta } from "./estado-pedido";
import { FotoProducto } from "./foto-producto";
import { useRefresco } from "./use-refresco";
import {
  cancelarMiPedido,
  getMiPedido,
  getMisPedidos,
  type EstadoPedido,
  type Pedido,
} from "./lib/api";
import {
  agregarAlCarrito,
  ESTADOS_PEDIDO,
  numeroDePedido,
  pesos,
} from "./lib/carrito";

const fecha = (iso: string) =>
  new Intl.DateTimeFormat("es-AR", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(iso));

/** Pedidos del cliente en el catálogo (SISTEMA-107). */
export function CatalogoPublicoPedidos({
  contexto,
}: {
  contexto: ContextoCatalogo;
}) {
  if (!contexto.portada.user)
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-center">
        <p className="text-sm text-slate-600">Ingresá para ver tus pedidos.</p>
        <Link
          to={`/${contexto.slug}/ingresar`}
          className="inline-flex h-11 items-center rounded-xl bg-teal-700 px-5 text-sm font-semibold text-white"
        >
          Ingresar
        </Link>
      </div>
    );
  return (
    <Routes>
      <Route index element={<Lista contexto={contexto} />} />
      <Route path=":id" element={<Detalle contexto={contexto} />} />
    </Routes>
  );
}

function Lista({ contexto }: { contexto: ContextoCatalogo }) {
  const { slug } = contexto;
  const [pedidos, setPedidos] = useState<Pedido[]>();
  const [falla, setFalla] = useState("");
  const cargar = useCallback(
    (silencioso = false) =>
      void getMisPedidos(slug)
        .then((lista) => {
          setPedidos(lista);
          setFalla("");
        })
        .catch((cause: unknown) => {
          if (!silencioso)
            setFalla(cause instanceof Error ? cause.message : String(cause));
        }),
    [slug],
  );
  useEffect(() => cargar(), [cargar]);
  // El estado cambia cuando la farmacia confirma o entrega: se ve solo.
  useRefresco(() => cargar(true));
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
      <h1 className="text-xl font-bold sm:text-2xl">Mis pedidos</h1>
      {falla ? (
        <p className="rounded-2xl bg-rose-50 p-4 text-sm text-rose-800">
          {falla}
        </p>
      ) : null}
      {!pedidos && !falla
        ? Array.from({ length: 3 }, (_, i) => (
            <div
              key={i}
              className="h-24 animate-pulse rounded-2xl border border-slate-200 bg-white"
            />
          ))
        : null}
      {pedidos && !pedidos.length ? (
        <div className="flex flex-col items-center gap-3 py-16 text-center">
          <span className="flex size-16 items-center justify-center rounded-3xl bg-teal-50 text-teal-700">
            <Package size={28} aria-hidden />
          </span>
          <p className="font-semibold">Todavía no hiciste pedidos</p>
          <Link
            to={`/${slug}`}
            className="inline-flex h-11 items-center rounded-xl bg-teal-700 px-5 text-sm font-semibold text-white"
          >
            Ver el catálogo
          </Link>
        </div>
      ) : null}
      <ul className="flex flex-col gap-3">
        {pedidos?.map((pedido) => (
          <li key={pedido.id}>
            <Link
              to={`/${slug}/pedidos/${pedido.id}`}
              className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 transition-shadow hover:shadow-md"
            >
              <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-500">
                {pedido.delivery === "DELIVERY" ? (
                  <Truck size={20} aria-hidden />
                ) : (
                  <Store size={20} aria-hidden />
                )}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-semibold">
                    Pedido {numeroDePedido(pedido.number)}
                  </p>
                  <EstadoPedidoEtiqueta estado={pedido.status} />
                </div>
                <p className="mt-0.5 truncate text-xs text-slate-500">
                  {fecha(pedido.createdAt)} ·{" "}
                  {pedido.items.length === 1
                    ? "1 producto"
                    : `${pedido.items.length} productos`}
                </p>
              </div>
              <p className="font-bold tabular-nums">
                {pesos(pedido.totalMinor)}
              </p>
              <ChevronRight
                size={18}
                className="shrink-0 text-slate-400"
                aria-hidden
              />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

const PASOS: { estado: EstadoPedido; texto: string }[] = [
  { estado: "RECEIVED", texto: "Recibido" },
  { estado: "CONFIRMED", texto: "Confirmado" },
  { estado: "DELIVERED", texto: "Entregado" },
];

/** Avance del pedido: recibido → confirmado → entregado. */
function Avance({ estado }: { estado: EstadoPedido }) {
  if (estado === "REJECTED" || estado === "CANCELLED") return null;
  const hasta = PASOS.findIndex((p) => p.estado === estado);
  return (
    <ol className="flex items-center">
      {PASOS.map((paso, i) => (
        <li
          key={paso.estado}
          className={`flex items-center ${i < PASOS.length - 1 ? "flex-1" : ""}`}
        >
          <span className="flex flex-col items-center gap-1">
            <span
              className={`flex size-8 items-center justify-center rounded-full text-xs font-bold ${
                i <= hasta
                  ? "bg-teal-600 text-white"
                  : "bg-slate-100 text-slate-400"
              }`}
            >
              {i <= hasta ? <Check size={16} aria-hidden /> : i + 1}
            </span>
            <span
              className={`text-[11px] font-medium ${i <= hasta ? "text-teal-800" : "text-slate-400"}`}
            >
              {paso.texto}
            </span>
          </span>
          {i < PASOS.length - 1 ? (
            <span
              className={`mx-1 mb-5 h-0.5 flex-1 rounded-full ${i < hasta ? "bg-teal-600" : "bg-slate-200"}`}
            />
          ) : null}
        </li>
      ))}
    </ol>
  );
}

function Detalle({ contexto }: { contexto: ContextoCatalogo }) {
  const { slug, carrito, setCarrito } = contexto;
  const { id = "" } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [pedido, setPedido] = useState<Pedido>();
  const [falla, setFalla] = useState("");
  const [cancelando, setCancelando] = useState(false);

  const cargar = useCallback(
    (silencioso = false) =>
      void getMiPedido(slug, id)
        .then(setPedido)
        .catch((cause: unknown) => {
          if (!silencioso)
            setFalla(cause instanceof Error ? cause.message : String(cause));
        }),
    [slug, id],
  );
  useEffect(() => cargar(), [cargar]);
  useRefresco(() => cargar(true));

  if (falla && !pedido)
    return (
      <p className="rounded-2xl bg-rose-50 p-4 text-sm text-rose-800">
        {falla}
      </p>
    );
  if (!pedido)
    return (
      <div className="mx-auto h-64 max-w-3xl animate-pulse rounded-2xl border border-slate-200 bg-white" />
    );

  const repetir = () => {
    let nuevo = carrito;
    for (const item of pedido.items)
      nuevo = agregarAlCarrito(
        nuevo,
        {
          productId: item.productId,
          name: item.productName,
          priceMinor: item.unitPriceMinor,
          hasImage: true,
          presentation: null,
        },
        item.quantity,
      );
    setCarrito(nuevo);
    navigate(`/${slug}/carrito`);
  };

  const cancelar = () => {
    if (!window.confirm("¿Cancelar este pedido?")) return;
    setCancelando(true);
    void cancelarMiPedido(slug, pedido.id)
      .then(setPedido)
      .catch((cause: unknown) =>
        setFalla(cause instanceof Error ? cause.message : String(cause)),
      )
      .finally(() => setCancelando(false));
  };

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
      <Link
        to={`/${slug}/pedidos`}
        className="inline-flex w-fit items-center gap-2 text-sm font-medium text-slate-600 hover:text-slate-900"
      >
        <ArrowLeft size={16} aria-hidden /> Mis pedidos
      </Link>

      {params.get("enviado") ? (
        <div className="flex gap-3 rounded-2xl bg-gradient-to-br from-teal-600 to-teal-800 p-4 text-white shadow-lg shadow-teal-900/10">
          <CircleCheck size={26} className="shrink-0" aria-hidden />
          <div>
            <p className="font-semibold">¡Pedido enviado!</p>
            <p className="text-sm text-teal-50">
              {contexto.portada.name} lo revisa y te lo confirma.
            </p>
            <Link
              to={`/${slug}`}
              className="mt-3 inline-flex h-9 items-center rounded-xl bg-white px-3 text-sm font-semibold text-teal-800"
            >
              Seguir comprando
            </Link>
          </div>
        </div>
      ) : null}

      <section className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold sm:text-2xl">
              Pedido {numeroDePedido(pedido.number)}
            </h1>
            <p className="text-sm text-slate-500">{fecha(pedido.createdAt)}</p>
          </div>
          <EstadoPedidoEtiqueta estado={pedido.status} />
        </div>
        <Avance estado={pedido.status} />
        <p className="text-sm text-slate-700">
          {ESTADOS_PEDIDO[pedido.status].detalle}
        </p>
        {pedido.decisionNote ? (
          <p className="rounded-xl bg-rose-50 p-3 text-sm text-rose-800">
            {pedido.decisionNote}
          </p>
        ) : null}
        <div className="flex flex-col gap-1.5 rounded-xl bg-slate-50 p-3 text-sm text-slate-700">
          <p className="flex items-center gap-2">
            {pedido.delivery === "DELIVERY" ? (
              <Truck size={16} aria-hidden />
            ) : (
              <Store size={16} aria-hidden />
            )}
            {pedido.delivery === "DELIVERY"
              ? "Envío a domicilio"
              : "Retiro en la farmacia"}
          </p>
          {pedido.deliveryAddress ? (
            <p className="flex items-center gap-2 text-slate-600">
              <MapPin size={16} aria-hidden /> {pedido.deliveryAddress}
            </p>
          ) : null}
          {pedido.notes ? (
            <p className="text-slate-600">Notas: {pedido.notes}</p>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={repetir}
            className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 px-3.5 text-sm font-medium hover:bg-slate-50"
          >
            <RotateCcw size={16} aria-hidden /> Repetir pedido
          </button>
          {pedido.status === "RECEIVED" ? (
            <button
              type="button"
              disabled={cancelando}
              onClick={cancelar}
              className="inline-flex h-10 items-center rounded-xl border border-rose-200 px-3.5 text-sm font-medium text-rose-700 hover:bg-rose-50 disabled:opacity-60"
            >
              Cancelar pedido
            </button>
          ) : null}
        </div>
        {falla ? (
          <p role="alert" className="text-sm text-rose-700">
            {falla}
          </p>
        ) : null}
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <p className="border-b border-slate-100 px-4 py-3 font-semibold sm:px-5">
          Productos
        </p>
        <ul className="divide-y divide-slate-100">
          {pedido.items.map((item) => (
            <li
              key={item.productId}
              className="flex items-center gap-3 px-4 py-3 sm:px-5"
            >
              <FotoProducto
                slug={slug}
                productId={item.productId}
                name={item.productName}
                hasImage
                chica
                className="size-12 shrink-0 overflow-hidden rounded-lg border border-slate-100"
              />
              <span className="min-w-0 flex-1">
                <span className="line-clamp-2 block text-sm font-medium">
                  {item.productName}
                </span>
                <span className="text-xs text-slate-500">
                  {item.quantity} × {pesos(item.unitPriceMinor)}
                </span>
                {item.discountMinor !== "0" ? (
                  <span className="block text-xs font-medium text-emerald-700">
                    Oferta: -{pesos(item.discountMinor)}
                  </span>
                ) : null}
              </span>
              <span className="text-sm font-bold tabular-nums">
                {pesos(item.totalMinor)}
              </span>
            </li>
          ))}
        </ul>
        {pedido.ahorroMinor !== "0" ? (
          <p className="flex justify-between border-t border-slate-200 px-4 pt-3 text-sm font-medium text-emerald-700 sm:px-5">
            <span>Ahorraste con ofertas</span>
            <span className="tabular-nums">-{pesos(pedido.ahorroMinor)}</span>
          </p>
        ) : null}
        <p className="flex justify-between border-t border-slate-200 px-4 py-4 text-lg font-bold sm:px-5">
          <span>Total</span>
          <span className="tabular-nums">{pesos(pedido.totalMinor)}</span>
        </p>
      </section>
    </div>
  );
}
