import { apiFetch } from "./api-fetch";

/**
 * Catálogo online (SISTEMA-107): llamadas de la gestión (con la sesión de la
 * farmacia) y del catálogo público (con la cookie del portal).
 */

const base = import.meta.env.VITE_API_URL ?? "http://localhost:3000/api/v1";

export type EstadoPedido =
  "RECEIVED" | "CONFIRMED" | "REJECTED" | "DELIVERED" | "CANCELLED";
export type DecisionPedido = "confirmar" | "rechazar" | "entregar";
export type Entrega = "PICKUP" | "DELIVERY";

export type ConfiguracionCatalogo = {
  exists: boolean;
  slug: string;
  branchId: string;
  published: boolean;
  displayName: string;
  requireLogin: boolean;
  showPricesPublic: boolean;
  showOutOfStock: boolean;
  priceListId: string | null;
  pickupEnabled: boolean;
  deliveryEnabled: boolean;
  deductStockOnDelivery: boolean;
  updatedAt: string | null;
};

export type UsuarioPortal = {
  id: string;
  name: string;
  email: string;
  customerId: string;
  customerName: string;
  active: boolean;
  lastLoginAt: string | null;
  createdAt: string;
};

export type RenglonDePedido = {
  productId: string;
  productName: string;
  quantity: number;
  unitPriceMinor: string;
  /** Descuento de ofertas del catálogo. */
  discountMinor: string;
  totalMinor: string;
};

export type Pedido = {
  id: string;
  number: number;
  status: EstadoPedido;
  delivery: Entrega;
  deliveryAddress: string | null;
  notes: string | null;
  decisionNote: string | null;
  totalMinor: string;
  ahorroMinor: string;
  createdAt: string;
  decidedAt: string | null;
  deliveredAt: string | null;
  stockDeducted: boolean;
  items: RenglonDePedido[];
};

export type PedidoDeLaFarmacia = Pedido & {
  customerId: string;
  customerName: string;
  branchName: string;
};

async function error(response: Response, fallback: string): Promise<Error> {
  try {
    const result = (await response.json()) as { message?: string | string[] };
    return new Error(
      Array.isArray(result.message)
        ? result.message.join(", ")
        : (result.message ?? fallback),
    );
  } catch {
    return new Error(fallback);
  }
}

const conToken = (token: string): HeadersInit => ({
  Authorization: `Bearer ${token}`,
  "Content-Type": "application/json",
});

const gestion = (organizationId: string, ruta: string) =>
  `${base}/organizations/${organizationId}/catalogo-online/${ruta}`;

export async function getConfiguracionCatalogo(
  token: string,
  organizationId: string,
): Promise<ConfiguracionCatalogo> {
  const response = await apiFetch(gestion(organizationId, "configuracion"), {
    headers: conToken(token),
  });
  if (!response.ok)
    throw await error(
      response,
      "No se pudo ver la configuración del catálogo.",
    );
  return (await response.json()) as ConfiguracionCatalogo;
}

export async function guardarConfiguracionCatalogo(
  token: string,
  organizationId: string,
  datos: Omit<ConfiguracionCatalogo, "exists" | "updatedAt">,
): Promise<ConfiguracionCatalogo> {
  const response = await apiFetch(gestion(organizationId, "configuracion"), {
    method: "PUT",
    headers: conToken(token),
    body: JSON.stringify(datos),
  });
  if (!response.ok)
    throw await error(response, "No se pudo guardar la configuración.");
  return (await response.json()) as ConfiguracionCatalogo;
}

export async function getUsuariosPortal(
  token: string,
  organizationId: string,
): Promise<UsuarioPortal[]> {
  const response = await apiFetch(gestion(organizationId, "usuarios"), {
    headers: conToken(token),
  });
  if (!response.ok)
    throw await error(response, "No se pudieron ver los usuarios del portal.");
  return (await response.json()) as UsuarioPortal[];
}

export async function crearUsuarioPortal(
  token: string,
  organizationId: string,
  datos: { customerId: string; name: string; email: string; password: string },
): Promise<UsuarioPortal> {
  const response = await apiFetch(gestion(organizationId, "usuarios"), {
    method: "POST",
    headers: conToken(token),
    body: JSON.stringify(datos),
  });
  if (!response.ok) throw await error(response, "No se pudo crear el usuario.");
  return (await response.json()) as UsuarioPortal;
}

export async function cambiarUsuarioPortal(
  token: string,
  organizationId: string,
  userId: string,
  cambio: { name?: string; active?: boolean; password?: string },
): Promise<UsuarioPortal> {
  const response = await apiFetch(
    gestion(organizationId, `usuarios/${userId}`),
    { method: "PATCH", headers: conToken(token), body: JSON.stringify(cambio) },
  );
  if (!response.ok)
    throw await error(response, "No se pudo cambiar el usuario.");
  return (await response.json()) as UsuarioPortal;
}

export async function getPedidosCatalogo(
  token: string,
  organizationId: string,
  estado?: EstadoPedido,
): Promise<{
  recibidos: number;
  descuentaStock: boolean;
  items: PedidoDeLaFarmacia[];
}> {
  const response = await apiFetch(
    gestion(organizationId, `pedidos${estado ? `?estado=${estado}` : ""}`),
    { headers: conToken(token) },
  );
  if (!response.ok)
    throw await error(response, "No se pudieron ver los pedidos.");
  return (await response.json()) as {
    recibidos: number;
    descuentaStock: boolean;
    items: PedidoDeLaFarmacia[];
  };
}

export async function decidirPedido(
  token: string,
  organizationId: string,
  pedido: Pick<Pedido, "id" | "status">,
  accion: DecisionPedido,
  note?: string,
): Promise<PedidoDeLaFarmacia> {
  const response = await apiFetch(
    gestion(organizationId, `pedidos/${pedido.id}/${accion}`),
    {
      method: "POST",
      headers: conToken(token),
      body: JSON.stringify({ expectedStatus: pedido.status, note }),
    },
  );
  if (!response.ok)
    throw await error(response, "No se pudo actualizar el pedido.");
  return (await response.json()) as PedidoDeLaFarmacia;
}
