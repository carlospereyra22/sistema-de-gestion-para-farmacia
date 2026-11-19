import { lazy, Suspense, useEffect, useState } from "react";
import {
  CalendarDays,
  Crosshair,
  MapPin,
  MessageCircle,
  Navigation,
  Pencil,
  Phone,
  Search,
  ShoppingCart,
  Store,
  UserPlus,
  UserRound,
} from "lucide-react";

import {
  preventaApi,
  type ClientePreventa,
  type ContextoPreventa,
  type MiembroEquipo,
} from "./lib/preventa-api";
import {
  DIAS,
  cambiarDia,
  diasDeVisita,
  fecha,
  linkMapa,
  mensajeDe,
  pesos,
  telefonoWhatsapp,
  tieneDia,
} from "./lib/preventa";
import { clienteCoincide } from "./lib/preventa-borrador";
import { ProductFilterSelect } from "./product-filter-select";
import {
  Aviso,
  Hoja,
  Pastilla,
  Segmento,
  Vacio,
  botonIcono,
  botonPrimario,
  botonSecundario,
  campo,
} from "./preventa-ui";

const PreventaMapa = lazy(() => import("./preventa-mapa"));

/**
 * Cartera de clientes de la preventa (SISTEMA-108): dirección de entrega,
 * ubicación en el mapa, días de visita y preventista asignado. El alta y la
 * cuenta corriente completa siguen en Clientes.
 */
export function PreventaClientes({
  token,
  organizationId,
  contexto,
  onNuevoPedido,
}: {
  token: string;
  organizationId: string;
  contexto: ContextoPreventa;
  onNuevoPedido?: (cliente: ClientePreventa) => void;
}) {
  const [q, setQ] = useState("");
  const [vista, setVista] = useState<"todos" | "hoy" | "mios">("todos");
  const [clientes, setClientes] = useState<ClientePreventa[]>([]);
  const [equipo, setEquipo] = useState<MiembroEquipo[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [editando, setEditando] = useState<ClientePreventa | "nuevo" | null>(
    null,
  );
  const [recarga, setRecarga] = useState(0);

  useEffect(() => {
    if (!contexto.permisos.administrar) return;
    preventaApi
      .equipo(token, organizationId)
      .then(setEquipo)
      .catch(() => setEquipo([]));
  }, [token, organizationId, contexto.permisos.administrar]);

  useEffect(() => {
    let vigente = true;
    setCargando(true);
    const espera = window.setTimeout(() => {
      preventaApi
        .clientes(token, organizationId, {
          hoy: vista === "hoy",
          vendedor: vista === "mios" ? contexto.usuario.id : undefined,
        })
        .then((lista) => vigente && (setClientes(lista), setError("")))
        .catch((causa) => vigente && setError(mensajeDe(causa)))
        .finally(() => vigente && setCargando(false));
    }, 250);
    return () => {
      vigente = false;
      window.clearTimeout(espera);
    };
  }, [token, organizationId, vista, recarga, contexto.usuario.id]);
  // Se busca en el teléfono: sin tildes, por nombre, dirección o teléfono.
  const visibles = clientes.filter((c) => clienteCoincide(c, q));

  const puedeEditar =
    contexto.permisos.vender ||
    contexto.permisos.administrar ||
    contexto.permisos.repartir;

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
        {contexto.permisos.vender ? (
          <button
            type="button"
            onClick={() => setEditando("nuevo")}
            className={`${botonPrimario} shrink-0`}
          >
            <UserPlus size={18} aria-hidden />
            <span className="hidden sm:inline">Nuevo cliente</span>
          </button>
        ) : null}
      </div>
      <Segmento
        etiqueta="Qué clientes ver"
        valor={vista}
        onChange={setVista}
        opciones={[
          { id: "todos", label: "Todos" },
          { id: "hoy", label: "Visitar hoy" },
          ...(contexto.permisos.vender
            ? [{ id: "mios" as const, label: "Mi cartera" }]
            : []),
        ]}
      />
      {error ? <Aviso tipo="error">{error}</Aviso> : null}
      {!cargando && !visibles.length ? (
        <Vacio
          icono={<Store size={22} aria-hidden />}
          titulo="No hay clientes para mostrar"
          detalle={
            vista === "hoy"
              ? "Cargá los días de visita de cada cliente para armar tu recorrido del día."
              : undefined
          }
        />
      ) : null}
      <ul className="grid gap-2 lg:grid-cols-2">
        {visibles.map((cliente) => {
          const whatsapp = telefonoWhatsapp(cliente.phone);
          const mapa = linkMapa(cliente);
          return (
            <li
              key={cliente.id}
              className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm"
            >
              <div className="flex items-start gap-3">
                <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-teal-50 text-sm font-bold text-teal-800">
                  {cliente.name.slice(0, 2).toUpperCase()}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-slate-900">
                    {cliente.name}
                  </p>
                  <p className="truncate text-xs text-slate-500">
                    {cliente.address ?? "Sin dirección de entrega"}
                  </p>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-slate-500">
                    <span className="inline-flex items-center gap-1">
                      <CalendarDays size={12} aria-hidden />
                      {diasDeVisita(cliente.visitDays)}
                    </span>
                    {cliente.sellerName ? (
                      <span className="inline-flex items-center gap-1">
                        <UserRound size={12} aria-hidden />
                        {cliente.sellerName}
                      </span>
                    ) : null}
                    {cliente.lastOrderAt ? (
                      <span>Último pedido {fecha(cliente.lastOrderAt)}</span>
                    ) : null}
                  </div>
                </div>
                {cliente.balanceMinor !== null ? (
                  BigInt(cliente.balanceMinor) > 0n ? (
                    <Pastilla tono="mal">
                      Debe {pesos(cliente.balanceMinor)}
                    </Pastilla>
                  ) : cliente.creditEnabled ? (
                    <Pastilla tono="bien">Al día</Pastilla>
                  ) : null
                ) : null}
              </div>
              <div className="mt-3 flex gap-2">
                {onNuevoPedido && contexto.permisos.vender ? (
                  <button
                    type="button"
                    className={`${botonPrimario} min-h-10 min-w-0 flex-1 px-3`}
                    onClick={() => onNuevoPedido(cliente)}
                  >
                    <ShoppingCart size={16} aria-hidden /> Pedido
                  </button>
                ) : null}
                {whatsapp ? (
                  <a
                    href={`https://wa.me/${whatsapp}`}
                    target="_blank"
                    rel="noreferrer"
                    aria-label={`WhatsApp a ${cliente.name}`}
                    className={botonIcono}
                  >
                    <MessageCircle size={16} aria-hidden />
                  </a>
                ) : null}
                {cliente.phone ? (
                  <a
                    href={`tel:${cliente.phone}`}
                    aria-label={`Llamar a ${cliente.name}`}
                    className={botonIcono}
                  >
                    <Phone size={16} aria-hidden />
                  </a>
                ) : null}
                {mapa ? (
                  <a
                    href={mapa}
                    target="_blank"
                    rel="noreferrer"
                    aria-label={`Ver en el mapa a ${cliente.name}`}
                    className={botonIcono}
                  >
                    <Navigation size={16} aria-hidden />
                  </a>
                ) : null}
                {puedeEditar ? (
                  <button
                    type="button"
                    aria-label={`Editar ${cliente.name}`}
                    className={botonIcono}
                    onClick={() => setEditando(cliente)}
                  >
                    <Pencil size={16} aria-hidden />
                  </button>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
      {editando ? (
        <PreventaClienteEditor
          token={token}
          organizationId={organizationId}
          contexto={contexto}
          equipo={equipo}
          cliente={editando === "nuevo" ? null : editando}
          onClose={() => setEditando(null)}
          onGuardado={() => {
            setEditando(null);
            setRecarga((n) => n + 1);
          }}
        />
      ) : null}
    </div>
  );
}

/** Alta rápida o datos de preventa de un cliente. */
export function PreventaClienteEditor({
  token,
  organizationId,
  contexto,
  equipo,
  cliente,
  onClose,
  onGuardado,
}: {
  token: string;
  organizationId: string;
  contexto: ContextoPreventa;
  equipo: MiembroEquipo[];
  cliente: ClientePreventa | null;
  onClose: () => void;
  onGuardado: (cliente: ClientePreventa | null) => void;
}) {
  const [name, setName] = useState(cliente?.name ?? "");
  const [document, setDocument] = useState("");
  const [phone, setPhone] = useState(cliente?.phone ?? "");
  const [address, setAddress] = useState(cliente?.address ?? "");
  const [reference, setReference] = useState(cliente?.reference ?? "");
  const [visitDays, setVisitDays] = useState(cliente?.visitDays ?? 0);
  const [sellerId, setSellerId] = useState(cliente?.sellerId ?? "");
  const [ubicacion, setUbicacion] = useState<{
    latitude: number;
    longitude: number;
  } | null>(
    cliente?.latitude != null && cliente.longitude != null
      ? { latitude: cliente.latitude, longitude: cliente.longitude }
      : null,
  );
  const [verMapa, setVerMapa] = useState(false);
  const [buscando, setBuscando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");

  const usarMiUbicacion = () => {
    if (!navigator.geolocation) {
      setError("Este teléfono no comparte la ubicación.");
      return;
    }
    setBuscando(true);
    navigator.geolocation.getCurrentPosition(
      (posicion) => {
        setUbicacion({
          latitude: Number(posicion.coords.latitude.toFixed(6)),
          longitude: Number(posicion.coords.longitude.toFixed(6)),
        });
        setVerMapa(true);
        setBuscando(false);
      },
      () => {
        setError(
          "No pudimos leer tu ubicación. Revisá el permiso del navegador.",
        );
        setBuscando(false);
      },
      { enableHighAccuracy: true, timeout: 15_000 },
    );
  };

  const guardar = async () => {
    setGuardando(true);
    setError("");
    const datos = {
      address: address.trim() || null,
      reference: reference.trim() || null,
      phone: phone.trim() || null,
      latitude: ubicacion?.latitude ?? null,
      longitude: ubicacion?.longitude ?? null,
      visitDays,
      ...(contexto.permisos.administrar ? { sellerId: sellerId || null } : {}),
    };
    try {
      if (cliente) {
        await preventaApi.guardarCliente(
          token,
          organizationId,
          cliente.id,
          datos,
        );
        onGuardado(null);
      } else {
        const nuevo = await preventaApi.crearCliente(token, organizationId, {
          ...datos,
          name: name.trim(),
          document: document.trim() || null,
        });
        onGuardado({
          id: nuevo.id,
          name: nuevo.name,
          document: document.trim() || null,
          address: datos.address,
          reference: datos.reference,
          phone: datos.phone,
          latitude: datos.latitude,
          longitude: datos.longitude,
          visitDays,
          sellerId: contexto.usuario.id,
          sellerName: contexto.usuario.nombre,
          priceListName: null,
          creditEnabled: false,
          balanceMinor: null,
          lastOrderAt: null,
        });
      }
    } catch (causa) {
      setError(mensajeDe(causa));
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Hoja
      titulo={cliente ? cliente.name : "Nuevo cliente"}
      onClose={onClose}
      ancho="max-w-2xl"
      pie={
        <div className="flex gap-2">
          <button
            type="button"
            className={`${botonSecundario} flex-1`}
            onClick={onClose}
          >
            Cancelar
          </button>
          <button
            type="button"
            className={`${botonPrimario} flex-1`}
            disabled={guardando || (!cliente && !name.trim())}
            onClick={() => void guardar()}
          >
            {guardando ? "Guardando…" : "Guardar"}
          </button>
        </div>
      }
    >
      <div className="grid gap-3">
        {!cliente ? (
          <>
            <label className="text-sm font-medium text-slate-700">
              Nombre del comercio
              <input
                className={campo}
                value={name}
                maxLength={160}
                autoFocus
                onChange={(e) => setName(e.target.value)}
                placeholder="Ej.: Kiosco San Martín"
              />
            </label>
            <label className="text-sm font-medium text-slate-700">
              CUIT o DNI (opcional)
              <input
                className={campo}
                value={document}
                maxLength={40}
                inputMode="numeric"
                onChange={(e) => setDocument(e.target.value)}
              />
            </label>
          </>
        ) : null}
        <label className="text-sm font-medium text-slate-700">
          Teléfono
          <input
            className={campo}
            value={phone}
            maxLength={40}
            inputMode="tel"
            onChange={(e) => setPhone(e.target.value)}
            placeholder="Para WhatsApp y llamadas"
          />
        </label>
        <label className="text-sm font-medium text-slate-700">
          Dirección de entrega
          <input
            className={campo}
            value={address}
            maxLength={200}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="Calle, número y barrio"
          />
        </label>
        <label className="text-sm font-medium text-slate-700">
          Referencia
          <input
            className={campo}
            value={reference}
            maxLength={300}
            onChange={(e) => setReference(e.target.value)}
            placeholder="Ej.: portón verde, al lado de la panadería"
          />
        </label>
        <fieldset>
          <legend className="text-sm font-medium text-slate-700">
            Días de visita
          </legend>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {DIAS.map((d) => (
              <button
                key={d.bit}
                type="button"
                aria-pressed={tieneDia(visitDays, d.bit)}
                aria-label={d.largo}
                onClick={() => setVisitDays((m) => cambiarDia(m, d.bit))}
                className={`grid size-11 place-items-center rounded-xl border text-sm font-semibold ${
                  tieneDia(visitDays, d.bit)
                    ? "border-teal-600 bg-teal-600 text-white"
                    : "border-slate-200 bg-white text-slate-600"
                }`}
              >
                {d.corto}
              </button>
            ))}
          </div>
        </fieldset>
        {contexto.permisos.administrar ? (
          <div className="text-sm font-medium text-slate-700">
            Preventista de la cartera
            <div className="mt-1">
              <ProductFilterSelect
                label="Preventista"
                value={sellerId}
                icon={<UserRound size={16} aria-hidden />}
                options={[
                  { value: "", label: "Sin asignar" },
                  ...equipo
                    .filter((m) => m.vende)
                    .map((m) => ({ value: m.userId, label: m.name })),
                ]}
                onChange={setSellerId}
              />
            </div>
          </div>
        ) : null}
        <div className="rounded-2xl border border-slate-200 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="flex items-center gap-1.5 text-sm font-semibold text-slate-800">
              <MapPin size={16} className="text-teal-700" aria-hidden />
              {ubicacion ? "Ubicación marcada" : "Sin ubicación en el mapa"}
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                className={`${botonSecundario} min-h-10`}
                disabled={buscando}
                onClick={usarMiUbicacion}
              >
                <Crosshair size={16} aria-hidden />
                {buscando ? "Buscando…" : "Estoy acá"}
              </button>
              <button
                type="button"
                className={`${botonSecundario} min-h-10`}
                onClick={() => setVerMapa((v) => !v)}
              >
                {verMapa ? "Ocultar mapa" : "Marcar en el mapa"}
              </button>
            </div>
          </div>
          {verMapa ? (
            <div className="mt-3">
              <Suspense
                fallback={
                  <div className="h-64 animate-pulse rounded-2xl bg-slate-100" />
                }
              >
                <PreventaMapa
                  alto="h-64"
                  puntos={
                    ubicacion
                      ? [
                          {
                            id: "cliente",
                            ...ubicacion,
                            titulo: name || "Cliente",
                          },
                        ]
                      : []
                  }
                  onTocarMapa={setUbicacion}
                />
              </Suspense>
              <p className="mt-1 text-xs text-slate-500">
                Tocá el mapa donde queda el comercio.
              </p>
            </div>
          ) : null}
          {ubicacion ? (
            <button
              type="button"
              className="mt-2 text-xs font-semibold text-rose-700 hover:underline"
              onClick={() => setUbicacion(null)}
            >
              Quitar ubicación
            </button>
          ) : null}
        </div>
        {!cliente ? (
          <p className="text-xs text-slate-500">
            La cuenta corriente y la lista de precios se habilitan desde
            Clientes.
          </p>
        ) : null}
        {error ? <Aviso tipo="error">{error}</Aviso> : null}
      </div>
    </Hoja>
  );
}
