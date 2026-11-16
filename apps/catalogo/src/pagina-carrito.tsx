import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  BadgePercent,
  PartyPopper,
  LogIn,
  Minus,
  Plus,
  ShoppingBag,
  Sparkles,
  Store,
  Trash2,
  Truck,
} from "lucide-react";

import type { ContextoCatalogo } from "./catalogo";
import { FotoProducto } from "./foto-producto";
import {
  enviarPedido,
  getProductosCatalogo,
  IngresoRequeridoError,
  type Entrega,
  type OfertaDelProducto,
} from "./lib/api";
import {
  actualizarPrecios,
  cambiarCantidad,
  pesos,
  totalEstimado,
  unidadesEnCarrito,
} from "./lib/carrito";

const nuevoId = () => crypto.randomUUID();

/** Carrito y confirmación del pedido (SISTEMA-107). */
export function CatalogoPublicoCarrito({
  contexto,
}: {
  contexto: ContextoCatalogo;
}) {
  const { slug, portada, carrito, setCarrito, recargar, cotizacion } = contexto;
  const navigate = useNavigate();
  const [entrega, setEntrega] = useState<Entrega | "">(
    portada.pickupEnabled && !portada.deliveryEnabled
      ? "PICKUP"
      : !portada.pickupEnabled && portada.deliveryEnabled
        ? "DELIVERY"
        : "",
  );
  const [direccion, setDireccion] = useState("");
  const [notas, setNotas] = useState("");
  const [sinStock, setSinStock] = useState<Set<string>>(new Set());
  const [noDisponibles, setNoDisponibles] = useState<Set<string>>(new Set());
  const [enviando, setEnviando] = useState(false);
  const [falla, setFalla] = useState("");
  // Un mismo intento conserva su id: si se corta la red, reenviar no duplica.
  const intento = useRef<{ id: string; firma: string } | undefined>(undefined);

  // Precios y disponibilidad del momento, desde la API.
  const ids = carrito.map((r) => r.productId).join(",");
  useEffect(() => {
    if (!ids) return;
    void getProductosCatalogo(slug, { ids: ids.split(",") })
      .then(({ items }) => {
        const vigentes = new Map(items.map((p) => [p.id, p]));
        setNoDisponibles(
          new Set(ids.split(",").filter((id) => !vigentes.has(id))),
        );
        setSinStock(new Set(items.filter((p) => !p.inStock).map((p) => p.id)));
        setCarrito(
          actualizarPrecios(
            carrito,
            new Map(items.map((p) => [p.id, p.priceMinor])),
          ).map((r) => {
            const vigente = vigentes.get(r.productId);
            return vigente
              ? {
                  ...r,
                  hasImage: vigente.hasImage,
                  imageVersion: vigente.imageVersion,
                }
              : r;
          }),
        );
      })
      .catch(() => undefined);
    // Sólo cuando cambia qué productos hay, no la cantidad.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug, ids, portada.user]);

  // Con ofertas, el total y cada renglón los calcula el servidor.
  const total = cotizacion?.totalMinor ?? totalEstimado(carrito);
  const deRenglon = (productId: string) =>
    cotizacion?.items.find((item) => item.productId === productId);
  const ahorro = cotizacion?.ahorroMinor ?? "0";
  // Los avisos de "agregá N más" van debajo del producto al que se refieren.
  const sugerenciasDe = (productId: string) =>
    (cotizacion?.sugerencias ?? []).filter(
      (s) =>
        s.productIds.includes(productId) &&
        !cotizacion?.ofertasDeLaCompra.some((o) => o.id === s.offerId),
    );
  const cotizacionAlDia =
    cotizacion !== null &&
    carrito.every(
      (r) =>
        cotizacion.items.find((i) => i.productId === r.productId)?.quantity ===
        r.quantity,
    );
  const unidades = unidadesEnCarrito(carrito);

  if (!carrito.length)
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-center">
        <span className="flex size-16 items-center justify-center rounded-3xl bg-teal-50 text-teal-700">
          <ShoppingBag size={30} aria-hidden />
        </span>
        <p className="text-lg font-semibold">Tu carrito está vacío</p>
        <p className="text-sm text-slate-500">
          Agregá productos desde el catálogo.
        </p>
        <Link
          to={`/${slug}`}
          className="mt-2 inline-flex h-11 items-center rounded-xl bg-teal-700 px-5 text-sm font-semibold text-white hover:bg-teal-800"
        >
          Ver el catálogo
        </Link>
      </div>
    );

  const confirmar = async () => {
    setFalla("");
    if (!entrega) {
      setFalla("Elegí si retirás en la farmacia o preferís envío.");
      return;
    }
    if (entrega === "DELIVERY" && !direccion.trim()) {
      setFalla("Escribí la dirección de entrega.");
      return;
    }
    const pedido = {
      items: carrito.map(({ productId, quantity }) => ({
        productId,
        quantity,
      })),
      delivery: entrega,
      deliveryAddress: entrega === "DELIVERY" ? direccion : undefined,
      notes: notas || undefined,
      // Sólo si la cotización corresponde a este carrito (puede estar llegando).
      expectedTotalMinor: cotizacionAlDia ? (total ?? undefined) : undefined,
    };
    const firma = JSON.stringify(pedido);
    if (intento.current?.firma !== firma)
      intento.current = { id: nuevoId(), firma };
    setEnviando(true);
    try {
      const creado = await enviarPedido(slug, {
        requestId: intento.current.id,
        ...pedido,
      });
      intento.current = undefined;
      setCarrito([]);
      navigate(`/${slug}/pedidos/${creado.id}?enviado=1`);
    } catch (cause) {
      if (cause instanceof IngresoRequeridoError) await recargar();
      setFalla(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setEnviando(false);
    }
  };

  const opcion = (activa: boolean) =>
    `flex flex-1 items-center gap-3 rounded-2xl border p-3 text-left transition-colors ${
      activa
        ? "border-teal-600 bg-teal-50 ring-1 ring-teal-600"
        : "border-slate-200 bg-white hover:border-slate-300"
    }`;
  const puedeConfirmar = Boolean(portada.user) && noDisponibles.size === 0;

  return (
    <div className="flex flex-col gap-4 pb-24 lg:pb-0">
      <div className="flex items-center gap-3">
        <Link
          to={`/${slug}`}
          aria-label="Seguir comprando"
          className="flex size-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
        >
          <ArrowLeft size={18} aria-hidden />
        </Link>
        <div>
          <h1 className="text-xl font-bold sm:text-2xl">Tu carrito</h1>
          <p className="text-xs text-slate-500">
            {unidades === 1 ? "1 unidad" : `${unidades} unidades`}
          </p>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_380px] lg:items-start">
        <ul className="flex flex-col gap-3">
          {carrito.map((r) => (
            <li
              key={r.productId}
              className="flex gap-3 rounded-2xl border border-slate-200 bg-white p-3"
            >
              <FotoProducto
                slug={slug}
                productId={r.productId}
                name={r.name}
                hasImage={r.hasImage}
                version={r.imageVersion}
                chica
                className="size-20 shrink-0 overflow-hidden rounded-xl border border-slate-100"
              />
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <div className="flex items-start gap-2">
                  <p className="line-clamp-2 flex-1 text-sm font-medium leading-snug">
                    {r.name}
                  </p>
                  <button
                    type="button"
                    aria-label={`Quitar ${r.name} del carrito`}
                    onClick={() =>
                      setCarrito(cambiarCantidad(carrito, r.productId, 0))
                    }
                    className="-mr-1 -mt-1 rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-700"
                  >
                    <Trash2 size={16} aria-hidden />
                  </button>
                </div>
                {r.priceMinor !== null ? (
                  <p className="text-xs text-slate-500">
                    {pesos(r.priceMinor)} c/u
                  </p>
                ) : null}
                {deRenglon(r.productId)?.labels.length ? (
                  <p className="flex flex-wrap gap-1">
                    {deRenglon(r.productId)!.labels.map((label) => (
                      <span
                        key={label}
                        className="rounded-full bg-rose-100 px-2 py-0.5 text-[11px] font-bold text-rose-700 ring-1 ring-rose-200"
                      >
                        {label}
                      </span>
                    ))}
                  </p>
                ) : null}
                {sugerenciasDe(r.productId).map((sugerencia) => (
                  <p
                    key={sugerencia.offerId}
                    className="flex items-center gap-1.5 text-xs font-semibold text-rose-700"
                  >
                    <Sparkles size={14} className="shrink-0" aria-hidden />
                    {sugerencia.mensaje}
                  </p>
                ))}
                {noDisponibles.has(r.productId) ? (
                  <p className="text-xs font-medium text-rose-700">
                    Ya no está disponible: quitalo para seguir.
                  </p>
                ) : sinStock.has(r.productId) ? (
                  <p className="text-xs font-medium text-amber-700">
                    Sin stock: la farmacia te confirma si lo consigue.
                  </p>
                ) : null}
                <div className="mt-auto flex items-center justify-between gap-2 pt-1">
                  <div className="flex h-9 items-center rounded-xl bg-slate-100">
                    <button
                      type="button"
                      aria-label={`Quitar uno de ${r.name}`}
                      onClick={() =>
                        setCarrito(
                          cambiarCantidad(carrito, r.productId, r.quantity - 1),
                        )
                      }
                      className="flex h-full w-9 items-center justify-center rounded-l-xl text-slate-700 active:bg-slate-200"
                    >
                      <Minus size={15} aria-hidden />
                    </button>
                    <span className="min-w-7 text-center text-sm font-bold tabular-nums">
                      {r.quantity}
                    </span>
                    <button
                      type="button"
                      aria-label={`Agregar uno de ${r.name}`}
                      onClick={() =>
                        setCarrito(
                          cambiarCantidad(carrito, r.productId, r.quantity + 1),
                        )
                      }
                      className="flex h-full w-9 items-center justify-center rounded-r-xl text-slate-700 active:bg-slate-200"
                    >
                      <Plus size={15} aria-hidden />
                    </button>
                  </div>
                  <p className="text-right tabular-nums">
                    {deRenglon(r.productId) &&
                    deRenglon(r.productId)!.discountMinor !== "0" ? (
                      <span className="block text-xs text-slate-400 line-through">
                        {pesos(
                          BigInt(deRenglon(r.productId)!.totalMinor) +
                            BigInt(deRenglon(r.productId)!.discountMinor),
                        )}
                      </span>
                    ) : null}
                    <span className="text-base font-bold">
                      {deRenglon(r.productId)
                        ? pesos(deRenglon(r.productId)!.totalMinor)
                        : r.priceMinor !== null
                          ? pesos(BigInt(r.priceMinor) * BigInt(r.quantity))
                          : ""}
                    </span>
                  </p>
                </div>
              </div>
            </li>
          ))}
          {cotizacion?.ofertasDeLaCompra.map((oferta) => (
            <MetaDeCompra
              key={oferta.id}
              oferta={oferta}
              totalMinor={cotizacion.totalMinor}
              ahorroMinor={
                cotizacion.aplicadas.find((a) => a.offerId === oferta.id)
                  ?.discountMinor ?? null
              }
            />
          ))}
        </ul>

        <aside className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-4 lg:sticky lg:top-24">
          <div>
            <p className="mb-2 text-sm font-semibold">¿Cómo lo recibís?</p>
            <div className="flex flex-col gap-2 sm:flex-row lg:flex-col">
              {portada.pickupEnabled ? (
                <button
                  type="button"
                  aria-pressed={entrega === "PICKUP"}
                  onClick={() => setEntrega("PICKUP")}
                  className={opcion(entrega === "PICKUP")}
                >
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-white text-teal-700 ring-1 ring-slate-200">
                    <Store size={19} aria-hidden />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold">
                      Retiro en la farmacia
                    </span>
                    <span className="block truncate text-xs text-slate-500">
                      {portada.address || "Pasás a buscarlo"}
                    </span>
                  </span>
                </button>
              ) : null}
              {portada.deliveryEnabled ? (
                <button
                  type="button"
                  aria-pressed={entrega === "DELIVERY"}
                  onClick={() => setEntrega("DELIVERY")}
                  className={opcion(entrega === "DELIVERY")}
                >
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-white text-teal-700 ring-1 ring-slate-200">
                    <Truck size={19} aria-hidden />
                  </span>
                  <span>
                    <span className="block text-sm font-semibold">
                      Envío a domicilio
                    </span>
                    <span className="block text-xs text-slate-500">
                      Te lo llevan a tu dirección
                    </span>
                  </span>
                </button>
              ) : null}
            </div>
          </div>
          {entrega === "DELIVERY" ? (
            <label className="text-sm font-semibold">
              Dirección de entrega
              <input
                value={direccion}
                maxLength={200}
                autoComplete="street-address"
                onChange={(event) => setDireccion(event.target.value)}
                placeholder="Calle, número, piso"
                className="mt-1.5 h-12 w-full rounded-xl border border-slate-200 bg-white px-3 text-[15px] font-normal outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
              />
            </label>
          ) : null}
          <label className="text-sm font-semibold">
            Notas <span className="font-normal text-slate-500">(opcional)</span>
            <textarea
              value={notas}
              maxLength={500}
              rows={2}
              onChange={(event) => setNotas(event.target.value)}
              placeholder="Horario, referencias…"
              className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-[15px] font-normal outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
            />
          </label>
          {ahorro !== "0" ? (
            <div className="flex items-baseline justify-between border-t border-slate-100 pt-3 text-sm font-medium text-emerald-700">
              <span>Ahorro por ofertas</span>
              <span className="tabular-nums">-{pesos(ahorro)}</span>
            </div>
          ) : null}
          <div className="flex items-baseline justify-between border-t border-slate-100 pt-3">
            <span className="text-sm text-slate-600">Total</span>
            <span className="text-2xl font-bold tabular-nums">
              {total !== null ? pesos(total) : "—"}
            </span>
          </div>
          {falla ? (
            <p
              role="alert"
              className="rounded-xl bg-rose-50 p-3 text-sm text-rose-800"
            >
              {falla}
            </p>
          ) : null}
          <div className="hidden lg:block">
            <BotonConfirmar
              slug={slug}
              conUsuario={Boolean(portada.user)}
              habilitado={puedeConfirmar && !enviando}
              enviando={enviando}
              onConfirmar={() => void confirmar()}
            />
          </div>
          <p className="text-xs text-slate-500">
            La farmacia revisa el pedido y te avisa si lo confirma. Pagás al
            retirarlo o al recibirlo.
          </p>
        </aside>
      </div>

      {/* En el celular el botón queda siempre a mano, sobre la barra de abajo. */}
      <div className="fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-20 border-t border-slate-200 bg-white/95 p-3 backdrop-blur-md lg:hidden">
        <div className="mx-auto flex max-w-md items-center gap-3">
          <div className="min-w-0">
            <p className="text-xs text-slate-500">Total</p>
            <p className="text-lg font-bold tabular-nums">
              {total !== null ? pesos(total) : "—"}
            </p>
          </div>
          <div className="flex-1">
            <BotonConfirmar
              slug={slug}
              conUsuario={Boolean(portada.user)}
              habilitado={puedeConfirmar && !enviando}
              enviando={enviando}
              onConfirmar={() => void confirmar()}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function BotonConfirmar({
  slug,
  conUsuario,
  habilitado,
  enviando,
  onConfirmar,
}: {
  slug: string;
  conUsuario: boolean;
  habilitado: boolean;
  enviando: boolean;
  onConfirmar: () => void;
}) {
  if (!conUsuario)
    return (
      <Link
        to={`/${slug}/ingresar?volver=carrito`}
        className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-teal-700 px-4 text-[15px] font-semibold text-white hover:bg-teal-800"
      >
        <LogIn size={18} aria-hidden /> Ingresá para pedir
      </Link>
    );
  return (
    <button
      type="button"
      disabled={!habilitado}
      onClick={onConfirmar}
      className="h-12 w-full rounded-xl bg-teal-700 px-4 text-[15px] font-semibold text-white shadow-sm transition hover:bg-teal-800 active:scale-[0.99] disabled:opacity-60"
    >
      {enviando ? "Enviando…" : "Confirmar pedido"}
    </button>
  );
}

/**
 * Oferta de toda la compra ("desde $X") contada con este carrito: cuánto
 * falta, con una barra de avance, o lo que ya ahorra si lo alcanzó.
 */
function MetaDeCompra({
  oferta,
  totalMinor,
  ahorroMinor,
}: {
  oferta: OfertaDelProducto;
  totalMinor: string;
  /** Lo que descuenta esta oferta en el carrito (null: todavía no aplica). */
  ahorroMinor: string | null;
}) {
  const minimo = BigInt(oferta.minimoMinor ?? "0");
  if (minimo <= 0n) return null;
  // El mínimo se mide sobre la compra antes de este descuento.
  const compra = BigInt(totalMinor) + BigInt(ahorroMinor ?? "0");
  const alcanzada = ahorroMinor !== null && compra >= minimo;
  const avance = Math.min(100, Number((compra * 100n) / minimo));
  return (
    <li
      className={`flex flex-col gap-2 rounded-2xl border p-3.5 ${
        alcanzada
          ? "border-emerald-200 bg-emerald-50"
          : "border-rose-200 bg-rose-50"
      }`}
    >
      <p
        className={`flex items-start gap-2 text-sm ${
          alcanzada ? "text-emerald-900" : "text-rose-900"
        }`}
      >
        {alcanzada ? (
          <PartyPopper size={18} className="mt-0.5 shrink-0" aria-hidden />
        ) : (
          <BadgePercent size={18} className="mt-0.5 shrink-0" aria-hidden />
        )}
        {alcanzada ? (
          <span>
            <b>¡Lograste {oferta.beneficio} en toda tu compra!</b> Ahorrás{" "}
            {pesos(ahorroMinor ?? "0")}.
          </span>
        ) : (
          <span>
            Te faltan <b>{pesos((minimo - compra).toString())}</b> para llevarte{" "}
            <b>{oferta.beneficio}</b> en toda tu compra.
          </span>
        )}
      </p>
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={avance}
        aria-label="Avance hacia el descuento por compra"
        className="h-2 overflow-hidden rounded-full bg-white"
      >
        <div
          className={`h-full rounded-full transition-all duration-500 ${
            alcanzada ? "bg-emerald-500" : "bg-rose-500"
          }`}
          style={{ width: `${avance}%` }}
        />
      </div>
      {!alcanzada ? (
        <p className="text-xs text-rose-800">
          Llevás {pesos(compra.toString())} de {pesos(minimo.toString())}.
        </p>
      ) : null}
    </li>
  );
}
