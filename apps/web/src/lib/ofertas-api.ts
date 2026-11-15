import { apiFetch as fetch } from "./api-fetch";
import {
  ofertaDesdeJson,
  type EstadoOferta,
  type MedioPago,
  type OfertaMotor,
  type OfertaMotorJson,
  type TipoOferta,
  type TipoProductoOferta,
} from "./ofertas-motor";

const base = import.meta.env.VITE_API_URL ?? "http://localhost:3000/api/v1";

export type DestinoOfertaVista = {
  kind: "PRODUCT" | "CATEGORY" | "LABORATORY";
  id: string;
  name: string;
  exclude: boolean;
  quantity: number | null;
};

/** Oferta como la devuelve el listado y el detalle (SISTEMA-103). */
export type Oferta = {
  id: string;
  name: string;
  type: TipoOferta;
  label: string;
  status: "DRAFT" | "PUBLISHED" | "PAUSED" | "FINISHED" | "ARCHIVED";
  estado: EstadoOferta;
  version: number;
  priority: number;
  combinable: boolean;
  startsAt: string;
  endsAt: string | null;
  weekdays: number | null;
  dayStartMinute: number | null;
  dayEndMinute: number | null;
  allBranches: boolean;
  branchIds: string[];
  allPriceLists: boolean;
  priceListIds: string[];
  productKind: TipoProductoOferta;
  maxUnitsPerSale: number | null;
  maxUnitsTotal: number | null;
  unitsUsed: number;
  percentBps: number | null;
  amountMinor: string | null;
  fixedPriceMinor: string | null;
  buyQuantity: number | null;
  payQuantity: number | null;
  nthUnit: number | null;
  bundlePriceMinor: string | null;
  /** Medios que dan el descuento (sólo ofertas por medio de pago). */
  paymentMethods?: MedioPago[];
  /** Todos los productos, con las exclusiones de `targets`. */
  allProducts?: boolean;
  /** Monto mínimo de compra (sólo ofertas por monto de compra). */
  minPurchaseMinor?: string | null;
  tiers: {
    minQuantity: number;
    percentBps: number | null;
    amountMinor: string | null;
  }[];
  targets: DestinoOfertaVista[];
  alcance: string;
  createdAt: string;
  updatedAt: string;
  stats: {
    ventas: number;
    unidades: number;
    descuentoMinor: string;
    facturacionMinor: string;
  };
};

export type DetalleOferta = Oferta & {
  historial: {
    id: string;
    action: string;
    createdAt: string;
    actor: string | null;
    before: unknown;
    after: unknown;
  }[];
  ventas: {
    saleId: string;
    number: string;
    branchName: string;
    completedAt: string | null;
    status: string;
    totalMinor: string;
    units: number;
    discountMinor: string;
    offerVersion: number;
  }[];
};

/** Lo que se manda al crear o editar. */
export type OfertaEntrada = {
  name: string;
  type: TipoOferta;
  priority?: number;
  combinable?: boolean;
  startsAt: string;
  endsAt?: string | null;
  weekdays?: number | null;
  dayStartMinute?: number | null;
  dayEndMinute?: number | null;
  branchIds?: string[];
  priceListIds?: string[];
  productKind?: TipoProductoOferta;
  maxUnitsPerSale?: number | null;
  maxUnitsTotal?: number | null;
  percentBps?: number | null;
  amountMinor?: string | null;
  fixedPriceMinor?: string | null;
  buyQuantity?: number | null;
  payQuantity?: number | null;
  nthUnit?: number | null;
  bundlePriceMinor?: string | null;
  paymentMethods?: MedioPago[];
  allProducts?: boolean;
  minPurchaseMinor?: string | null;
  tiers?: {
    minQuantity: number;
    percentBps?: number | null;
    amountMinor?: string | null;
  }[];
  targets: {
    kind: "PRODUCT" | "CATEGORY" | "LABORATORY";
    id: string;
    exclude?: boolean;
    quantity?: number | null;
  }[];
};

export type AccionOferta =
  "publicar" | "pausar" | "reanudar" | "finalizar" | "archivar";

async function pedir<T>(
  token: string,
  organizationId: string,
  path: string,
  init?: { method: "POST" | "PUT"; body?: unknown },
): Promise<T> {
  const response = await fetch(
    `${base}/organizations/${organizationId}/offers${path}`,
    {
      method: init?.method ?? "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      ...(init?.body === undefined ? {} : { body: JSON.stringify(init.body) }),
    },
  );
  const result = (await response.json().catch(() => ({}))) as {
    message?: string | string[];
  };
  if (!response.ok)
    throw new Error(
      Array.isArray(result.message)
        ? result.message.join(", ")
        : (result.message ?? "No se pudo completar la operación."),
    );
  return result as T;
}

export function getOfertas(
  token: string,
  organizationId: string,
  filtros: {
    estado?: EstadoOferta | "";
    tipo?: TipoOferta | "";
    branchId?: string;
    q?: string;
  } = {},
) {
  const query = new URLSearchParams(
    Object.entries(filtros).filter((entrada): entrada is [string, string] =>
      Boolean(entrada[1]),
    ),
  ).toString();
  return pedir<Oferta[]>(token, organizationId, query ? `?${query}` : "");
}

export const getOferta = (token: string, organizationId: string, id: string) =>
  pedir<DetalleOferta>(token, organizationId, `/${id}`);

export const crearOferta = (
  token: string,
  organizationId: string,
  entrada: OfertaEntrada & { publicar?: boolean },
) =>
  pedir<DetalleOferta>(token, organizationId, "", {
    method: "POST",
    body: entrada,
  });

export const editarOferta = (
  token: string,
  organizationId: string,
  id: string,
  entrada: OfertaEntrada & { expectedUpdatedAt: string },
) =>
  pedir<DetalleOferta>(token, organizationId, `/${id}`, {
    method: "PUT",
    body: entrada,
  });

export const accionOferta = (
  token: string,
  organizationId: string,
  id: string,
  accion: AccionOferta,
) =>
  pedir<DetalleOferta>(token, organizationId, `/${id}/${accion}`, {
    method: "POST",
  });

/**
 * Ofertas activas y programadas para el motor (Ventas y Productos). La copia
 * local de la PC la guarda sola: sin conexión, la venta aplica las mismas.
 */
export async function getOfertasVigentes(
  token: string,
  organizationId: string,
): Promise<OfertaMotor[]> {
  const ofertas = await pedir<OfertaMotorJson[]>(
    token,
    organizationId,
    "/vigentes",
  );
  return ofertas.map(ofertaDesdeJson);
}
