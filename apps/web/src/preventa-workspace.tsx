import { useCallback, useEffect, useState, type ReactNode } from "react";
import {
  BadgePercent,
  ChartColumn,
  ClipboardList,
  CloudOff,
  HandCoins,
  Menu,
  Settings,
  ShoppingCart,
  Smartphone,
  Store,
  Truck,
} from "lucide-react";

import { useConectividad } from "./lib/conectividad";
import {
  preventaApi,
  type ClientePreventa,
  type ContextoPreventa,
  type MiembroEquipo,
  type PedidoPreventa,
} from "./lib/preventa-api";
import {
  enviarBandeja,
  leerBandeja,
  type PedidoEnBandeja,
} from "./lib/preventa-bandeja";
import {
  SECCIONES,
  mensajeDe,
  seccionInicial,
  seccionesVisibles,
  type SeccionPreventa,
} from "./lib/preventa";
import { PreventaClientes } from "./preventa-clientes";
import { PreventaComisiones } from "./preventa-comisiones";
import { PreventaConfiguracion } from "./preventa-configuracion";
import { PreventaNuevoPedido } from "./preventa-nuevo-pedido";
import { PreventaOfertas } from "./preventa-ofertas";
import { PreventaPedidos } from "./preventa-pedidos";
import { PreventaReparto } from "./preventa-reparto";
import { PreventaResumen } from "./preventa-resumen";
import { PreventaMenuLateral } from "./preventa-menu-lateral";
import { Aviso } from "./preventa-ui";
import { PreventaMovilContexto } from "./lib/preventa-movil";

const ICONOS: Record<SeccionPreventa, typeof Store> = {
  nuevo: ShoppingCart,
  pedidos: ClipboardList,
  reparto: Truck,
  clientes: Store,
  ofertas: BadgePercent,
  comisiones: HandCoins,
  resumen: ChartColumn,
  configuracion: Settings,
};

/**
 * Preventa (SISTEMA-108). La misma pantalla sirve en la PC (pestañas arriba,
 * dentro de la gestión) y en el celular (menú lateral, a pantalla completa).
 */
export function PreventaWorkspace({
  token,
  organizationId,
  branches,
  movil,
  movilChrome,
  onAbrirMovil,
}: {
  token: string;
  organizationId: string;
  branches: { id: string; name: string }[];
  movil: boolean;
  /** Datos del encabezado y el menú lateral de la versión celular. */
  movilChrome?: {
    organizationName?: string;
    onIrAGestion?: () => void;
    onLogout: () => void;
  };
  onAbrirMovil?: () => void;
}) {
  const [contexto, setContexto] = useState<ContextoPreventa | null>(null);
  const [error, setError] = useState("");
  const [seccion, setSeccion] = useState<SeccionPreventa | null>(null);
  const [equipo, setEquipo] = useState<MiembroEquipo[]>([]);
  const [editando, setEditando] = useState<PedidoPreventa | null>(null);
  const [clienteParaPedido, setClienteParaPedido] =
    useState<ClientePreventa | null>(null);
  const [aviso, setAviso] = useState("");
  const [bandeja, setBandeja] = useState<PedidoEnBandeja[]>([]);
  const [recarga, setRecarga] = useState(0);
  const [pedidoNuevo, setPedidoNuevo] = useState(0);
  const [verMas, setVerMas] = useState(false);
  const { enLinea } = useConectividad();
  const cerrarMenu = useCallback(() => setVerMas(false), []);

  const cargarContexto = useCallback(() => {
    preventaApi
      .contexto(token, organizationId)
      .then((datos) => {
        setContexto(datos);
        setSeccion((actual) => actual ?? seccionInicial(datos.permisos));
        setError("");
      })
      .catch((causa) => setError(mensajeDe(causa)));
  }, [token, organizationId]);

  useEffect(cargarContexto, [cargarContexto]);

  useEffect(() => {
    if (!contexto?.permisos.administrar) return;
    preventaApi
      .equipo(token, organizationId)
      .then(setEquipo)
      .catch(() => setEquipo([]));
  }, [token, organizationId, contexto?.permisos.administrar]);

  // Bandeja de salida: lo tomado sin señal se manda solo al volver.
  const usuarioId = contexto?.usuario.id;
  useEffect(() => {
    if (!usuarioId) return;
    const leer = () => setBandeja(leerBandeja(usuarioId, organizationId));
    leer();
    window.addEventListener("preventa:bandeja", leer);
    return () => window.removeEventListener("preventa:bandeja", leer);
  }, [usuarioId, organizationId]);

  useEffect(() => {
    if (!usuarioId || !enLinea) return;
    let vigente = true;
    const enviar = async () => {
      if (!leerBandeja(usuarioId, organizationId).some((p) => !p.error)) return;
      const resultado = await enviarBandeja(usuarioId, organizationId, (p) =>
        preventaApi.crearPedido(token, organizationId, {
          requestId: p.requestId,
          customerId: p.customerId,
          items: p.items.map(({ productId, quantity, unitPriceMinor }) => ({
            productId,
            quantity,
            ...(unitPriceMinor ? { unitPriceMinor } : {}),
          })),
          notes: p.notes,
        }),
      );
      if (vigente && resultado.enviados.length) {
        setAviso(
          `Se enviaron ${resultado.enviados.length} pedido(s) tomados sin señal.`,
        );
        setRecarga((n) => n + 1);
      }
    };
    void enviar();
    const intervalo = window.setInterval(() => void enviar(), 60_000);
    return () => {
      vigente = false;
      window.clearInterval(intervalo);
    };
  }, [usuarioId, organizationId, token, enLinea, bandeja.length]);

  if (error && !contexto)
    return (
      <div className="p-4 sm:p-6">
        <Aviso tipo="error">{error}</Aviso>
      </div>
    );
  if (!contexto || !seccion)
    return (
      <div className="grid flex-1 place-items-center p-10 text-sm text-slate-500">
        Cargando la preventa…
      </div>
    );

  const visibles = seccionesVisibles(contexto.permisos);
  const ir = (destino: SeccionPreventa) => {
    setSeccion(destino);
    setAviso("");
    setVerMas(false);
    if (destino !== "nuevo") {
      setEditando(null);
      setClienteParaPedido(null);
    }
    window.scrollTo({ top: 0 });
  };

  const contenido: Record<SeccionPreventa, () => ReactNode> = {
    nuevo: () => (
      <PreventaNuevoPedido
        key={editando?.id ?? clienteParaPedido?.id ?? `nuevo-${pedidoNuevo}`}
        token={token}
        organizationId={organizationId}
        contexto={contexto}
        editando={editando}
        clienteInicial={clienteParaPedido}
        onCancelarEdicion={() => {
          setEditando(null);
          ir("pedidos");
        }}
        onListo={(_pedido, mensaje) => {
          const eraEdicion = Boolean(editando);
          setEditando(null);
          setClienteParaPedido(null);
          setRecarga((n) => n + 1);
          if (eraEdicion) ir("pedidos");
          else {
            // Como en la app anterior: listo para el próximo cliente.
            setPedidoNuevo((n) => n + 1);
            window.scrollTo({ top: 0 });
          }
          setAviso(mensaje);
        }}
      />
    ),
    pedidos: () => (
      <PreventaPedidos
        token={token}
        organizationId={organizationId}
        contexto={contexto}
        equipo={equipo}
        bandeja={bandeja}
        recarga={recarga}
        onEditar={(pedido) => {
          setEditando(pedido);
          setSeccion("nuevo");
        }}
      />
    ),
    reparto: () => (
      <PreventaReparto
        token={token}
        organizationId={organizationId}
        contexto={contexto}
        equipo={equipo}
        recarga={recarga}
      />
    ),
    clientes: () => (
      <PreventaClientes
        token={token}
        organizationId={organizationId}
        contexto={contexto}
        onNuevoPedido={(cliente) => {
          setClienteParaPedido(cliente);
          setEditando(null);
          setSeccion("nuevo");
        }}
      />
    ),
    ofertas: () => (
      <PreventaOfertas token={token} organizationId={organizationId} />
    ),
    comisiones: () => (
      <PreventaComisiones
        token={token}
        organizationId={organizationId}
        contexto={contexto}
      />
    ),
    resumen: () => (
      <PreventaResumen
        token={token}
        organizationId={organizationId}
        administra={contexto.permisos.administrar}
      />
    ),
    configuracion: () => (
      <PreventaConfiguracion
        token={token}
        organizationId={organizationId}
        branches={branches}
        onGuardada={cargarContexto}
      />
    ),
  };

  const avisos = (
    <>
      {!enLinea ? (
        <Aviso tipo="info">
          <CloudOff size={14} className="mr-1 inline" aria-hidden />
          Sin conexión: podés consultar lo que ya abriste y tomar pedidos; se
          mandan solos al volver la señal.
        </Aviso>
      ) : null}
      {!contexto.configured &&
      contexto.permisos.administrar &&
      seccion !== "configuracion" ? (
        <Aviso tipo="info">
          La preventa usa la configuración por defecto (la entrega no toca stock
          ni ventas).{" "}
          <button
            type="button"
            className="font-semibold underline"
            onClick={() => ir("configuracion")}
          >
            Revisala
          </button>
          .
        </Aviso>
      ) : null}
      {aviso ? <Aviso tipo="bien">{aviso}</Aviso> : null}
    </>
  );

  if (movil)
    return (
      <PreventaMovilContexto.Provider value>
        <div className="flex min-h-dvh flex-col bg-fondo text-slate-900">
          <header className="sticky top-0 z-30 bg-teal-700 text-white shadow-md">
            <div className="mx-auto flex h-14 max-w-3xl items-center gap-2 px-2">
              <button
                type="button"
                aria-label="Abrir menú"
                onClick={() => setVerMas(true)}
                className="relative grid size-11 place-items-center rounded-full hover:bg-white/15"
              >
                <Menu size={24} aria-hidden />
                {bandeja.length ? (
                  <span className="absolute right-1.5 top-1.5 size-2.5 rounded-full bg-amber-400 ring-2 ring-teal-700" />
                ) : null}
              </button>
              <h1 className="min-w-0 flex-1 truncate text-xl font-bold">
                {editando ? "Editar pedido" : SECCIONES[seccion].label}
              </h1>
              {!enLinea ? (
                <span className="mr-2 inline-flex items-center gap-1 rounded-full bg-white/15 px-2.5 py-1 text-xs font-semibold">
                  <CloudOff size={14} aria-hidden /> Sin señal
                </span>
              ) : null}
            </div>
          </header>
          <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-3 px-4 pb-6 pt-4">
            {avisos}
            {contenido[seccion]()}
          </main>
          <PreventaMenuLateral
            abierto={verMas}
            contexto={contexto}
            organizationName={movilChrome?.organizationName}
            visibles={visibles}
            actual={seccion}
            pendientes={bandeja.length}
            onIr={ir}
            onCerrar={cerrarMenu}
            onIrAGestion={movilChrome?.onIrAGestion}
            onLogout={movilChrome?.onLogout}
          />
        </div>
      </PreventaMovilContexto.Provider>
    );

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 p-4 sm:p-6">
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-slate-200">
        <div
          role="tablist"
          aria-label="Secciones de la preventa"
          className="flex flex-wrap gap-5"
        >
          {visibles.map((s) => {
            const Icono = ICONOS[s];
            return (
              <button
                key={s}
                type="button"
                role="tab"
                aria-selected={seccion === s}
                onClick={() => ir(s)}
                className={`-mb-px inline-flex items-center gap-1.5 border-b-2 px-1 pb-3 text-sm transition-colors ${
                  seccion === s
                    ? "border-teal-600 font-semibold text-teal-700"
                    : "border-transparent text-slate-500 hover:text-slate-800"
                }`}
              >
                <Icono size={16} aria-hidden />
                {SECCIONES[s].label}
                {s === "pedidos" && bandeja.length ? (
                  <span className="rounded-full bg-amber-400 px-1.5 text-xs font-semibold text-slate-900">
                    {bandeja.length}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
        {onAbrirMovil ? (
          <button
            type="button"
            onClick={onAbrirMovil}
            className="mb-2 inline-flex items-center gap-1.5 text-sm font-semibold text-teal-700 hover:underline"
          >
            <Smartphone size={16} aria-hidden /> Versión celular
          </button>
        ) : null}
      </div>
      {avisos}
      <div className={seccion === "nuevo" ? "mx-auto w-full max-w-3xl" : ""}>
        {contenido[seccion]()}
      </div>
    </div>
  );
}
