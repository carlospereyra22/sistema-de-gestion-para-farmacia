import { useRef, useState } from "react";
import {
  Ban,
  CheckCircle2,
  Clock,
  MessageCircle,
  Navigation,
  Pencil,
  Phone,
  Share2,
  Store,
  MapPin,
  Package,
  Truck,
  Undo2,
  Wallet,
} from "lucide-react";

import {
  preventaApi,
  type ContextoPreventa,
  type MedioCobro,
  type MiembroEquipo,
  type PedidoPreventa,
} from "./lib/preventa-api";
import { compartirComprobante } from "./lib/preventa-comprobante";
import {
  COBROS,
  EFECTOS,
  ESTADOS,
  MEDIOS,
  fechaHora,
  linkMapa,
  mensajeDe,
  numeroDePedido,
  pesos,
  pesosACentavos,
  saldoDelPedido,
  telefonoWhatsapp,
  textoDelPedido,
} from "./lib/preventa";
import { useEsMovil } from "./lib/preventa-movil";
import { ProductFilterSelect } from "./product-filter-select";
import {
  Aviso,
  Hoja,
  MenuAcciones,
  PantallaCompleta,
  Pastilla,
  TarjetaEtiquetada,
  type AccionMenu,
  Segmento,
  botonPeligro,
  botonPrimario,
  botonSecundario,
  campo,
} from "./preventa-ui";

/**
 * Detalle de un pedido de preventa (SISTEMA-108) con lo que cada uno puede
 * hacer: compartir el comprobante, editarlo, cancelarlo, pasarlo a reparto,
 * entregarlo y cobrarlo. La API decide si la acción vale.
 */
export function PreventaPedidoDetalle({
  token,
  organizationId,
  contexto,
  pedido,
  equipo,
  onCambio,
  onEditar,
  onClose,
}: {
  token: string;
  organizationId: string;
  contexto: ContextoPreventa;
  pedido: PedidoPreventa;
  equipo: MiembroEquipo[];
  onCambio: (pedido: PedidoPreventa, mensaje: string) => void;
  onEditar: (pedido: PedidoPreventa) => void;
  onClose: () => void;
}) {
  const [accion, setAccion] = useState<
    "entregar" | "cobrar" | "cancelar" | "noEntregado" | "asignar" | null
  >(null);
  const [error, setError] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const movil = useEsMovil();
  const { permisos, usuario } = contexto;
  const esMio = pedido.sellerId === usuario.id;
  const loReparto =
    permisos.administrar ||
    (permisos.repartir &&
      (pedido.delivererId === usuario.id || !pedido.delivererId));
  const saldo = saldoDelPedido(pedido);
  const whatsapp = telefonoWhatsapp(pedido.customerPhone);
  const mapa = linkMapa({ ...pedido, address: pedido.deliveryAddress });
  const datosComprobante = {
    ...contexto.comprobante,
    nota: contexto.ajustes.receiptNote,
  };

  const hacer = async (
    trabajo: () => Promise<PedidoPreventa>,
    mensaje: string,
  ) => {
    setOcupado(true);
    setError("");
    try {
      onCambio(await trabajo(), mensaje);
      setAccion(null);
    } catch (causa) {
      setError(mensajeDe(causa));
    } finally {
      setOcupado(false);
    }
  };

  const compartir = async () => {
    try {
      await compartirComprobante(pedido, datosComprobante);
    } catch (causa) {
      setError(mensajeDe(causa));
    }
  };
  const linkWhatsapp = `https://wa.me/${whatsapp ?? ""}?text=${encodeURIComponent(
    textoDelPedido(pedido, datosComprobante),
  )}`;
  const abierto =
    pedido.status === "PENDING" || pedido.status === "IN_DELIVERY";
  // Las acciones que valen para este pedido y este usuario (la API decide igual).
  const acciones: AccionMenu[] = [
    ...(pedido.status === "PENDING" &&
    (esMio || permisos.administrar) &&
    permisos.vender
      ? [
          {
            label: "Editar",
            icono: <Pencil size={18} aria-hidden />,
            onClick: () => onEditar(pedido),
          },
        ]
      : []),
    {
      label: "Compartir imagen",
      icono: <Share2 size={18} aria-hidden />,
      onClick: () => void compartir(),
    },
    {
      label: "Enviar por WhatsApp",
      icono: <MessageCircle size={18} aria-hidden />,
      onClick: () => window.open(linkWhatsapp, "_blank", "noopener"),
    },
    ...(permisos.administrar && abierto
      ? [
          {
            label: pedido.delivererId
              ? "Cambiar repartidor"
              : "Pasar a reparto",
            icono: <Truck size={18} aria-hidden />,
            onClick: () => setAccion("asignar"),
          },
        ]
      : []),
    ...(pedido.status === "PENDING" &&
    permisos.repartir &&
    !permisos.administrar
      ? [
          {
            label: "Llevarlo yo",
            icono: <Truck size={18} aria-hidden />,
            onClick: () =>
              void hacer(async () => {
                await preventaApi.asignar(
                  token,
                  organizationId,
                  [pedido.id],
                  usuario.id,
                );
                return preventaApi.pedido(token, organizationId, pedido.id);
              }, "Lo agregaste a tu reparto."),
          },
        ]
      : []),
    ...(pedido.status === "IN_DELIVERY" && loReparto
      ? [
          {
            label: "No se pudo entregar",
            icono: <Clock size={18} aria-hidden />,
            onClick: () => setAccion("noEntregado"),
          },
        ]
      : []),
    ...(pedido.status === "IN_DELIVERY" && permisos.administrar
      ? [
          {
            label: "Quitar del reparto",
            icono: <Undo2 size={18} aria-hidden />,
            onClick: () =>
              void hacer(
                () =>
                  preventaApi.quitarDelReparto(token, organizationId, pedido),
                "Volvió a pendientes.",
              ),
          },
        ]
      : []),
    ...((pedido.status === "PENDING" && (esMio || permisos.administrar)) ||
    (pedido.status === "IN_DELIVERY" && permisos.administrar)
      ? [
          {
            label: "Cancelar pedido",
            icono: <Ban size={18} aria-hidden />,
            onClick: () => setAccion("cancelar"),
            peligro: true,
          },
        ]
      : []),
  ];
  const puedeEntregar = loReparto && abierto;
  const puedeCobrar =
    pedido.status === "DELIVERED" &&
    saldo > 0n &&
    pedido.deliveryEffect !== "SALE" &&
    (permisos.repartir || permisos.administrar);
  const principal = puedeEntregar ? (
    <button
      type="button"
      className={`${botonPrimario} min-h-12 w-full text-base`}
      onClick={() => setAccion("entregar")}
    >
      <CheckCircle2 size={20} aria-hidden /> Entregar y cobrar ·{" "}
      {pesos(pedido.totalMinor)}
    </button>
  ) : puedeCobrar ? (
    <button
      type="button"
      className={`${botonPrimario} min-h-12 w-full text-base`}
      onClick={() => setAccion("cobrar")}
    >
      <Wallet size={20} aria-hidden /> Registrar cobro · falta {pesos(saldo)}
    </button>
  ) : null;

  const cuerpo = (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Pastilla tono={ESTADOS[pedido.status].tono}>
          {ESTADOS[pedido.status].label}
        </Pastilla>
        {pedido.status === "DELIVERED" ? (
          <Pastilla tono={COBROS[pedido.paymentStatus].tono}>
            {COBROS[pedido.paymentStatus].label}
          </Pastilla>
        ) : null}
        <span className="text-xs text-slate-500">
          {fechaHora(pedido.createdAt)}
          {pedido.sellerName ? ` · Vend.: ${pedido.sellerName}` : ""}
        </span>
      </div>

      <TarjetaEtiquetada
        etiqueta="Cliente"
        icono={<Store size={12} aria-hidden />}
      >
        <p className="text-base font-bold text-slate-900">
          {pedido.customerName}
        </p>
        <p className="flex items-center gap-1 text-sm text-slate-600">
          <MapPin size={14} className="shrink-0 text-slate-400" aria-hidden />
          {pedido.deliveryAddress ?? "Sin dirección de entrega"}
        </p>
        {pedido.reference ? (
          <p className="text-xs text-slate-500">{pedido.reference}</p>
        ) : null}
        <div className="mt-2 flex flex-wrap gap-2">
          {pedido.customerPhone ? (
            <a
              href={`tel:${pedido.customerPhone}`}
              className={`${botonSecundario} min-h-10`}
            >
              <Phone size={16} aria-hidden /> Llamar
            </a>
          ) : null}
          {mapa ? (
            <a
              href={mapa}
              target="_blank"
              rel="noreferrer"
              className={`${botonSecundario} min-h-10`}
            >
              <Navigation size={16} aria-hidden /> Cómo llegar
            </a>
          ) : null}
        </div>
      </TarjetaEtiquetada>

      {pedido.notes ? <Aviso tipo="info">Nota: {pedido.notes}</Aviso> : null}
      {pedido.deliveryNote && pedido.status !== "DELIVERED" ? (
        <Aviso tipo="info">Último intento: {pedido.deliveryNote}</Aviso>
      ) : null}
      {pedido.cancelReason ? (
        <Aviso tipo="error">Cancelado: {pedido.cancelReason}</Aviso>
      ) : null}

      <section>
        <h3 className="mb-2 flex items-center gap-2 text-lg font-bold text-slate-900">
          <span className="grid size-8 place-items-center rounded-lg bg-amber-100 text-amber-700">
            <Package size={18} aria-hidden />
          </span>
          Artículos
          <span className="rounded-full bg-slate-100 px-2 text-sm text-slate-600">
            {pedido.items.length}
          </span>
        </h3>
        <ul className="grid gap-2">
          {pedido.items.map((item) => (
            <li
              key={item.productId}
              className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm"
            >
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-slate-900">
                  {item.productName}
                </p>
                <p className="text-sm text-slate-500">
                  {item.quantity} x {pesos(item.unitPriceMinor)}
                  {item.unitPriceMinor !== item.listUnitPriceMinor ? (
                    <span className="ml-1 text-xs line-through">
                      {pesos(item.listUnitPriceMinor)}
                    </span>
                  ) : null}
                </p>
                {BigInt(item.discountMinor) > 0n ? (
                  <p className="text-xs font-semibold text-emerald-700">
                    Oferta -{pesos(item.discountMinor)}
                  </p>
                ) : null}
              </div>
              <p className="text-base font-bold tabular-nums text-emerald-700">
                {pesos(item.totalMinor)}
              </p>
            </li>
          ))}
        </ul>
        {pedido.offers.length ? (
          <div className="mt-2 flex flex-wrap gap-1">
            {pedido.offers.map((o) => (
              <Pastilla key={`${o.label}-${o.name}`} tono="aviso">
                {o.label} · -{pesos(o.discountMinor)}
              </Pastilla>
            ))}
          </div>
        ) : null}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <p className="flex items-baseline justify-between">
          <span className="text-sm font-semibold text-slate-700">Total</span>
          <span className="text-2xl font-bold tabular-nums text-slate-900">
            {pesos(pedido.totalMinor)}
          </span>
        </p>
        {pedido.payments.map((pago) => (
          <p
            key={pago.createdAt}
            className="flex justify-between text-sm text-slate-600"
          >
            <span>
              Cobrado {MEDIOS[pago.method as MedioCobro] ?? "a cuenta"} ·{" "}
              {fechaHora(pago.createdAt)}
            </span>
            <span className="tabular-nums">{pesos(pago.amountMinor)}</span>
          </p>
        ))}
        {pedido.status === "DELIVERED" && saldo > 0n ? (
          <p className="flex justify-between text-sm font-semibold text-rose-700">
            <span>
              {pedido.deliveryEffect === "SALE"
                ? "A cuenta corriente"
                : "Falta cobrar"}
            </span>
            <span className="tabular-nums">{pesos(saldo)}</span>
          </p>
        ) : null}
        {pedido.deliveryEffect ? (
          <p className="mt-2 text-xs text-slate-500">
            Al entregarlo: {EFECTOS[pedido.deliveryEffect].label.toLowerCase()}.
          </p>
        ) : null}
        {pedido.delivererName ? (
          <p className="mt-1 flex items-center gap-1.5 text-xs text-slate-500">
            <Truck size={14} aria-hidden />
            {pedido.status === "DELIVERED" ? "Entregó" : "Reparte"}:{" "}
            {pedido.delivererName}
          </p>
        ) : null}
      </section>

      {error ? <Aviso tipo="error">{error}</Aviso> : null}

      {!movil ? (
        <div className="flex flex-wrap gap-2">
          {acciones.map((a) => (
            <button
              key={a.label}
              type="button"
              disabled={ocupado}
              onClick={a.onClick}
              className={a.peligro ? botonPeligro : botonSecundario}
            >
              {a.icono} {a.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );

  const dialogos = (
    <>
      {accion === "entregar" ? (
        <DialogoEntrega
          pedido={pedido}
          contexto={contexto}
          onClose={() => setAccion(null)}
          onConfirmar={(datos) =>
            preventaApi
              .entregar(token, organizationId, pedido, datos)
              .then((nuevo) => {
                onCambio(nuevo, "Pedido entregado.");
                setAccion(null);
              })
          }
        />
      ) : null}
      {accion === "cobrar" ? (
        <DialogoCobro
          titulo="Registrar cobro"
          maximo={saldo}
          onClose={() => setAccion(null)}
          onConfirmar={(datos) =>
            preventaApi
              .cobrar(token, organizationId, pedido.id, datos)
              .then((nuevo) => {
                onCambio(nuevo, "Cobro registrado.");
                setAccion(null);
              })
          }
        />
      ) : null}
      {accion === "cancelar" || accion === "noEntregado" ? (
        <DialogoMotivo
          titulo={
            accion === "cancelar" ? "Cancelar pedido" : "No se pudo entregar"
          }
          detalle={
            accion === "cancelar"
              ? "El pedido no se entrega. Queda en el historial como cancelado."
              : "El pedido vuelve a pendientes para otro día."
          }
          sugerencias={
            accion === "cancelar"
              ? ["El cliente no lo quiere", "Pedido duplicado", "Sin stock"]
              : ["Estaba cerrado", "No tenía para pagar", "No lo encontré"]
          }
          peligro={accion === "cancelar"}
          onClose={() => setAccion(null)}
          onConfirmar={(motivo) =>
            hacer(
              () =>
                accion === "cancelar"
                  ? preventaApi.cancelar(token, organizationId, pedido, motivo)
                  : preventaApi.noEntregado(
                      token,
                      organizationId,
                      pedido,
                      motivo,
                    ),
              accion === "cancelar"
                ? "Pedido cancelado."
                : "Volvió a pendientes.",
            )
          }
        />
      ) : null}
      {accion === "asignar" ? (
        <DialogoAsignar
          equipo={equipo}
          actual={pedido.delivererId}
          onClose={() => setAccion(null)}
          onConfirmar={(delivererId) =>
            hacer(async () => {
              await preventaApi.asignar(
                token,
                organizationId,
                [pedido.id],
                delivererId,
              );
              return preventaApi.pedido(token, organizationId, pedido.id);
            }, "Pedido en reparto.")
          }
        />
      ) : null}
    </>
  );

  if (movil)
    return (
      <PantallaCompleta
        titulo={`Pedido ${numeroDePedido(pedido.number)}`}
        onVolver={onClose}
        acciones={<MenuAcciones acciones={acciones} />}
        pie={
          principal ?? (
            <div className="flex min-h-12 items-center justify-center rounded-2xl bg-emerald-700 text-lg font-bold text-white">
              Total: {pesos(pedido.totalMinor)}
            </div>
          )
        }
      >
        {cuerpo}
        {dialogos}
      </PantallaCompleta>
    );

  return (
    <Hoja
      titulo={`Pedido ${numeroDePedido(pedido.number)}`}
      onClose={onClose}
      ancho="max-w-2xl"
      pie={principal}
    >
      {cuerpo}
      {dialogos}
    </Hoja>
  );
}

/** Entregar: cuánto pagó y con qué. Lo que falta queda debiendo. */
export function DialogoEntrega({
  pedido,
  contexto,
  onClose,
  onConfirmar,
}: {
  pedido: PedidoPreventa;
  contexto: ContextoPreventa;
  onClose: () => void;
  onConfirmar: (datos: {
    requestId: string;
    collectedMinor: string;
    method: MedioCobro;
  }) => Promise<void>;
}) {
  const requestId = useRef(crypto.randomUUID());
  const total = BigInt(pedido.totalMinor);
  const [modo, setModo] = useState<"todo" | "parte" | "nada">("todo");
  const [texto, setTexto] = useState("");
  const [medio, setMedio] = useState<MedioCobro>("CASH");
  const [error, setError] = useState("");
  const [enviando, setEnviando] = useState(false);
  const parcial = pesosACentavos(texto);
  const cobrado =
    modo === "todo" ? total : modo === "nada" ? 0n : BigInt(parcial ?? 0);
  const debe = total > cobrado ? total - cobrado : 0n;
  const efecto = contexto.ajustes.deliveryEffect;
  const sinCuenta =
    efecto === "SALE" && debe > 0n && !pedido.customerCreditEnabled;
  const invalido = modo === "parte" && (parcial === null || parcial <= 0);
  return (
    <Hoja
      titulo="Entregar pedido"
      onClose={onClose}
      pie={
        <button
          type="button"
          className={`${botonPrimario} min-h-12 w-full`}
          disabled={enviando || invalido || sinCuenta}
          onClick={async () => {
            setEnviando(true);
            setError("");
            try {
              await onConfirmar({
                requestId: requestId.current,
                collectedMinor: cobrado.toString(),
                method: medio,
              });
            } catch (causa) {
              setError(mensajeDe(causa));
            } finally {
              setEnviando(false);
            }
          }}
        >
          <CheckCircle2 size={18} aria-hidden />
          {enviando
            ? "Registrando…"
            : `Confirmar entrega${cobrado > 0n ? ` · ${pesos(cobrado)}` : ""}`}
        </button>
      }
    >
      <div className="grid gap-3">
        <div className="rounded-2xl bg-slate-50 p-3">
          <p className="text-sm text-slate-600">{pedido.customerName}</p>
          <p className="text-2xl font-bold tabular-nums text-slate-900">
            {pesos(total)}
          </p>
        </div>
        <Segmento
          etiqueta="Cuánto pagó"
          valor={modo}
          onChange={setModo}
          opciones={[
            { id: "todo", label: "Pagó todo" },
            { id: "parte", label: "Una parte" },
            { id: "nada", label: "No pagó" },
          ]}
        />
        {modo === "parte" ? (
          <label className="text-sm font-medium text-slate-700">
            Importe que pagó
            <input
              className={`${campo} text-lg font-bold tabular-nums`}
              inputMode="decimal"
              autoFocus
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              placeholder="0,00"
            />
          </label>
        ) : null}
        {modo !== "nada" ? (
          <Segmento
            etiqueta="Medio de pago"
            valor={medio}
            onChange={setMedio}
            opciones={(Object.keys(MEDIOS) as MedioCobro[]).map((m) => ({
              id: m,
              label: MEDIOS[m],
            }))}
          />
        ) : null}
        {debe > 0n ? (
          <p className="flex justify-between rounded-xl bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-800">
            <span>
              {efecto === "SALE"
                ? "Va a su cuenta corriente"
                : "Queda debiendo"}
            </span>
            <span className="tabular-nums">{pesos(debe)}</span>
          </p>
        ) : null}
        {sinCuenta ? (
          <Aviso tipo="error">
            {pedido.customerName} no tiene cuenta corriente: tiene que pagar el
            total. La farmacia la habilita desde Clientes.
          </Aviso>
        ) : null}
        <p className="text-xs text-slate-500">{EFECTOS[efecto].detalle}</p>
        {error ? <Aviso tipo="error">{error}</Aviso> : null}
      </div>
    </Hoja>
  );
}

function DialogoCobro({
  titulo,
  maximo,
  onClose,
  onConfirmar,
}: {
  titulo: string;
  maximo: bigint;
  onClose: () => void;
  onConfirmar: (datos: {
    requestId: string;
    amountMinor: string;
    method: MedioCobro;
  }) => Promise<void>;
}) {
  const requestId = useRef(crypto.randomUUID());
  const [texto, setTexto] = useState(
    (Number(maximo) / 100).toLocaleString("es-AR"),
  );
  const [medio, setMedio] = useState<MedioCobro>("CASH");
  const [error, setError] = useState("");
  const [enviando, setEnviando] = useState(false);
  const importe = pesosACentavos(texto);
  const invalido = importe === null || importe <= 0 || BigInt(importe) > maximo;
  return (
    <Hoja
      titulo={titulo}
      onClose={onClose}
      pie={
        <button
          type="button"
          className={`${botonPrimario} min-h-12 w-full`}
          disabled={enviando || invalido}
          onClick={async () => {
            setEnviando(true);
            setError("");
            try {
              await onConfirmar({
                requestId: requestId.current,
                amountMinor: String(importe),
                method: medio,
              });
            } catch (causa) {
              setError(mensajeDe(causa));
            } finally {
              setEnviando(false);
            }
          }}
        >
          <Wallet size={18} aria-hidden /> Registrar
        </button>
      }
    >
      <div className="grid gap-3">
        <p className="text-sm text-slate-600">Falta cobrar {pesos(maximo)}.</p>
        <label className="text-sm font-medium text-slate-700">
          Importe
          <input
            className={`${campo} text-lg font-bold tabular-nums`}
            inputMode="decimal"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
          />
        </label>
        <Segmento
          etiqueta="Medio de pago"
          valor={medio}
          onChange={setMedio}
          opciones={(Object.keys(MEDIOS) as MedioCobro[]).map((m) => ({
            id: m,
            label: MEDIOS[m],
          }))}
        />
        {invalido && texto ? (
          <p className="text-xs text-rose-700">
            El importe tiene que ser mayor a cero y no superar lo que falta.
          </p>
        ) : null}
        {error ? <Aviso tipo="error">{error}</Aviso> : null}
      </div>
    </Hoja>
  );
}

function DialogoMotivo({
  titulo,
  detalle,
  sugerencias,
  peligro,
  onClose,
  onConfirmar,
}: {
  titulo: string;
  detalle: string;
  sugerencias: string[];
  peligro: boolean;
  onClose: () => void;
  onConfirmar: (motivo: string) => Promise<void>;
}) {
  const [motivo, setMotivo] = useState("");
  const [enviando, setEnviando] = useState(false);
  return (
    <Hoja
      titulo={titulo}
      onClose={onClose}
      pie={
        <div className="flex gap-2">
          <button
            type="button"
            className={`${botonSecundario} flex-1`}
            onClick={onClose}
          >
            Volver
          </button>
          <button
            type="button"
            className={`${peligro ? botonPeligro : botonPrimario} flex-1`}
            disabled={enviando || motivo.trim().length < 3}
            onClick={async () => {
              setEnviando(true);
              await onConfirmar(motivo.trim());
              setEnviando(false);
            }}
          >
            Confirmar
          </button>
        </div>
      }
    >
      <p className="text-sm text-slate-600">{detalle}</p>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {sugerencias.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setMotivo(s)}
            className="rounded-full border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
          >
            {s}
          </button>
        ))}
      </div>
      <label className="mt-3 block text-sm font-medium text-slate-700">
        Motivo
        <input
          className={campo}
          maxLength={300}
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
        />
      </label>
    </Hoja>
  );
}

export function DialogoAsignar({
  equipo,
  actual,
  cantidad = 1,
  onClose,
  onConfirmar,
}: {
  equipo: MiembroEquipo[];
  actual: string | null;
  cantidad?: number;
  onClose: () => void;
  onConfirmar: (delivererId: string) => Promise<void>;
}) {
  const repartidores = equipo.filter((m) => m.reparte);
  const [elegido, setElegido] = useState(
    actual ?? repartidores[0]?.userId ?? "",
  );
  const [enviando, setEnviando] = useState(false);
  return (
    <Hoja
      titulo={
        cantidad > 1 ? `Pasar ${cantidad} pedidos a reparto` : "Pasar a reparto"
      }
      onClose={onClose}
      pie={
        <button
          type="button"
          className={`${botonPrimario} min-h-12 w-full`}
          disabled={!elegido || enviando}
          onClick={async () => {
            setEnviando(true);
            await onConfirmar(elegido);
            setEnviando(false);
          }}
        >
          <Truck size={18} aria-hidden /> Asignar
        </button>
      }
    >
      {repartidores.length ? (
        <div className="text-sm font-medium text-slate-700">
          Repartidor
          <div className="mt-1">
            <ProductFilterSelect
              label="Repartidor"
              value={elegido}
              icon={<Truck size={16} aria-hidden />}
              options={repartidores.map((m) => ({
                value: m.userId,
                label: m.name,
              }))}
              onChange={setElegido}
            />
          </div>
        </div>
      ) : (
        <Aviso tipo="info">
          No hay usuarios con el rol Repartidor. Asignalo a alguien desde
          Administración → Usuarios.
        </Aviso>
      )}
    </Hoja>
  );
}
