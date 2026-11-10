import type { ThermalTicket } from "@gestion/contracts";
import { useEffect, useState } from "react";
import { almacenLocal } from "./almacen-local";
import type { DetalleLocal } from "./cuenta-sin-conexion";

// Bandeja de salida (SISTEMA-64): ventas cobradas sin conexión que esperan
// llegar al servidor. Se guardan en la PC por usuario: sólo las manda la
// sesión de quien las vendió. Cerrar sesión no las borra (se bloquea mientras
// haya pendientes) y el prefijo es distinto de la copia local de consultas.

export type EstadoVentaPendiente = "PENDIENTE" | "RECHAZADA" | "ENVIADA";

export type VentaPendiente = {
  version: 1;
  /** clientOperationId: también es el id que tendrá la venta en el servidor. */
  id: string;
  alcance: string;
  organizationId: string;
  branchId: string;
  occurredAt: string;
  totalMinor: string;
  documentType: "INTERNAL" | "INVOICE";
  /** Cuerpo listo para POST sales/offline. */
  cuerpo: Record<string, unknown>;
  /**
   * Unidades por producto, para descontarlas del stock que se ve en la PC. En
   * compras van en negativo: suman stock (SISTEMA-69).
   */
  unidades: {
    productId: string;
    cantidad: number;
    /** Compra recibida sin conexión: el lote y su vencimiento (SISTEMA-69). */
    lote?: string;
    vence?: string | null;
  }[];
  /** Ticket provisorio impreso, para reimprimirlo (las de caja no tienen). */
  ticket?: ThermalTicket;
  /**
   * Operación sin conexión que no es venta: de caja (SISTEMA-67: apertura,
   * movimiento o cierre) o de compras (SISTEMA-69: pedido, compra directa o
   * recepción) o de cuenta corriente (SISTEMA-70: cobros, ajustes y alta de
   * clientes) o de transferencias (SISTEMA-71: preparar, despachar o recibir)
   * o de proveedores y cuentas por pagar (SISTEMA-73). Sin este campo es una
   * venta.
   */
  operacion?:
    | "CAJA"
    | "COMPRA"
    | "CUENTA"
    | "CLIENTE"
    | "TRANSFERENCIA"
    | "PROVEEDOR"
    | "PAGAR"
    // Productos e inventario (SISTEMA-79).
    | "CATALOGO"
    | "INVENTARIO";
  /** Lo que la PC sabe de la operación para mostrarla (SISTEMA-70). */
  local?: DetalleLocal;
  /** Quién la hizo, para mostrarlo en la caja (nombre o email). */
  actorName?: string;
  estado: EstadoVentaPendiente;
  intentos: number;
  ultimoError?: string;
  enviadaEl?: string;
  /** Avisos "a revisar" que devolvió el servidor al registrarla. */
  avisos?: number;
  /**
   * Firma de quien la hizo (SISTEMA-66): con ella otro usuario de la PC puede
   * mandarla al volver internet. `payload` es el texto exacto que se firmó.
   */
  vendedorId?: string;
  payload?: string;
  firma?: string;
};

const PREFIJO = "bandeja|";
const CANAL = "gestion-bandeja-ventas";
const ENVIADAS_SE_GUARDAN_MS = 7 * 24 * 60 * 60 * 1000;

const clave = (venta: Pick<VentaPendiente, "alcance" | "id">) =>
  `${PREFIJO}${venta.alcance}|${venta.id}`;

const oyentes = new Set<() => void>();
let canal: BroadcastChannel | undefined;

/**
 * La bandeja en memoria (SISTEMA-74): se lee una vez y se reutiliza hasta que
 * cambie (en esta pestaña o en otra). Antes cada consulta la leía clave por
 * clave, y cuanto más se trabajaba sin conexión más lenta era cada pantalla.
 */
let enMemoria: Promise<VentaPendiente[]> | undefined;
/** Almacén del que salió la bandeja en memoria: si cambia, se vuelve a leer. */
let almacenDeLaMemoria: unknown;

function canalEntrePestanas() {
  if (canal || typeof BroadcastChannel === "undefined") return canal;
  canal = new BroadcastChannel(CANAL);
  canal.onmessage = () => {
    enMemoria = undefined;
    for (const oyente of oyentes) oyente();
  };
  return canal;
}

function avisarCambio() {
  enMemoria = undefined;
  for (const oyente of oyentes) oyente();
  canalEntrePestanas()?.postMessage("cambio");
}

/** Olvida la bandeja en memoria (cambio de almacén en los tests). */
export function olvidarBandejaEnMemoria() {
  enMemoria = undefined;
}

const ordenar = (ventas: VentaPendiente[]) =>
  ventas
    .filter((venta) => venta?.version === 1)
    .sort(
      (a, b) =>
        a.occurredAt.localeCompare(b.occurredAt) || a.id.localeCompare(b.id),
    );

/** Avisa cuando cambia la bandeja (en esta pestaña o en otra). */
export function suscribirBandeja(oyente: () => void) {
  canalEntrePestanas();
  oyentes.add(oyente);
  return () => {
    oyentes.delete(oyente);
  };
}

export async function guardarVentaPendiente(venta: VentaPendiente) {
  await almacenLocal().guardar(clave(venta), venta);
  avisarCambio();
}

export async function actualizarVentaPendiente(venta: VentaPendiente) {
  await almacenLocal().guardar(clave(venta), venta);
  avisarCambio();
}

/** Ventas de un usuario, de la más vieja a la más nueva. */
export async function ventasDe(alcance: string): Promise<VentaPendiente[]> {
  return (await ventasDeLaPc()).filter((venta) => venta.alcance === alcance);
}

/** Todas las ventas de la PC, de todos los usuarios, de la más vieja a la más nueva. */
export function ventasDeLaPc(): Promise<VentaPendiente[]> {
  const almacen = almacenLocal();
  if (almacenDeLaMemoria !== almacen) {
    enMemoria = undefined;
    almacenDeLaMemoria = almacen;
  }
  const lectura = (enMemoria ??= almacen
    .valores<VentaPendiente>(PREFIJO)
    .then(ordenar));
  // Si falla, la próxima vez se vuelve a leer.
  lectura.catch(() => {
    if (enMemoria === lectura) enMemoria = undefined;
  });
  // Una copia de la lista: quien la recibe puede ordenarla o filtrarla.
  return lectura.then((ventas) => [...ventas]);
}

/** Cuántas ventas sin enviar hay en la PC de otros usuarios. */
export async function pendientesDeOtros(alcance: string) {
  return (await ventasDeLaPc()).filter(
    (venta) => venta.alcance !== alcance && venta.estado === "PENDIENTE",
  ).length;
}

/** Las enviadas se guardan una semana para reimprimir y después se borran. */
export async function olvidarEnviadasViejas(ahora = Date.now()) {
  const almacen = almacenLocal();
  // Las de todos los usuarios de la PC.
  for (const venta of await ventasDeLaPc())
    if (
      venta.estado === "ENVIADA" &&
      venta.enviadaEl &&
      ahora - Date.parse(venta.enviadaEl) > ENVIADAS_SE_GUARDAN_MS
    )
      await almacen.borrar(clave(venta));
  enMemoria = undefined;
}

/** Unidades vendidas sin conexión que todavía no llegaron al servidor. */
export function unidadesPendientes(
  ventas: readonly VentaPendiente[],
  organizationId: string,
  branchId: string,
) {
  const unidades = new Map<string, number>();
  for (const venta of ventas) {
    if (
      venta.estado !== "PENDIENTE" ||
      venta.organizationId !== organizationId ||
      venta.branchId !== branchId
    )
      continue;
    for (const { productId, cantidad } of venta.unidades)
      unidades.set(productId, (unidades.get(productId) ?? 0) + cantidad);
  }
  return unidades;
}

export type ResumenBandeja = {
  pendientes: number;
  rechazadas: number;
  ventas: VentaPendiente[];
  /** Las de todos los usuarios de la PC (cambio de turno, SISTEMA-66). */
  deLaPc: VentaPendiente[];
};

export function resumirBandeja(
  ventas: readonly VentaPendiente[],
): Omit<ResumenBandeja, "ventas" | "deLaPc"> {
  return {
    pendientes: ventas.filter((venta) => venta.estado === "PENDIENTE").length,
    rechazadas: ventas.filter((venta) => venta.estado === "RECHAZADA").length,
  };
}

/** Bandeja del usuario, al día con lo que pase en esta pestaña o en otra. */
export function useBandejaVentas(alcance: string | undefined): ResumenBandeja {
  const [deLaPc, setDeLaPc] = useState<VentaPendiente[]>([]);
  useEffect(() => {
    if (!alcance) {
      setDeLaPc([]);
      return;
    }
    let activo = true;
    const cargar = () =>
      void ventasDeLaPc()
        .then((lista) => {
          if (activo) setDeLaPc(lista);
        })
        .catch(() => {});
    cargar();
    const dejar = suscribirBandeja(cargar);
    return () => {
      activo = false;
      dejar();
    };
  }, [alcance]);
  const ventas = deLaPc.filter((venta) => venta.alcance === alcance);
  return { ...resumirBandeja(ventas), ventas, deLaPc };
}
