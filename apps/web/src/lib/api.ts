import { apiFetch as fetch, SinConexionError } from "./api-fetch";
import { idDeEstaPc } from "./venta-sin-conexion";
import type { PurchasePack } from "./purchase-pack";
import type { HealthResponse } from "@gestion/contracts";
import { categoryPath } from "./category-tree";
import type {
  SaleFiscalOptions,
  SaleFiscalCapabilities,
} from "@gestion/contracts";
import { withStockAvailability } from "./stock-availability";
import {
  encabezadoGuardado,
  LEYENDA_PROVISORIO,
  recordarEncabezado,
} from "./venta-sin-conexion";
import { EnvioRechazado } from "./sincronizacion-ventas";
import {
  TOKEN_SIN_CONEXION,
  VIGENCIA_SIN_CONEXION_MS,
  alcanceActual,
  horaUltimaSincronizacion,
} from "./cache-local";
import { copiaAlDia } from "./copia-por-partes";
import { cobrosConPendientes } from "./caja-sin-conexion";
import { productoPorId } from "./indice-productos";
import {
  listasConPendientes,
  logoPendiente,
  camposCambiadosDelProducto,
  guardarOperacionCatalogo,
  opcionesConPendientes,
  pendientesDeCatalogo,
  productoConPendientes,
  productosConPendientes,
} from "./catalogo-sin-conexion";
import {
  guardarOperacionInventario,
  loteConPendientes,
  loteDeLaOperacion,
  pendientesDeInventario,
  stockConPendientes,
} from "./inventario-sin-conexion";
import {
  catalogoAlDia,
  type PartesDelCatalogo,
  type VersionesDelCatalogo,
} from "./catalogo-local";
import { conectividad } from "./conectividad";
import { ventasDeLaPc, type VentaPendiente } from "./bandeja-ventas";
import { lotesConPendientes, lotesSinEnviar } from "./compras-sin-conexion";
import {
  guardarOperacionTransferencia,
  lotesParaTransferir,
  renglonesDeLotes,
  transferenciaConPendientes,
  transferenciasConPendientes,
  unidadesDeTransferencia,
} from "./transferencias-sin-conexion";
import {
  camposCambiados,
  guardarOperacionProveedor,
  proveedorConPendientes,
  proveedoresConPendientes,
} from "./proveedores-sin-conexion";
import {
  aImputaciones,
  clienteConPendientes,
  clientesConPendientes,
  clientesConMovimientosPendientes,
  cuentasConPendientes,
  detalleDeVentaLocal,
  movimientosConPendientes,
  pendientesDelCliente,
  guardarAltaCliente,
  guardarEdicionCliente,
  guardarOperacionCuenta,
  itemsConPendientes,
  lineaDeId,
  reciboLocal,
  repartirAumento,
} from "./cuenta-sin-conexion";
import {
  buscarMedicamentosEnLaPc,
  exhibidoresEnLaPc,
  guardarBaseMedicamentos,
  guardarExhibidorPendiente,
  medicamentosPorCodigo,
  versionBaseMedicamentos,
  type MedicamentoBase,
} from "./base-medicamentos-local";

export const apiBaseUrl =
  import.meta.env.VITE_API_URL ?? "http://localhost:3000/api/v1";

export type DistributionDocument = {
  id: string;
  destination: string;
  reason: string;
  actorId: string;
  createdAt: string;
  reversedAt: string | null;
  reversalReason: string | null;
  items: {
    lotId: string;
    productId: string;
    productName: string;
    lotNumber: string;
    expiresAt: string | null;
    quantity: number;
  }[];
};
export type DistributionRequest = {
  requestId: string;
  destination: string;
  reason: string;
  confirmed: boolean;
  items: { lotId: string; quantity: number }[];
};
export class DistributionRejected extends Error {}
export async function distributionRequest<T>(
  token: string,
  organizationId: string,
  branchId: string,
  body?: DistributionRequest | { reason: string; confirmed: boolean },
  suffix = "",
): Promise<T> {
  const response = await fetch(
    `${apiBaseUrl}/organizations/${organizationId}/branches/${branchId}/inventory/distributions${suffix}`,
    {
      method: body ? "POST" : "GET",
      headers: authJson(token),
      body: body ? JSON.stringify(body) : undefined,
    },
  );
  if (!response.ok) {
    const error = await responseError(
      response,
      "No se pudo confirmar el resultado. Reintentá la misma salida sin cambiarla o consultá su historial.",
    );
    if ([400, 402, 409].includes(response.status))
      throw new DistributionRejected(error.message);
    throw error;
  }
  return response.json();
}

export async function getHealth(): Promise<HealthResponse> {
  const response = await fetch(`${apiBaseUrl}/health`);
  const data: unknown = await response.json();

  if (!response.ok) {
    return data as HealthResponse;
  }

  return data as HealthResponse;
}

export async function login(
  email: string,
  password: string,
): Promise<{ accessToken: string }> {
  const response = await fetch(
    `${apiBaseUrl}/auth/login`,
    {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      // Id de esta PC: la reconoce en "Sesiones abiertas" (SISTEMA-93).
      body: JSON.stringify({ email, password, deviceId: idDeEstaPc() }),
    },
    { probarRed: true },
  );
  if (!response.ok) throw new Error("No se pudo iniciar sesion.");
  return (await response.json()) as { accessToken: string };
}

export class SessionExpiredError extends Error {}
/** La cookie del navegador es de otro usuario (SISTEMA-92): la pestaña se pausa. */
export class SesionDeOtroUsuarioError extends Error {
  constructor(readonly email?: string) {
    super("En este navegador se inició sesión con otro usuario.");
  }
}

/**
 * Renueva el access token con la cookie del navegador. Con `usuarioEsperado`
 * la API no entrega el token si la cookie ya es de otro usuario.
 */
export async function refreshSession(
  usuarioEsperado?: string,
): Promise<{ accessToken: string }> {
  const response = await fetch(`${apiBaseUrl}/auth/refresh`, {
    method: "POST",
    credentials: "include",
    signal: AbortSignal.timeout(10000),
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...(usuarioEsperado ? { usuarioEsperado } : {}),
      deviceId: idDeEstaPc(),
    }),
  });
  if (response.status === 401)
    throw new SessionExpiredError("La sesión ya no es válida.");
  if (response.status === 409) {
    const result = (await response.json().catch(() => ({}))) as {
      code?: string;
      details?: { email?: unknown };
    };
    if (result.code === "SESION_DE_OTRO_USUARIO")
      throw new SesionDeOtroUsuarioError(
        typeof result.details?.email === "string"
          ? result.details.email
          : undefined,
      );
  }
  if (!response.ok)
    throw new Error("No se pudo renovar la conexión. Se reintentará.");
  return (await response.json()) as { accessToken: string };
}

/** Una sesión abierta del usuario (SISTEMA-93). Sin secretos. */
export type SesionAbierta = {
  id: string;
  /** Navegador y sistema resumidos ("Edge · Windows"). */
  navegador: string | null;
  ip: string | null;
  deviceId: string | null;
  iniciada: string;
  ultimoUso: string;
  /** Es la sesión de esta pestaña. */
  actual: boolean;
};

export async function listarSesionesPropias(
  token: string,
): Promise<SesionAbierta[]> {
  const response = await fetch(`${apiBaseUrl}/auth/sessions`, {
    headers: authJson(token),
  });
  if (!response.ok)
    throw await responseError(response, "No se pudieron ver las sesiones.");
  return (await response.json()) as SesionAbierta[];
}

export async function cerrarSesionPropia(
  token: string,
  sesion: string,
): Promise<{ cerradas: number }> {
  const response = await fetch(`${apiBaseUrl}/auth/sessions/${sesion}`, {
    method: "DELETE",
    headers: authJson(token),
  });
  if (!response.ok)
    throw await responseError(response, "No se pudo cerrar la sesión.");
  return (await response.json()) as { cerradas: number };
}

export async function cerrarOtrasSesiones(
  token: string,
): Promise<{ cerradas: number }> {
  const response = await fetch(`${apiBaseUrl}/auth/sessions/close-others`, {
    method: "POST",
    headers: authJson(token),
  });
  if (!response.ok)
    throw await responseError(response, "No se pudieron cerrar las sesiones.");
  return (await response.json()) as { cerradas: number };
}

/** Sesiones abiertas de un usuario de la farmacia (administración). */
export async function listarSesionesDeUsuario(
  token: string,
  organizationId: string,
  userId: string,
): Promise<SesionAbierta[]> {
  const response = await fetch(
    `${apiBaseUrl}/organizations/${organizationId}/users/${userId}/sessions`,
    { headers: authJson(token) },
  );
  if (!response.ok)
    throw await responseError(response, "No se pudieron ver las sesiones.");
  return (await response.json()) as SesionAbierta[];
}

export async function cerrarSesionDeUsuario(
  token: string,
  organizationId: string,
  userId: string,
  sesion?: string,
): Promise<{ cerradas: number }> {
  const base = `${apiBaseUrl}/organizations/${organizationId}/users/${userId}/sessions`;
  const response = await fetch(
    sesion ? `${base}/${sesion}` : `${base}/close-all`,
    { method: sesion ? "DELETE" : "POST", headers: authJson(token) },
  );
  if (!response.ok)
    throw await responseError(response, "No se pudieron cerrar las sesiones.");
  return (await response.json()) as { cerradas: number };
}

export async function logout(): Promise<void> {
  await fetch(`${apiBaseUrl}/auth/logout`, {
    method: "POST",
    credentials: "include",
  });
}

export async function changeOwnPassword(
  token: string,
  input: { currentPassword: string; newPassword: string },
): Promise<{ revokedSessions: number }> {
  const response = await fetch(`${apiBaseUrl}/auth/change-password`, {
    method: "POST",
    headers: authJson(token),
    body: JSON.stringify(input),
  });
  if (!response.ok)
    throw await responseError(response, "No se pudo cambiar la contraseña.");
  return (await response.json()) as { revokedSessions: number };
}

export type CurrentUserProfile = {
  /** Id del usuario: firma sus ventas sin conexión (SISTEMA-66). */
  id?: string;
  email: string;
  mustChangePassword?: boolean;
  isPlatformAdmin?: boolean;
  organizations: {
    organizationId: string;
    displayName?: string | null;
    roles?: { role: { permissions: { permission: { code: string } }[] } }[];
    organization?: { name: string; ticketHeader?: { name?: string } | null };
  }[];
};
export async function getCurrentUser(
  accessToken: string,
): Promise<CurrentUserProfile> {
  const response = await fetch(`${apiBaseUrl}/auth/me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) throw new Error("La sesion no es valida.");
  return (await response.json()) as CurrentUserProfile;
}

export type UserListItem = {
  displayName?: string | null;
  user: { id: string; email: string; active: boolean };
  active: boolean;
  /** Es quien está usando el sistema: no puede cambiar sus propios accesos. */
  isCurrentUser?: boolean;
  roles: { role: { id: string; code: string; name?: string } }[];
  branches: { branch: { id: string; name: string } }[];
};

export type UserCreateOptions = {
  branches: { id: string; name: string; code: string }[];
  roles: { id: string; code: string; name: string }[];
};

export type RoleListItem = {
  id: string;
  code: string;
  name: string;
  description?: string | null;
  /** Usuarios activos que tienen este rol. */
  userCount?: number;
  permissions: { permission: { code: string } }[];
};

export type BranchListItem = {
  id: string;
  code: string;
  name: string;
  active: boolean;
  canAccess?: boolean;
  address?: string;
  city?: string;
  province?: string;
  phone?: string;
};

export type BranchInput = {
  name: string;
  code?: string;
  address?: string;
  city?: string;
  province?: string;
  phone?: string;
};

export async function updateBranch(
  token: string,
  organizationId: string,
  branchId: string,
  data: BranchInput,
) {
  const response = await fetch(
    `${apiBaseUrl}/organizations/${organizationId}/branches/${branchId}`,
    { method: "PATCH", headers: authJson(token), body: JSON.stringify(data) },
  );
  if (!response.ok)
    throw await responseError(response, "No se pudo guardar la sucursal.");
}

export async function changeBranchStatus(
  token: string,
  organizationId: string,
  branchId: string,
  action: "activate" | "deactivate" | "delete",
) {
  const response = await fetch(
    `${apiBaseUrl}/organizations/${organizationId}/branches/${branchId}${action === "delete" ? "" : "/status"}`,
    {
      method: action === "delete" ? "DELETE" : "PATCH",
      headers: authJson(token),
      ...(action !== "delete"
        ? { body: JSON.stringify({ active: action === "activate" }) }
        : {}),
    },
  );
  if (!response.ok)
    throw await responseError(response, "No se pudo actualizar la sucursal.");
}

export async function getUsers(
  accessToken: string,
  organizationId: string,
): Promise<UserListItem[]> {
  const response = await fetch(
    `${apiBaseUrl}/organizations/${organizationId}/users`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (!response.ok) throw new Error("No se pudo cargar usuarios.");
  return (await response.json()) as UserListItem[];
}

export async function getUserCreateOptions(
  accessToken: string,
  organizationId: string,
): Promise<UserCreateOptions> {
  const response = await fetch(
    `${apiBaseUrl}/organizations/${organizationId}/users/create-options`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (!response.ok)
    throw new Error("No se pudieron cargar roles y sucursales.");
  return (await response.json()) as UserCreateOptions;
}

export async function createUser(
  accessToken: string,
  organizationId: string,
  input: {
    displayName?: string;
    email: string;
    password: string;
    branchIds: string[];
    roleIds: string[];
  },
): Promise<void> {
  const response = await fetch(
    `${apiBaseUrl}/organizations/${organizationId}/users`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(input),
    },
  );
  if (!response.ok) {
    const result = (await response.json()) as { message?: string | string[] };
    throw new Error(
      Array.isArray(result.message)
        ? result.message.join(", ")
        : (result.message ?? "No se pudo crear el usuario."),
    );
  }
}

export async function saveUserDisplayName(
  token: string,
  organizationId: string,
  userId: string,
  displayName: string,
): Promise<void> {
  const response = await fetch(
    `${apiBaseUrl}/organizations/${organizationId}/users/${userId}/display-name`,
    {
      method: "PATCH",
      headers: authJson(token),
      body: JSON.stringify({ displayName }),
    },
  );
  if (!response.ok)
    throw await responseError(response, "No se pudo guardar el nombre.");
}

/** Restablece la contrasena de otro usuario y cierra sus sesiones abiertas. */
export async function resetUserPassword(
  token: string,
  organizationId: string,
  userId: string,
  password: string,
): Promise<{ revokedSessions: number }> {
  const response = await fetch(
    `${apiBaseUrl}/organizations/${organizationId}/users/${userId}/password`,
    {
      method: "PATCH",
      headers: authJson(token),
      body: JSON.stringify({ password }),
    },
  );
  if (!response.ok)
    throw await responseError(
      response,
      "No se pudo restablecer la contraseña.",
    );
  return (await response.json()) as { revokedSessions: number };
}

export async function updateUser(
  accessToken: string,
  organizationId: string,
  userId: string,
  input: {
    active: boolean;
    branchIds: string[];
    roleIds: string[];
    displayName?: string;
  },
): Promise<void> {
  const response = await fetch(
    `${apiBaseUrl}/organizations/${organizationId}/users/${userId}`,
    {
      method: "PATCH",
      headers: authJson(accessToken),
      body: JSON.stringify(input),
    },
  );
  if (!response.ok)
    throw await responseError(response, "No se pudo actualizar el usuario.");
}

export async function getRoles(
  accessToken: string,
  organizationId: string,
): Promise<RoleListItem[]> {
  const response = await fetch(
    `${apiBaseUrl}/organizations/${organizationId}/roles`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    },
  );
  if (!response.ok) throw new Error("No se pudieron cargar los roles.");
  return (await response.json()) as RoleListItem[];
}

export async function createRole(
  accessToken: string,
  organizationId: string,
  input: {
    name: string;
    code: string;
    description?: string;
    permissionCodes: string[];
  },
): Promise<void> {
  const response = await fetch(
    `${apiBaseUrl}/organizations/${organizationId}/roles`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(input),
    },
  );
  if (!response.ok)
    throw await responseError(response, "No se pudo crear el rol.");
}

/** Edita nombre, descripción y permisos de un rol. El código no cambia. */
export async function updateRole(
  accessToken: string,
  organizationId: string,
  roleId: string,
  input: { name: string; description: string; permissionCodes: string[] },
): Promise<void> {
  const response = await fetch(
    `${apiBaseUrl}/organizations/${organizationId}/roles/${roleId}`,
    {
      method: "PATCH",
      headers: authJson(accessToken),
      body: JSON.stringify(input),
    },
  );
  if (!response.ok)
    throw await responseError(response, "No se pudo actualizar el rol.");
}

export async function getBranches(
  accessToken: string,
  organizationId: string,
): Promise<BranchListItem[]> {
  const response = await fetch(
    `${apiBaseUrl}/organizations/${organizationId}/branches`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    },
  );
  if (!response.ok) throw new Error("No se pudieron cargar las sucursales.");
  return (await response.json()) as BranchListItem[];
}

export async function createBranch(
  accessToken: string,
  organizationId: string,
  input: BranchInput,
): Promise<void> {
  const response = await fetch(
    `${apiBaseUrl}/organizations/${organizationId}/branches`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(input),
    },
  );
  if (!response.ok)
    throw await responseError(response, "No se pudo crear la sucursal.");
}

export type CatalogProduct = {
  /** Hecho sin conexión y todavía no enviado (SISTEMA-79). */
  porEnviar?: boolean;
  brand?: string | null;
  isMedication?: boolean;
  branchStateUpdatedAt?: string | null;
  branchStatus?: "ACTIVE" | "ARCHIVED" | "DELETED";
  priceDivisor?: number | null;
  priceMarkupBps?: number;
  priceBaseMinor?: string | null;
  image?: { updatedAt: string } | null;
  id: string;
  name: string;
  active: boolean;
  activeIngredient: string | null;
  pharmaceuticalForm: string | null;
  concentration: string | null;
  presentation: string | null;
  externalReferenceSource: "official" | "preciosderemedios" | "alfabeta" | null;
  externalReferenceName: string | null;
  externalReferencePresentation: string | null;
  externalReferenceBarcode: string | null;
  externalReferencePriceMinor: string | null;
  externalReferenceUpdatedAt: string | null;
  externalReferenceCheckedAt: string | null;
  saleUnit: SaleUnit;
  description: string | null;
  prescriptionRequired: boolean;
  category: { id: string; name: string; path?: string } | null;
  laboratory: { id: string; name: string } | null;
  barcodes: {
    code: string;
    primary?: boolean;
    kind?: ProductBarcodeKind;
  }[];
  prices: { amountMinor: string }[];
};
// PACKAGE: código del envase; INTERNAL: SG para etiquetas; EQUIVALENT: EAN de
// un envase importado del mismo medicamento (SISTEMA-20).
export type ProductBarcodeKind = "PACKAGE" | "INTERNAL" | "EQUIVALENT";
async function addEquivalentBarcodeEnLinea(
  token: string,
  organizationId: string,
  productId: string,
  code: string,
): Promise<{ productId: string; productName: string; code: string }> {
  const response = await fetch(
    `${apiBaseUrl}/organizations/${organizationId}/catalog/products/${encodeURIComponent(productId)}/equivalent-barcodes`,
    {
      method: "POST",
      headers: authJson(token),
      body: JSON.stringify({ code }),
    },
  );
  if (!response.ok)
    throw await responseError(
      response,
      "No se pudo asociar el código equivalente.",
    );
  return response.json();
}
async function removeEquivalentBarcodeEnLinea(
  token: string,
  organizationId: string,
  productId: string,
  code: string,
): Promise<void> {
  const response = await fetch(
    `${apiBaseUrl}/organizations/${organizationId}/catalog/products/${encodeURIComponent(productId)}/equivalent-barcodes/${encodeURIComponent(code)}`,
    { method: "DELETE", headers: authJson(token) },
  );
  if (!response.ok)
    throw await responseError(
      response,
      "No se pudo quitar el código equivalente.",
    );
}
export async function productInternalBarcode(
  token: string,
  organizationId: string,
  productId: string,
): Promise<{ code: string | null; name: string; saleUnit: SaleUnit }> {
  const response = await fetch(
    `${apiBaseUrl}/organizations/${organizationId}/catalog/products/${productId}/internal-barcode`,
    { method: "GET", headers: authJson(token) },
  );
  if (!response.ok)
    throw await responseError(
      response,
      "No se pudo obtener el código interno.",
    );
  return response.json();
}
export async function getProductImage(
  token: string,
  organizationId: string,
  productId: string,
  signal?: AbortSignal,
): Promise<string> {
  const response = await fetch(
    `${apiBaseUrl}/organizations/${organizationId}/catalog/products/${encodeURIComponent(productId)}/image`,
    {
      headers: { Authorization: `Bearer ${token}` },
      signal,
      cache: "no-store",
    },
  );
  if (!response.ok)
    throw await responseError(response, "No se pudo cargar la foto.");
  const result = (await response.json()) as { dataUrl: string };
  return result.dataUrl;
}

export type SaleUnit = "BOX" | "BLISTER" | "UNIT";
export type CatalogOptions = {
  categories: CatalogNamedOption[];
  laboratories: CatalogNamedOption[];
};
export type CatalogNamedOption = {
  parentId?: string | null;
  path?: string;
  color?: import("@gestion/contracts").CategoryColor;
  icon?: import("@gestion/contracts").CategoryIcon;
  id: string;
  name: string;
  _count?: { products: number };
  logoUpdatedAt?: string | null;
};

async function laboratoryLogoEnLinea(
  token: string,
  organizationId: string,
  id: string,
  value?: string | null,
  signal?: AbortSignal,
): Promise<string | undefined> {
  const response = await fetch(
    `${apiBaseUrl}/organizations/${organizationId}/catalog/laboratories/${encodeURIComponent(id)}/logo`,
    {
      method: value === undefined ? "GET" : value === null ? "DELETE" : "PATCH",
      headers: authJson(token),
      cache: "no-store",
      signal,
      ...(typeof value === "string"
        ? { body: JSON.stringify({ dataUrl: value }) }
        : {}),
    },
  );
  if (!response.ok)
    throw await responseError(
      response,
      "No se pudo actualizar el logo del laboratorio.",
    );
  if (value === undefined)
    return ((await response.json()) as { dataUrl: string }).dataUrl;
}
export type MedicineReference = {
  pharmaceuticalForm?: string;
  concentration?: string;
  prescriptionRequired?: boolean;
  source: "official" | "preciosderemedios" | "alfabeta";
  name: string;
  presentation: string;
  laboratory: string;
  activeIngredient: string;
  barcode: string;
  troquel: string;
  priceMinor: number | null;
  pamiPriceMinor: number | null;
  updatedAt: string | null;
  saleType: string;
  // Solo en la base de medicamentos.
  referenceUrl?: string | null;
  officialDelisted?: boolean;
  laboratoryMismatch?: string | null;
};
/**
 * Catálogo de la sucursal (o de la organización sin `branchId`). Se baja por
 * partes y sólo lo que cambió desde la última vez; la PC lo guarda y sin
 * conexión lo arma con lo guardado (SISTEMA-74). Sin sesión en la PC (no hay
 * dónde guardarlo) se pide entero, como antes.
 */
async function getCatalogProductsDelServidor(
  token: string,
  organizationId: string,
  branchId?: string,
): Promise<CatalogProduct[]> {
  const alcance = alcanceActual();
  if (!alcance)
    return getCatalogProductsCompleto(token, organizationId, branchId);
  const base = `${apiBaseUrl}/organizations/${organizationId}/catalog/products`;
  const sucursal = branchId ? `branchId=${encodeURIComponent(branchId)}` : "";
  const pedir = async <T>(ruta: string, consulta: string[]) => {
    const response = await fetch(
      `${base}/${ruta}?${[sucursal, ...consulta].filter(Boolean).join("&")}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (!response.ok)
      throw await responseError(response, "No se pudo cargar el catálogo.");
    return (await response.json()) as T;
  };
  const alDia = catalogoAlDia(alcance, organizationId, branchId, {
    versiones: (diccionario) =>
      pedir<VersionesDelCatalogo>(
        "versiones",
        diccionario ? [`diccionario=${encodeURIComponent(diccionario)}`] : [],
      ),
    partes: (partes) =>
      pedir<PartesDelCatalogo>("partes", [`partes=${partes.join(",")}`]),
  });
  try {
    return await alDia;
  } catch {
    // Una API que todavía no tiene el catálogo por partes, o la primera vez
    // sin conexión después de actualizar: el pedido completo de siempre (o su
    // copia guardada).
    return getCatalogProductsCompleto(token, organizationId, branchId);
  }
}

/** El catálogo entero en un solo pedido (sin copia en la PC). */
async function getCatalogProductsCompleto(
  token: string,
  organizationId: string,
  branchId?: string,
): Promise<CatalogProduct[]> {
  const response = await fetch(
    `${apiBaseUrl}/organizations/${organizationId}/catalog/products${branchId ? `?branchId=${encodeURIComponent(branchId)}` : ""}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!response.ok) throw new Error("No se pudo cargar el catalogo.");
  return (await response.json()) as CatalogProduct[];
}

export async function ensureDefaultCatalogCategories(
  token: string,
  organizationId: string,
): Promise<void> {
  const response = await fetch(
    `${apiBaseUrl}/organizations/${organizationId}/catalog/default-categories`,
    { method: "POST", headers: authJson(token) },
  );
  if (!response.ok)
    throw await responseError(
      response,
      "No se pudieron preparar las categorías.",
    );
}

export type MedicineCatalogStatus = {
  items: number;
  lastCheckedAt: string | null;
};

export async function getMedicineCatalogStatus(
  token: string,
  organizationId: string,
): Promise<MedicineCatalogStatus> {
  const response = await fetch(
    `${apiBaseUrl}/organizations/${organizationId}/catalog/medicine-status`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!response.ok)
    throw await responseError(
      response,
      "No se pudo consultar la base de medicamentos.",
    );
  return (await response.json()) as MedicineCatalogStatus;
}
export type AlfaBetaMatch = { id: string; name: string; laboratory: string };
export type AlfaBetaDetail = {
  name: string;
  presentations: {
    presentation: string;
    priceMinor: number | null;
    updatedAt: string | null;
  }[];
};

async function alfaBetaRequest<T>(
  token: string,
  organizationId: string,
  suffix: string,
  signal?: AbortSignal,
): Promise<T> {
  const response = await fetch(
    `${apiBaseUrl}/organizations/${organizationId}/catalog/medicine-references/alfabeta${suffix}`,
    { headers: { Authorization: `Bearer ${token}` }, signal },
  );
  if (!response.ok)
    throw await responseError(response, "No se pudo consultar AlfaBeta.");
  return (await response.json()) as T;
}

export function searchAlfaBeta(
  token: string,
  organizationId: string,
  query: string,
  signal?: AbortSignal,
) {
  return alfaBetaRequest<AlfaBetaMatch[]>(
    token,
    organizationId,
    `?${new URLSearchParams({ q: query })}`,
    signal,
  );
}

export function getAlfaBetaDetail(
  token: string,
  organizationId: string,
  id: string,
  signal?: AbortSignal,
) {
  return alfaBetaRequest<AlfaBetaDetail>(
    token,
    organizationId,
    `/${encodeURIComponent(id)}`,
    signal,
  );
}

/** Sin conexión ahora: la consulta se resuelve con la base de la PC (SISTEMA-69). */
const usarBaseDeLaPc = (token: string) =>
  token === TOKEN_SIN_CONEXION || !conectividad().enLinea;
/** Con conexión y, si se corta en el momento, con la base de la PC. */
async function conBaseDeLaPc<T>(
  token: string,
  conServidor: () => Promise<T>,
  enLaPc: () => Promise<T>,
): Promise<T> {
  if (usarBaseDeLaPc(token)) return enLaPc();
  try {
    return await conServidor();
  } catch (error) {
    if (error instanceof SinConexionError) return enLaPc();
    throw error;
  }
}
export async function searchMedicineReferences(
  token: string,
  organizationId: string,
  query: string,
  source: MedicineReference["source"],
  signal?: AbortSignal,
): Promise<MedicineReference[]> {
  return conBaseDeLaPc(
    token,
    async () => {
      const search = new URLSearchParams({ q: query, source });
      const response = await fetch(
        `${apiBaseUrl}/organizations/${organizationId}/catalog/medicine-references?${search.toString()}`,
        { headers: { Authorization: `Bearer ${token}` }, signal },
      );
      if (!response.ok)
        throw await responseError(
          response,
          "No se pudieron consultar las referencias de medicamentos.",
        );
      return (await response.json()) as MedicineReference[];
    },
    () => buscarMedicamentosEnLaPc(query),
  );
}
export async function getMedicinePacks(
  token: string,
  organizationId: string,
  codes?: string[],
): Promise<PurchasePack[]> {
  return conBaseDeLaPc(
    token,
    async () => {
      const search = new URLSearchParams(
        codes ? { codes: codes.join(",") } : {},
      );
      const response = await fetch(
        `${apiBaseUrl}/organizations/${organizationId}/catalog/medicine-references/packs?${search.toString()}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (!response.ok)
        throw await responseError(
          response,
          "No se pudieron leer los exhibidores.",
        );
      return (await response.json()) as PurchasePack[];
    },
    () => exhibidoresEnLaPc(codes),
  );
}
/** Guarda el exhibidor en el servidor, sin alternativa en la PC. */
export async function enviarExhibidor(
  token: string,
  organizationId: string,
  pack: PurchasePack,
): Promise<void> {
  const response = await fetch(
    `${apiBaseUrl}/organizations/${organizationId}/catalog/medicine-references/packs/${encodeURIComponent(pack.barcode)}`,
    {
      method: "PUT",
      headers: authJson(token),
      body: JSON.stringify({
        baseBarcode: pack.baseBarcode,
        factor: pack.factor,
      }),
    },
  );
  if (!response.ok)
    throw await responseError(response, "No se pudo guardar el exhibidor.");
}
export async function saveMedicinePack(
  token: string,
  organizationId: string,
  pack: PurchasePack,
): Promise<void> {
  return conBaseDeLaPc(
    token,
    () => enviarExhibidor(token, organizationId, pack),
    // Se usa ya en la PC y se manda solo al volver.
    () => guardarExhibidorPendiente(organizationId, pack),
  );
}
export async function lookupMedicineBarcode(
  token: string,
  organizationId: string,
  code: string,
): Promise<{ matches: MedicineReference[] }> {
  return conBaseDeLaPc(
    token,
    async () => {
      const response = await fetch(
        `${apiBaseUrl}/organizations/${organizationId}/catalog/medicine-references/barcode/${encodeURIComponent(code)}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (!response.ok)
        throw await responseError(response, "No se pudo consultar el código.");
      return (await response.json()) as { matches: MedicineReference[] };
    },
    async () => ({ matches: await medicamentosPorCodigo(code) }),
  );
}
/**
 * Baja la base de medicamentos a la PC si cambió desde la que ya tiene
 * (SISTEMA-69). No pasa por la copia local de consultas: se guarda aparte.
 */
export async function actualizarBaseMedicamentos(
  token: string,
  organizationId: string,
) {
  const version = await versionBaseMedicamentos();
  const response = await globalThis.fetch(
    `${apiBaseUrl}/organizations/${organizationId}/catalog/medicine-references/base-local?${new URLSearchParams(version ? { version } : {}).toString()}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!response.ok) return;
  const base = (await response.json()) as {
    version: string;
    items: MedicamentoBase[] | null;
    packs: PurchasePack[] | null;
  };
  if (base.items && base.packs)
    await guardarBaseMedicamentos({
      version: base.version,
      items: base.items,
      packs: base.packs,
    });
}
async function createCatalogProductEnLinea(
  token: string,
  organizationId: string,
  input: {
    generateInternalBarcode?: boolean;
    brand?: string;
    isMedication?: boolean;
    priceDivisor?: number | null;
    priceMarkupBps?: number;
    priceBaseMinor?: number | null;
    imageDataUrl?: string;
    name: string;
    barcode?: string;
    priceMinor: number;
    categoryId?: string;
    laboratoryId?: string;
    laboratoryName?: string;
    activeIngredient?: string;
    pharmaceuticalForm?: string;
    concentration?: string;
    presentation?: string;
    externalReferenceSource?: "official" | "preciosderemedios" | "alfabeta";
    externalReferenceName?: string;
    externalReferencePresentation?: string;
    externalReferenceBarcode?: string;
    externalReferencePriceMinor?: number;
    saleUnit?: SaleUnit;
    description?: string;
    prescriptionRequired?: boolean;
    equivalentBarcodes?: string[];
  },
): Promise<{ id?: string }> {
  const response = await fetch(
    `${apiBaseUrl}/organizations/${organizationId}/catalog/products`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(input),
    },
  );
  if (!response.ok) {
    const result = (await response.json()) as { message?: string | string[] };
    throw new Error(
      Array.isArray(result.message)
        ? result.message.join(", ")
        : (result.message ?? "No se pudo crear el producto."),
    );
  }
  // Compras usa el id para vincular el renglón importado al producto creado.
  const created = (await response.json().catch(() => ({}))) as { id?: unknown };
  return typeof created.id === "string" ? { id: created.id } : {};
}

export async function setCatalogProductActive(
  token: string,
  organizationId: string,
  productId: string,
  active: boolean,
): Promise<void> {
  const response = await fetch(
    `${apiBaseUrl}/organizations/${organizationId}/catalog/products/${productId}`,
    {
      method: "PATCH",
      headers: authJson(token),
      body: JSON.stringify({ active }),
    },
  );
  if (!response.ok)
    throw await responseError(response, "No se pudo actualizar el producto.");
}

async function changeBranchProductEnLinea(
  token: string,
  organizationId: string,
  branchId: string,
  productId: string,
  input: {
    status: "ACTIVE" | "ARCHIVED" | "DELETED";
    expectedStatus: "ACTIVE" | "ARCHIVED" | "DELETED";
    expectedUpdatedAt?: string | null;
    reason: string;
    expectedStock?: number;
    confirmStockWriteOff?: boolean;
  },
): Promise<void> {
  const response = await fetch(
    `${apiBaseUrl}/organizations/${organizationId}/catalog/branches/${branchId}/products/${productId}/state`,
    {
      method: "PATCH",
      headers: authJson(token),
      body: JSON.stringify(input),
    },
  );
  if (!response.ok)
    throw await responseError(
      response,
      "No se pudo cambiar el estado del producto.",
    );
}

async function updateCatalogProductImageEnLinea(
  token: string,
  organizationId: string,
  productId: string,
  imageDataUrl: string | null,
): Promise<void> {
  const response = await fetch(
    `${apiBaseUrl}/organizations/${organizationId}/catalog/products/${productId}/details`,
    {
      method: "PATCH",
      headers: authJson(token),
      body: JSON.stringify({ imageDataUrl }),
    },
  );
  if (!response.ok)
    throw await responseError(response, "No se pudo guardar la foto.");
}

async function updateCatalogProductEnLinea(
  token: string,
  organizationId: string,
  productId: string,
  input: {
    generateInternalBarcode?: boolean;
    brand?: string | null;
    isMedication?: boolean;
    priceDivisor?: number | null;
    priceMarkupBps?: number;
    priceBaseMinor?: number | null;
    imageDataUrl?: string | null;
    name: string;
    barcode: string;
    priceMinor?: number;
    categoryId: string | null;
    laboratoryId: string | null;
    activeIngredient: string;
    pharmaceuticalForm: string;
    concentration: string;
    presentation: string;
    externalReferenceSource?:
      "official" | "preciosderemedios" | "alfabeta" | null;
    externalReferenceName?: string | null;
    externalReferencePresentation?: string | null;
    externalReferenceBarcode?: string | null;
    externalReferencePriceMinor?: number | null;
    saleUnit: SaleUnit;
    description: string;
    prescriptionRequired: boolean;
  },
): Promise<void> {
  const response = await fetch(
    `${apiBaseUrl}/organizations/${organizationId}/catalog/products/${productId}/details`,
    { method: "PATCH", headers: authJson(token), body: JSON.stringify(input) },
  );
  if (!response.ok)
    throw await responseError(response, "No se pudo editar el producto.");
}

async function deleteUnusedCatalogProductEnLinea(
  token: string,
  organizationId: string,
  productId: string,
): Promise<void> {
  const response = await fetch(
    `${apiBaseUrl}/organizations/${organizationId}/catalog/products/${productId}`,
    { method: "DELETE", headers: { Authorization: `Bearer ${token}` } },
  );
  if (!response.ok)
    throw await responseError(response, "No se pudo eliminar el producto.");
}

async function getCatalogOptionsDelServidor(
  token: string,
  organizationId: string,
): Promise<CatalogOptions> {
  const response = await fetch(
    `${apiBaseUrl}/organizations/${organizationId}/catalog/options`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!response.ok)
    throw await responseError(response, "No se pudieron cargar las opciones.");
  const result = (await response.json()) as CatalogOptions;
  return {
    ...result,
    categories: result.categories.map((item) => ({
      ...item,
      path: categoryPath(item, result.categories),
    })),
  };
}

export async function resolveExternalCategory(
  token: string,
  organizationId: string,
  candidate: { code: string; fingerprint: string; source: string },
): Promise<{ categoryId: string | null; created: number }> {
  const response = await fetch(
    `${apiBaseUrl}/organizations/${organizationId}/catalog/external-products/barcode/${encodeURIComponent(candidate.code)}/category`,
    {
      method: "POST",
      headers: authJson(token),
      body: JSON.stringify({
        fingerprint: candidate.fingerprint,
        source: candidate.source,
      }),
    },
  );
  if (!response.ok)
    throw await responseError(
      response,
      "No se pudo completar la categoría. Intentá nuevamente.",
    );
  return response.json() as Promise<{
    categoryId: string | null;
    created: number;
  }>;
}

async function createCatalogNamedItemEnLinea(
  token: string,
  organizationId: string,
  type: "categories" | "laboratories",
  name: string,
  icon?: import("@gestion/contracts").CategoryIcon,
  color?: import("@gestion/contracts").CategoryColor,
  parentId?: string | null,
): Promise<CatalogOptions["categories"][number]> {
  const response = await fetch(
    `${apiBaseUrl}/organizations/${organizationId}/catalog/${type}`,
    {
      method: "POST",
      headers: authJson(token),
      body: JSON.stringify({
        name,
        ...(type === "categories" && parentId !== undefined
          ? { parentId }
          : {}),
        ...(type === "categories" && icon ? { icon } : {}),
        ...(type === "categories" && color ? { color } : {}),
      }),
    },
  );
  if (!response.ok)
    throw await responseError(response, "No se pudo guardar la opción.");
  return response.json() as Promise<CatalogOptions["categories"][number]>;
}

async function updateCategoryIconEnLinea(
  token: string,
  organizationId: string,
  id: string,
  icon: import("@gestion/contracts").CategoryIcon,
  color?: import("@gestion/contracts").CategoryColor,
): Promise<void> {
  const response = await fetch(
    `${apiBaseUrl}/organizations/${organizationId}/catalog/categories/${encodeURIComponent(id)}/icon`,
    {
      method: "PATCH",
      headers: authJson(token),
      body: JSON.stringify({ icon, color }),
    },
  );
  if (!response.ok)
    throw await responseError(response, "No se pudo guardar el icono.");
}

export type PriceList = {
  fallbackPriceListId?: string | null;
  updatedAt?: string;
  id: string;
  name: string;
  prices: { productId: string; amountMinor: string }[];
};
async function changeCatalogNamedItemEnLinea(
  token: string,
  organizationId: string,
  type: "categories" | "laboratories",
  id: string,
  name?: string,
  parentId?: string | null,
): Promise<void> {
  const response = await fetch(
    `${apiBaseUrl}/organizations/${organizationId}/catalog/${type}/${encodeURIComponent(id)}`,
    {
      method: name === undefined ? "DELETE" : "PATCH",
      headers: authJson(token),
      ...(name === undefined
        ? {}
        : {
            body: JSON.stringify({
              name,
              ...(type === "categories" && parentId !== undefined
                ? { parentId }
                : {}),
            }),
          }),
    },
  );
  if (!response.ok)
    throw await responseError(
      response,
      "No se pudo actualizar la categoría o laboratorio.",
    );
}
async function getPriceListsDelServidor(
  token: string,
  organizationId: string,
): Promise<PriceList[]> {
  const response = await fetch(
    `${apiBaseUrl}/organizations/${organizationId}/catalog/price-lists`,
    {
      headers: { Authorization: `Bearer ${token}` },
    },
  );
  if (!response.ok)
    throw await responseError(
      response,
      "No se pudieron cargar las listas de precios.",
    );
  return (await response.json()) as PriceList[];
}
async function createPriceListEnLinea(
  token: string,
  organizationId: string,
  name: string,
  includeAll = false,
): Promise<{ id: string }> {
  const response = await fetch(
    `${apiBaseUrl}/organizations/${organizationId}/catalog/price-lists`,
    {
      method: "POST",
      headers: authJson(token),
      body: JSON.stringify({ name, includeAll }),
    },
  );
  if (!response.ok)
    throw await responseError(
      response,
      "No se pudo crear la lista de precios.",
    );
  return (await response.json()) as { id: string };
}
export async function setProductPrice(
  token: string,
  organizationId: string,
  priceListId: string,
  productId: string,
  amountMinor: number,
): Promise<void> {
  const response = await fetch(
    `${apiBaseUrl}/organizations/${organizationId}/catalog/price-lists/${priceListId}/products/${productId}`,
    {
      method: "PATCH",
      headers: authJson(token),
      body: JSON.stringify({ amountMinor }),
    },
  );
  if (!response.ok)
    throw await responseError(response, "No se pudo actualizar el precio.");
}

export type CustomerBilling = Partial<
  Record<
    | "notes"
    | "billingName"
    | "billingTaxId"
    | "billingVatCondition"
    | "billingAddress"
    | "billingCity"
    | "billingProvince"
    | "billingPostalCode"
    | "billingEmail"
    | "billingPhone",
    string | null
  >
>;
export type Party = CustomerBilling & {
  phone?: string | null;
  email?: string | null;
  contactName?: string | null;
  address?: string | null;
  notes?: string | null;
  accountEnabled?: boolean;
  accountTermDays?: number | null;
  updatedAt?: string;
  priceListId?: string | null;
  id: string;
  name: string;
  document?: string | null;
  taxId?: string | null;
  active: boolean;
  /** Dado de alta sin conexión y todavía no enviado (SISTEMA-70). */
  porEnviar?: boolean;
};
export type AccountActor = { id: string; name: string | null };
export type CustomerAccount = {
  document?: string | null;
  billingTaxId?: string | null;
  billingPhone?: string | null;
  accountTermDays?: number | null;
  id: string;
  name: string;
  creditEnabled: boolean;
  createdBy?: AccountActor | null;
  creditEnabledBy?: AccountActor | null;
  active: boolean;
  creditLimitMinor: string | null;
  balanceMinor: string;
  /** Dado de alta sin conexión y todavía no enviado (SISTEMA-70). */
  porEnviar?: boolean;
  /** Cantidad de movimientos (SISTEMA-75). */
  movementCount?: number;
  /** Último cobro de la cuenta (SISTEMA-75). */
  lastPayment?: { amountMinor: string; createdAt: string } | null;
  /**
   * El listado ya no trae los movimientos: se piden al abrir el cliente
   * (`getCustomerAccountMovements`). Sólo vienen cuando hicieron falta para
   * no contar dos veces lo que la PC ya envió (SISTEMA-75).
   */
  movements?: CustomerAccountMovement[];
};
export type CustomerAccountMovement = {
  /** Hecho sin conexión y todavía no enviado (SISTEMA-70). */
  porEnviar?: boolean;
  /** Sucursal y si va en el resumen impreso (SISTEMA-78). */
  branchId?: string;
  showInStatement?: boolean;
  clientOperationId?: string | null;
  isPriceAdjustment?: boolean;
  isDebtAdjustment?: boolean;
  id: string;
  type: "DEBIT" | "CREDIT";
  amountMinor: string;
  note: string | null;
  createdAt: string;
  paymentMethod?: string | null;
  saleId?: string | null;
};
export type ItemAllocation = {
  saleItemId: string;
  amountMinor: number;
  expectedPendingMinor?: number;
  nextPendingMinor?: number;
};
export type AccountItems = {
  balanceMinor: string;
  items: {
    saleItemId: string;
    saleId: string;
    productId?: string | null;
    description?: string | null;
    /** Si se le puede aplicar el aumento por precio de referencia. */
    comparable?: boolean;
    /** De una venta hecha sin conexión que todavía no llegó (SISTEMA-70). */
    porEnviar?: boolean;
    name: string;
    quantity: number;
    financedMinor: string;
    paidMinor: string;
    pendingMinor: string;
    createdAt: string | null;
    previousPriceMinor: string;
    referencePriceMinor: string | null;
    referenceCheckedAt: string | null;
    increaseMinor: string;
  }[];
  unassignedReceipts: { id: string; amountMinor: string; createdAt: string }[];
  mixedSales: {
    saleId: string;
    movementId: string;
    financedMinor: string;
    items: {
      saleItemId: string;
      name: string;
      quantity: number;
      subtotalMinor: string;
    }[];
  }[];
};
export type AccountPricePreview = {
  fingerprint: string;
  items: AccountItems["items"];
  increaseMinor: string;
  pendingMinor: string;
  nextPendingMinor: string;
};
async function previewAccountPricesEnLinea(
  token: string,
  org: string,
  branch: string,
  customer: string,
  sale: string,
): Promise<AccountPricePreview> {
  const response = await fetch(
    `${apiBaseUrl}/organizations/${org}/branches/${branch}/customer-accounts/${customer}/sales/${sale}/price-update`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!response.ok)
    throw await responseError(
      response,
      "No se pudo consultar la actualización.",
    );
  return (await response.json()) as AccountPricePreview;
}
async function updateAccountPricesEnLinea(
  token: string,
  org: string,
  branch: string,
  customer: string,
  sale: string,
  fingerprint: string,
  clientOperationId: string,
): Promise<void> {
  const response = await fetch(
    `${apiBaseUrl}/organizations/${org}/branches/${branch}/customer-accounts/${customer}/sales/${sale}/price-update`,
    {
      method: "POST",
      headers: authJson(token),
      body: JSON.stringify({ fingerprint, clientOperationId }),
    },
  );
  if (!response.ok)
    throw await responseError(response, "No se pudo actualizar la deuda.");
}
async function increaseAccountDebtEnLinea(
  token: string,
  org: string,
  branch: string,
  customer: string,
  item: string,
  input: {
    expectedPendingMinor: number;
    nextPendingMinor: number;
    reason: string;
    clientOperationId: string;
  },
): Promise<void> {
  const response = await fetch(
    `${apiBaseUrl}/organizations/${org}/branches/${branch}/customer-accounts/${customer}/items/${item}/debt-increase`,
    {
      method: "POST",
      headers: authJson(token),
      body: JSON.stringify(input),
    },
  );
  if (!response.ok)
    throw await responseError(response, "No se pudo aumentar la deuda.");
}
async function increaseAccountTotalDebtEnLinea(
  token: string,
  org: string,
  branch: string,
  customer: string,
  input: {
    expectedPendingMinor: number;
    nextPendingMinor: number;
    reason: string;
    clientOperationId: string;
    expectedItems: { saleItemId: string; pendingMinor: string }[];
  },
): Promise<void> {
  const response = await fetch(
    `${apiBaseUrl}/organizations/${org}/branches/${branch}/customer-accounts/${customer}/debt-increase`,
    { method: "POST", headers: authJson(token), body: JSON.stringify(input) },
  );
  if (!response.ok)
    throw await responseError(response, "No se pudo aumentar el saldo total.");
}
async function getAccountItemsDelServidor(
  token: string,
  org: string,
  branch: string,
  customer: string,
): Promise<AccountItems> {
  const response = await fetch(
    `${apiBaseUrl}/organizations/${org}/branches/${branch}/customer-accounts/${customer}/items`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!response.ok)
    throw await responseError(
      response,
      "No se pudieron cargar los artículos pendientes.",
    );
  return (await response.json()) as AccountItems;
}
async function assignAccountItemsEnLinea(
  token: string,
  org: string,
  branch: string,
  customer: string,
  movement: string,
  allocations: ItemAllocation[],
): Promise<void> {
  const response = await fetch(
    `${apiBaseUrl}/organizations/${org}/branches/${branch}/customer-accounts/${customer}/movements/${movement}/allocations`,
    {
      method: "POST",
      headers: authJson(token),
      body: JSON.stringify({ allocations }),
    },
  );
  if (!response.ok)
    throw await responseError(
      response,
      "No se pudieron asignar los artículos.",
    );
}
export type AccountSaleDetail = {
  id: string;
  status: string;
  completedAt: string | null;
  totalMinor: string;
  accountAmountMinor: string;
  items: {
    id: string;
    name: string;
    quantity: number;
    unitPriceMinor: string;
    discountMinor: string;
    subtotalMinor: string;
  }[];
};
async function getAccountSaleDetailDelServidor(
  token: string,
  organizationId: string,
  branchId: string,
  customerId: string,
  movementId: string,
): Promise<AccountSaleDetail> {
  const response = await fetch(
    `${apiBaseUrl}/organizations/${organizationId}/branches/${branchId}/customer-accounts/${customerId}/movements/${movementId}/sale`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!response.ok)
    throw await responseError(
      response,
      "No se pudo cargar el detalle de la compra.",
    );
  return (await response.json()) as AccountSaleDetail;
}
async function getCustomerAccountsDelServidor(
  token: string,
  organizationId: string,
  branchId: string,
): Promise<CustomerAccount[]> {
  const response = await fetch(
    `${apiBaseUrl}/organizations/${organizationId}/branches/${branchId}/customer-accounts`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!response.ok)
    throw await responseError(
      response,
      "No se pudieron cargar las cuentas corrientes.",
    );
  return (await response.json()) as CustomerAccount[];
}
/** Movimientos de un cliente como los tiene el servidor (o su copia en la PC). */
export async function getCustomerAccountMovementsDelServidor(
  token: string,
  organizationId: string,
  branchId: string,
  customerId: string,
): Promise<CustomerAccountMovement[]> {
  const response = await fetch(
    `${apiBaseUrl}/organizations/${organizationId}/branches/${branchId}/customer-accounts/${customerId}/movements`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!response.ok)
    throw await responseError(
      response,
      "No se pudieron cargar los movimientos del cliente.",
    );
  return (await response.json()) as CustomerAccountMovement[];
}
async function configureCustomerAccountEnLinea(
  token: string,
  organizationId: string,
  branchId: string,
  customerId: string,
  enabled: boolean,
  creditLimitMinor: number | null,
  accountTermDays?: number | null,
): Promise<void> {
  const response = await fetch(
    `${apiBaseUrl}/organizations/${organizationId}/branches/${branchId}/customer-accounts/${customerId}`,
    {
      method: "PATCH",
      headers: authJson(token),
      body: JSON.stringify({ enabled, creditLimitMinor, accountTermDays }),
    },
  );
  if (!response.ok)
    throw await responseError(
      response,
      "No se pudo configurar la cuenta corriente.",
    );
}
async function createCustomerAccountReceiptEnLinea(
  token: string,
  organizationId: string,
  branchId: string,
  customerId: string,
  amountMinor: number,
  method: "CASH" | "CARD" | "TRANSFER" | "OTHER",
  note?: string,
  cashSessionId?: string,
  clientOperationId: string = crypto.randomUUID(),
  allocations: ItemAllocation[] = [],
  payments?: { method: "CASH" | "CARD" | "TRANSFER"; amountMinor: number }[],
): Promise<{ id: string; amountMinor: string }> {
  const response = await fetch(
    `${apiBaseUrl}/organizations/${organizationId}/branches/${branchId}/customer-accounts/${customerId}/receipts`,
    {
      method: "POST",
      headers: authJson(token),
      body: JSON.stringify({
        amountMinor,
        method,
        note,
        cashSessionId,
        clientOperationId,
        allocations,
        payments,
      }),
    },
  );
  if (!response.ok)
    throw await responseError(response, "No se pudo registrar el cobro.");
  return response.json();
}

export interface AccountReceipt {
  payments?: { method: string; amountMinor: string }[];
  store?: {
    name: string;
    address?: string;
    contact?: string;
    logoRaster?: string;
  };
  cashier?: string;
  id: string;
  createdAt: string;
  customerName: string;
  branchName: string;
  amountMinor: string;
  method: string | null;
  note: string | null;
  balanceAfterMinor: string | null;
  items: { name: string; saleId: string; amountMinor: string }[];
}

async function getAccountReceiptDelServidor(
  token: string,
  organizationId: string,
  branchId: string,
  customerId: string,
  receiptId: string,
): Promise<AccountReceipt> {
  const response = await fetch(
    `${apiBaseUrl}/organizations/${organizationId}/branches/${branchId}/customer-accounts/${customerId}/receipts/${receiptId}`,
    { headers: authJson(token) },
  );
  if (!response.ok)
    throw await responseError(response, "No se pudo cargar el comprobante.");
  return response.json();
}
async function getPartiesDelServidor(
  token: string,
  organizationId: string,
  type: "customers" | "suppliers",
): Promise<Party[]> {
  const response = await fetch(
    `${apiBaseUrl}/organizations/${organizationId}/${type}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!response.ok) throw new Error("No se pudo cargar el listado.");
  return (await response.json()) as Party[];
}
export type SupplierProfileInput = {
  accountEnabled: boolean;
  accountTermDays: number | null;
  name?: string;
  phone?: string;
  email?: string;
  contactName?: string;
  address?: string;
  notes?: string;
};
async function createPartyEnLinea(
  token: string,
  organizationId: string,
  type: "customers" | "suppliers",
  name: string,
  document: string,
  priceListId?: string,
  billing?: CustomerBilling,
  supplierTerms?: SupplierProfileInput,
): Promise<{ id: string }> {
  const response = await fetch(
    `${apiBaseUrl}/organizations/${organizationId}/${type}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name,
        document: document || undefined,
        priceListId,
        ...(type === "customers" ? { billing } : {}),
        ...(type === "suppliers" ? supplierTerms : {}),
      }),
    },
  );
  if (!response.ok) throw await responseError(response, "No se pudo guardar.");
  return response.json() as Promise<{ id: string }>;
}

/**
 * Editar un proveedor: sin conexión (o si tiene algo sin enviar) queda en la
 * PC con los campos que cambiaron (SISTEMA-73).
 */
export async function updateSupplierTerms(
  token: string,
  organizationId: string,
  supplier: Party,
  terms: SupplierProfileInput,
  branchId?: string,
): Promise<DondeQuedo> {
  const enLinea = () =>
    updateSupplierTermsEnLinea(token, organizationId, supplier, terms);
  if (!branchId) {
    await enLinea();
    return "SERVIDOR";
  }
  return proveedorConRespaldo(
    token,
    organizationId,
    supplier.id,
    enLinea,
    async () => {
      const cuerpo = camposCambiados(supplier, terms);
      if (!Object.keys(cuerpo).length) return;
      await guardarOperacionProveedor(organizationId, branchId, {
        tipo: "EDICION",
        supplierId: supplier.id,
        cuerpo,
      });
    },
  );
}

async function updateSupplierTermsEnLinea(
  token: string,
  organizationId: string,
  supplier: Party,
  terms: SupplierProfileInput,
) {
  const response = await fetch(
    `${apiBaseUrl}/organizations/${organizationId}/suppliers/${supplier.id}/terms`,
    {
      method: "PATCH",
      headers: authJson(token),
      body: JSON.stringify({ ...terms, expectedUpdatedAt: supplier.updatedAt }),
    },
  );
  if (!response.ok)
    throw await responseError(
      response,
      "No se pudo guardar la condición del proveedor.",
    );
}

async function updateCustomerBillingEnLinea(
  token: string,
  organizationId: string,
  customerId: string,
  billing: CustomerBilling & { name?: string; priceListId?: string | null },
): Promise<void> {
  const response = await fetch(
    `${apiBaseUrl}/organizations/${organizationId}/customers/${customerId}/billing`,
    {
      method: "PATCH",
      headers: authJson(token),
      body: JSON.stringify(billing),
    },
  );
  if (!response.ok)
    throw await responseError(
      response,
      "No se pudieron guardar los datos de facturación.",
    );
}

/** Dar de baja o restaurar: sin conexión queda en la PC (SISTEMA-73). */
export async function setSupplierActive(
  token: string,
  organizationId: string,
  supplierId: string,
  active: boolean,
  branchId?: string,
): Promise<DondeQuedo> {
  const enLinea = () =>
    setSupplierActiveEnLinea(token, organizationId, supplierId, active);
  if (!branchId) {
    await enLinea();
    return "SERVIDOR";
  }
  return proveedorConRespaldo(token, organizationId, supplierId, enLinea, () =>
    guardarOperacionProveedor(organizationId, branchId, {
      tipo: "ESTADO",
      supplierId,
      cuerpo: { active },
    }).then(() => undefined),
  );
}

async function setSupplierActiveEnLinea(
  token: string,
  organizationId: string,
  supplierId: string,
  active: boolean,
): Promise<void> {
  const response = await fetch(
    `${apiBaseUrl}/organizations/${organizationId}/suppliers/${supplierId}${active ? "/restore" : ""}`,
    { method: active ? "POST" : "DELETE", headers: authJson(token) },
  );
  if (!response.ok)
    throw await responseError(response, "No se pudo actualizar el proveedor.");
}

export async function setCustomerActive(
  token: string,
  organizationId: string,
  customerId: string,
  active: boolean,
): Promise<void> {
  const response = await fetch(
    `${apiBaseUrl}/organizations/${organizationId}/customers/${customerId}${active ? "/restore" : ""}`,
    { method: active ? "POST" : "DELETE", headers: authJson(token) },
  );
  if (!response.ok)
    throw await responseError(response, "No se pudo actualizar el cliente.");
}

export type StockLot = {
  /** Con un movimiento hecho sin conexión que todavía no llegó (SISTEMA-79). */
  porEnviar?: boolean;
  metadataVersion: number;
  sellableQuantity: number;
  expiredQuantity: number;
  expiryStatus: "EXPIRED" | "EXPIRING_SOON" | "AVAILABLE";
  id: string;
  productId: string;
  productName: string;
  number: string;
  quantity: number;
  expiresAt: string | null;
  /** Solo llega con permiso para ver costos. */
  unitCostMinor?: string;
  createdAt?: string;
  packFactor?: number | null;
  packCount?: number;
  // quantity: lo que le queda en el lote, gastando primero lo más viejo. En 0
  // si ya salió todo lo suyo.
  suppliers?: { id: string; name: string; quantity: number }[];
  // Stock del lote cargado como Sin proveedor.
  unassignedQuantity?: number;
};

/**
 * Stock de la sucursal. Se baja por partes y sólo lo que cambió desde la
 * última vez; la PC lo guarda y sin conexión lo arma con lo guardado
 * (SISTEMA-77, como el catálogo). Sin sesión en la PC se pide entero.
 */
async function getStockDelServidor(
  token: string,
  organizationId: string,
  branchId: string,
): Promise<StockLot[]> {
  const alcance = alcanceActual();
  if (!alcance) return getStockCompleto(token, organizationId, branchId);
  const base = `${apiBaseUrl}/organizations/${organizationId}/branches/${branchId}/inventory/stock`;
  const pedir = async <T>(ruta: string) => {
    const response = await fetch(`${base}/${ruta}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) throw new Error("No se pudo cargar el stock.");
    return (await response.json()) as T;
  };
  try {
    return await copiaAlDia<LoteGuardado, never, StockLot[]>({
      base: `${alcance}|stock|${organizationId}|${branchId}|`,
      versiones: () => pedir<{ partes: Record<string, string> }>("versiones"),
      partes: async (partes) => {
        const respuesta = await pedir<{
          versiones: Record<string, string | null>;
          lotes: StockLot[];
        }>(`partes?partes=${partes.join(",")}`);
        return {
          versiones: respuesta.versiones,
          elementos: respuesta.lotes.map(sinDisponibilidad),
        };
      },
      parteDe: (lote) => lote.productId.slice(0, 2).toLowerCase(),
      armar: (partes) => armarStock(partes),
      // Vencido o por vencer depende del día: se vuelve a calcular cada día.
      vigencia: () => new Date().toDateString(),
    });
  } catch {
    // Una API que todavía no tiene el stock por partes, o la primera vez sin
    // conexión después de actualizar: el pedido completo (o su copia).
    return getStockCompleto(token, organizationId, branchId);
  }
}

/** Lote guardado en la PC: sin lo que depende del día, que se calcula al armar. */
type LoteGuardado = Omit<
  StockLot,
  "sellableQuantity" | "expiredQuantity" | "expiryStatus"
>;

function sinDisponibilidad(lote: StockLot): LoteGuardado {
  const guardado: Partial<StockLot> = { ...lote };
  delete guardado.sellableQuantity;
  delete guardado.expiredQuantity;
  delete guardado.expiryStatus;
  return guardado as LoteGuardado;
}

/** Arma el stock como el pedido completo: primero lo que vence antes. */
export function armarStock(partes: Iterable<LoteGuardado[]>): StockLot[] {
  const lotes: LoteGuardado[] = [];
  for (const parte of partes) lotes.push(...parte);
  return lotes
    .sort(
      (a, b) =>
        (a.expiresAt ?? "\uffff").localeCompare(b.expiresAt ?? "\uffff") ||
        (a.createdAt ?? "").localeCompare(b.createdAt ?? "") ||
        a.id.localeCompare(b.id),
    )
    .map((lote) => withStockAvailability(lote));
}

/** El stock entero en un solo pedido. */
async function getStockCompleto(
  token: string,
  organizationId: string,
  branchId: string,
): Promise<StockLot[]> {
  const response = await fetch(
    `${apiBaseUrl}/organizations/${organizationId}/branches/${branchId}/inventory/stock`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!response.ok) throw new Error("No se pudo cargar el stock.");
  return ((await response.json()) as StockLot[]).map((lot) =>
    withStockAvailability(lot),
  );
}

export type LotCostReceipt = {
  quantity: number;
  // null: recepción vieja cuyo costo ya no se conoce.
  unitCostMinor: string | null;
  receivedAt: string;
  supplierId?: string | null;
};
export type LotAdjustment = {
  // Una API anterior no lo envía: sin dato es un ajuste.
  kind?: "ADJUSTMENT" | "RETURN";
  lotId: string;
  // Positivo suma, negativo resta.
  quantity: number;
  reason: string;
  adjustedAt: string;
  supplierId?: string | null;
  unitCostMinor?: string | null;
};
export type InventoryCosts = {
  products: { productId: string; unitCostMinor: string; receivedAt: string }[];
  lots: { lotId: string; receipts: LotCostReceipt[] }[];
  // La web y la API se publican por separado: una API anterior no los envía.
  adjustments?: LotAdjustment[];
  suppliers?: { id: string; name: string }[];
};

/**
 * Costos de la sucursal, por partes como el stock (SISTEMA-78): una venta no
 * cambia ningún costo, así que no se vuelve a bajar nada; una recepción baja
 * sólo la parte de ese producto. Sin sesión en la PC se piden enteros.
 */
export async function getInventoryCosts(
  token: string,
  organizationId: string,
  branchId: string,
): Promise<InventoryCosts> {
  const alcance = alcanceActual();
  if (!alcance)
    return getInventoryCostsCompletos(token, organizationId, branchId);
  const base = `${apiBaseUrl}/organizations/${organizationId}/branches/${branchId}/inventory/costs`;
  const pedir = async <T>(ruta: string) => {
    const response = await fetch(`${base}/${ruta}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok)
      throw await responseError(response, "No se pudieron cargar los costos.");
    return (await response.json()) as T;
  };
  try {
    return await copiaAlDia<CostosDeParte, never, InventoryCosts>({
      base: `${alcance}|costos|${organizationId}|${branchId}|`,
      versiones: () => pedir<{ partes: Record<string, string> }>("versiones"),
      partes: async (partes) => {
        const respuesta = await pedir<{
          versiones: Record<string, string | null>;
          partes: Record<string, InventoryCosts>;
        }>(`partes?partes=${partes.join(",")}`);
        return {
          versiones: respuesta.versiones,
          elementos: Object.entries(respuesta.partes).map(
            ([parte, costos]) => ({ parte, costos }),
          ),
        };
      },
      parteDe: (elemento) => elemento.parte,
      armar: (partes) => juntarCostos(partes),
    });
  } catch {
    // Una API que todavía no tiene los costos por partes, o la primera vez sin
    // conexión después de actualizar: el pedido completo (o su copia).
    return getInventoryCostsCompletos(token, organizationId, branchId);
  }
}

/** Costos de una parte, como los guarda la PC. */
type CostosDeParte = { parte: string; costos: InventoryCosts };

/** Junta los costos de las partes como el pedido completo. */
export function juntarCostos(
  partes: Iterable<CostosDeParte[]>,
): InventoryCosts {
  const r: Required<InventoryCosts> = {
    products: [],
    lots: [],
    adjustments: [],
    suppliers: [],
  };
  const proveedores = new Set<string>();
  for (const parte of partes)
    for (const { costos } of parte) {
      r.products.push(...costos.products);
      r.lots.push(...costos.lots);
      r.adjustments.push(...(costos.adjustments ?? []));
      for (const proveedor of costos.suppliers ?? [])
        if (!proveedores.has(proveedor.id)) {
          proveedores.add(proveedor.id);
          r.suppliers.push(proveedor);
        }
    }
  return r;
}

/** Los costos enteros en un solo pedido. */
async function getInventoryCostsCompletos(
  token: string,
  organizationId: string,
  branchId: string,
): Promise<InventoryCosts> {
  const response = await fetch(
    `${apiBaseUrl}/organizations/${organizationId}/branches/${branchId}/inventory/costs`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!response.ok)
    throw await responseError(response, "No se pudieron cargar los costos.");
  return (await response.json()) as InventoryCosts;
}

async function receiveStockEnLinea(
  token: string,
  organizationId: string,
  branchId: string,
  input: {
    productId: string;
    supplierId: string | null;
    lotNumber: string;
    quantity: number;
    unitCostMinor: number;
    expiresAt?: string;
  },
): Promise<void> {
  const response = await fetch(
    `${apiBaseUrl}/organizations/${organizationId}/branches/${branchId}/inventory/receipts`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(input),
    },
  );
  if (!response.ok)
    throw await responseError(response, "No se pudo recibir stock.");
}

async function adjustStockEnLinea(
  token: string,
  organizationId: string,
  branchId: string,
  input: {
    lotId: string;
    quantity: number;
    reason: string;
    // null es Sin proveedor.
    supplierId: string | null;
    unitCostMinor?: number;
  },
): Promise<void> {
  const response = await fetch(
    `${apiBaseUrl}/organizations/${organizationId}/branches/${branchId}/inventory/adjustments`,
    { method: "POST", headers: authJson(token), body: JSON.stringify(input) },
  );
  if (!response.ok)
    throw await responseError(response, "No se pudo ajustar el stock.");
}

async function createSupplierReturnEnLinea(
  token: string,
  organizationId: string,
  branchId: string,
  input: {
    supplierId: string | null;
    lotId: string;
    quantity: number;
    reason: string;
  },
): Promise<void> {
  const response = await fetch(
    `${apiBaseUrl}/organizations/${organizationId}/branches/${branchId}/inventory/supplier-returns`,
    { method: "POST", headers: authJson(token), body: JSON.stringify(input) },
  );
  if (!response.ok)
    throw await responseError(
      response,
      "No se pudo registrar la devolución al proveedor.",
    );
}

export type CashRegister = {
  responsibleName?: string | null;
  id: string;
  name: string;
  active: boolean;
  code?: string | null;
};
export type CashSettings = {
  allowWithoutSession: boolean;
  askOpeningAmount: boolean;
  requireMovementReason: boolean;
  allowManualMovements: boolean;
  defaultRegisterId: string | null;
  version: number;
};
export async function cashSettingsRequest(
  token: string,
  organizationId: string,
  branchId: string,
  settings?: CashSettings,
): Promise<CashSettings> {
  const response = await fetch(
    `${apiBaseUrl}/organizations/${organizationId}/branches/${branchId}/cash/settings`,
    {
      method: settings ? "PATCH" : "GET",
      headers: authJson(token),
      body: settings ? JSON.stringify(settings) : undefined,
    },
  );
  if (!response.ok)
    throw await responseError(
      response,
      "No se pudieron guardar o consultar las reglas de caja.",
    );
  return (await response.json()) as CashSettings;
}
export type CashManagement = {
  canArchive: boolean;
  canManage: boolean;
  registers: CashRegister[];
};
export async function getCashManagement(
  token: string,
  organizationId: string,
  branchId: string,
): Promise<CashManagement> {
  const response = await fetch(
    `${apiBaseUrl}/organizations/${organizationId}/branches/${branchId}/cash/management`,
    { headers: authJson(token) },
  );
  if (!response.ok)
    throw await responseError(
      response,
      "No se pudo cargar la gestión de cajas.",
    );
  return (await response.json()) as CashManagement;
}
export async function editCashRegister(
  token: string,
  organizationId: string,
  branchId: string,
  register: CashRegister,
  name: string,
  active: boolean,
  responsibleName?: string | null,
): Promise<void> {
  const response = await fetch(
    `${apiBaseUrl}/organizations/${organizationId}/branches/${branchId}/cash/registers/${register.id}`,
    {
      method: "PATCH",
      headers: authJson(token),
      body: JSON.stringify({
        name,
        active,
        expectedName: register.name,
        expectedActive: register.active,
        ...(responsibleName !== undefined
          ? {
              responsibleName,
              expectedResponsibleName: register.responsibleName ?? null,
            }
          : {}),
      }),
    },
  );
  if (!response.ok)
    throw await responseError(response, "No se pudo modificar la caja.");
}
export async function archiveCashClosure(
  token: string,
  organizationId: string,
  branchId: string,
  id: string,
  archived: boolean,
  reason: string,
): Promise<void> {
  const response = await fetch(
    `${apiBaseUrl}/organizations/${organizationId}/branches/${branchId}/cash/closures/${id}`,
    {
      method: "PATCH",
      headers: authJson(token),
      body: JSON.stringify({ archived, reason }),
    },
  );
  if (!response.ok)
    throw await responseError(response, "No se pudo modificar el cierre.");
}
async function editLotMetadataEnLinea(
  token: string,
  organizationId: string,
  branchId: string,
  lot: StockLot,
  number: string,
  expiresAt: string | null,
  reason: string,
  unitCostMinor?: string,
): Promise<void> {
  const response = await fetch(
    `${apiBaseUrl}/organizations/${organizationId}/branches/${branchId}/inventory/lots/${lot.id}`,
    {
      method: "PATCH",
      headers: authJson(token),
      body: JSON.stringify({
        number,
        expiresAt,
        reason,
        expectedVersion: lot.metadataVersion,
        unitCostMinor,
      }),
    },
  );
  if (!response.ok)
    throw await responseError(response, "No se pudo corregir el lote.");
}
export type CashOrganizationRegister = {
  id: string;
  name: string;
  active: boolean;
  responsibleName?: string | null;
  branchId: string;
  branchName: string;
  session: { openedAt: string; openedBy: string | null } | null;
};
export type CashOrganizationOverview = {
  branches: { id: string; name: string }[];
  registers: CashOrganizationRegister[];
};
export async function getCashOrganizationRegisters(
  token: string,
  organizationId: string,
  signal?: AbortSignal,
): Promise<CashOrganizationOverview> {
  const response = await fetch(
    `${apiBaseUrl}/organizations/${organizationId}/cash/registers`,
    { headers: { Authorization: `Bearer ${token}` }, signal },
  );
  if (!response.ok)
    throw await responseError(response, "No se pudieron consultar las cajas.");
  return (await response.json()) as CashOrganizationOverview;
}
export type CashSession = {
  openedBy?: string | null;
  openedByCurrentUser?: boolean;
  id: string;
  cashRegisterId: string;
  openedAt: string;
  closedAt: string | null;
  openingAmountMinor: string;
  closingAmountMinor: string | null;
  cashSalesMinor: string;
  saleChangeMinor: string;
  cardMinor: string;
  transferMinor: string;
  manualInMinor: string;
  manualOutMinor: string;
  expectedAmountMinor: string;
  differenceMinor: string | null;
  movements: {
    actorName?: string | null;
    id: string;
    type: "IN" | "OUT";
    amountMinor: string;
    reason: string;
    createdAt: string;
    category?: string;
  }[];
  /** Sólo en sesiones abiertas: cobros en efectivo de ventas. */
  cashPayments?: {
    id: string;
    saleId: string;
    amountMinor: string;
    createdAt: string;
    /** Quién hizo la venta. */
    actorName?: string | null;
  }[];
};

export type CashPendingCollection = {
  id: string;
  sourceType: "SALE" | "RECEIPT";
  sourceId: string;
  collectedAt: string;
  collectedBy?: string | null;
  cashMinor: string;
  cardMinor: string;
  transferMinor: string;
  destinationRegisterId: string | null;
  /** La venta tiene una factura esperando este cobro: al incorporarlo se emite. */
  facturaEnEspera?: boolean;
};

export type CashRecentActivity = Pick<
  CashSession,
  "movements" | "cashPayments"
>;

export async function getCashRecentActivity(
  token: string,
  organizationId: string,
  branchId: string,
  registerId: string,
): Promise<CashRecentActivity> {
  const response = await fetch(
    `${apiBaseUrl}/organizations/${organizationId}/branches/${branchId}/cash/registers/${registerId}/recent-activity`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!response.ok)
    throw new Error("No se pudieron consultar los movimientos.");
  return (await response.json()) as CashRecentActivity;
}

export async function getCashPendingCollections(
  token: string,
  organizationId: string,
  branchId: string,
  signal?: AbortSignal,
): Promise<CashPendingCollection[]> {
  const response = await fetch(
    `${apiBaseUrl}/organizations/${organizationId}/branches/${branchId}/cash/pending-collections`,
    { headers: { Authorization: `Bearer ${token}` }, signal },
  );
  if (!response.ok)
    throw new Error("No se pudieron consultar los cobros pendientes.");
  // Con lo asignado o incorporado en la PC que todavía no llegó (SISTEMA-81).
  return cobrosConPendientes(
    (await response.json()) as CashPendingCollection[],
    await bandejaDeLaPc(),
    organizationId,
    branchId,
  );
}

export type CashClosure = CashSession & {
  registerResponsibleName?: string | null;
  cashRegisterName: string;
  closedBy?: string | null;
  /** Cierre hecho sin conexión que todavía no llegó (SISTEMA-67). */
  sinEnviar?: boolean;
};

export async function getCash(
  token: string,
  organizationId: string,
  branchId: string,
): Promise<{
  registers: CashRegister[];
  sessions: CashSession[];
  settings?: CashSettings;
}> {
  const response = await fetch(
    `${apiBaseUrl}/organizations/${organizationId}/branches/${branchId}/cash`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!response.ok) throw new Error("No se pudo cargar la caja.");
  return (await response.json()) as {
    registers: CashRegister[];
    sessions: CashSession[];
    settings?: CashSettings;
  };
}

export async function getCashClosures(
  token: string,
  organizationId: string,
  branchId: string,
  from?: string,
  to?: string,
  archived = false,
): Promise<CashClosure[]> {
  const params = new URLSearchParams();
  if (archived) params.set("archived", "true");
  if (from) params.set("from", from);
  if (to) params.set("to", to);
  const response = await fetch(
    `${apiBaseUrl}/organizations/${organizationId}/branches/${branchId}/cash/closures?${params.toString()}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!response.ok)
    throw await responseError(response, "No se pudieron cargar los cierres.");
  return (await response.json()) as CashClosure[];
}

export async function getLatestCashClosure(
  token: string,
  organizationId: string,
  branchId: string,
  registerId: string,
): Promise<CashClosure | null> {
  const response = await fetch(
    `${apiBaseUrl}/organizations/${organizationId}/branches/${branchId}/cash/registers/${registerId}/latest-closure`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!response.ok)
    throw await responseError(
      response,
      "No se pudo consultar el último cierre.",
    );
  // Una caja sin cierres responde con cuerpo vacío, no con el JSON `null`.
  const body = await response.text();
  return body ? (JSON.parse(body) as CashClosure | null) : null;
}

export async function createCashRegister(
  token: string,
  organizationId: string,
  branchId: string,
  name: string,
  code?: string,
  responsibleName?: string | null,
): Promise<void> {
  const response = await fetch(
    `${apiBaseUrl}/organizations/${organizationId}/branches/${branchId}/cash/registers`,
    {
      method: "POST",
      headers: authJson(token),
      body: JSON.stringify({ name, code, responsibleName }),
    },
  );
  if (!response.ok)
    throw await responseError(response, "No se pudo crear la caja.");
}

export async function openCashSession(
  token: string,
  organizationId: string,
  branchId: string,
  cashRegisterId: string,
  openingAmountMinor: number,
): Promise<void> {
  const response = await fetch(
    `${apiBaseUrl}/organizations/${organizationId}/branches/${branchId}/cash/sessions`,
    {
      method: "POST",
      headers: authJson(token),
      body: JSON.stringify({ cashRegisterId, openingAmountMinor }),
    },
  );
  if (!response.ok)
    throw await responseError(response, "No se pudo abrir la caja.");
}

/** La API rechazó el cierre porque la sesión cambió: hay que refrescarla. */
export class CashCloseRejected extends Error {}

export async function closeCashSession(
  token: string,
  organizationId: string,
  branchId: string,
  sessionId: string,
  closingAmountMinor: number,
  reason?: string,
  expectedAmountMinor?: number,
): Promise<void> {
  const response = await fetch(
    `${apiBaseUrl}/organizations/${organizationId}/branches/${branchId}/cash/sessions/${sessionId}/close`,
    {
      method: "POST",
      headers: authJson(token),
      body: JSON.stringify({
        closingAmountMinor,
        reason: reason || undefined,
        expectedAmountMinor,
      }),
    },
  );
  if (!response.ok) {
    const error = await responseError(response, "No se pudo cerrar la caja.");
    if ([402, 404, 409].includes(response.status))
      throw new CashCloseRejected(error.message);
    throw error;
  }
}

export async function createCashMovement(
  token: string,
  organizationId: string,
  branchId: string,
  sessionId: string,
  input: {
    type: "IN" | "OUT";
    amountMinor: number;
    reason: string;
    clientOperationId?: string;
  },
): Promise<void> {
  const response = await fetch(
    `${apiBaseUrl}/organizations/${organizationId}/branches/${branchId}/cash/sessions/${sessionId}/movements`,
    { method: "POST", headers: authJson(token), body: JSON.stringify(input) },
  );
  if (!response.ok)
    throw await responseError(
      response,
      "No se pudo registrar el movimiento de caja.",
    );
}

export interface TicketHeaderSettings {
  printDensity?: number;
  logoRaster?: string;
  name: string;
  address: string;
  city: string;
  province: string;
  taxId: string;
  phone: string;
}
export type FiscalProfile = {
  legalName: string;
  cuit: string;
  vatCondition: string;
  address: string;
  city: string;
  province: string;
  postalCode: string;
  grossIncomeId: string;
  activityStart: string;
};
export type FiscalSettings = {
  profile: FiscalProfile;
  issuanceEnabled: boolean;
  status: string;
};
export type FiscalSetup = {
  environment: "HOMOLOGATION";
  issuanceEnabled: false;
  branches: { id: string; name: string }[];
  points: { id: string; branchId: string; number: number; active: boolean }[];
  checks: { code: string; ready: boolean; label: string; detail: string }[];
  /** Última factura de prueba (SISTEMA-95). */
  trial: {
    status: string;
    point: number;
    number: number | null;
    cae: string | null;
    createdAt: string;
  } | null;
  /** Facturación real: si el servidor la permite y qué sucursales la usan. */
  production: {
    available: boolean;
    branches: { branchId: string; point: number; activatedAt: string | null }[];
  };
};
export type FiscalCredentialStatus = {
  environment: "HOMOLOGATION" | "PRODUCTION";
  storage: "AES256_GCM" | "WINDOWS_DPAPI" | "UNAVAILABLE";
  issuanceEnabled: false;
  version: number;
  hasRequest: boolean;
  hasCertificate: boolean;
  holderCuit: string;
  representedCuit: string;
  profileMatches: boolean;
  fingerprint: string | null;
  expiresAt: string | null;
  status: "EMPTY" | "REQUEST_PREPARED" | "FILES_VALIDATED_PENDING_ARCA";
};
export type FiscalConnection = {
  environment: "HOMOLOGATION";
  connected: boolean;
  points: { number: number }[];
  trialType: number;
  totalMinor: number;
  message: string;
};
export type FiscalTrial = {
  environment?: "HOMOLOGATION" | "PRODUCTION";
  kind?: "INVOICE" | "CREDIT_NOTE";
  qrUrl?: string | null;
  settledAt?: string | null;
  reason?: string | null;
  ticket?: import("@gestion/contracts").ThermalTicket;
  id: string;
  requestId: string;
  point: number;
  voucherType: number;
  number: number | null;
  date: string;
  totalMinor: number;
  /** HELD: espera a que el cobro entre a una caja (SISTEMA-65). */
  status:
    "HELD" | "QUEUED" | "PENDING" | "AUTHORIZED" | "REJECTED" | "UNCERTAIN";
  /** Facturada después de la venta: CAJA_CERRADA o COMPROBANTE_INTERNO. */
  deferredReason?: string | null;
  releasedAt?: string | null;
  sourceSaleId?: string | null;
  saleSnapshot?: {
    store?: {
      name: string;
      address?: string;
      contact?: string;
      logoRaster?: string;
    };
    branchName?: string;
    cashier?: string;
    originalNumber?: string;
    recipient: { name: string; docNumber: string; vatId?: number };
    items: {
      name: string;
      quantity: number;
      unitPriceMinor: string;
      discountMinor: string;
      amountMinor: string;
    }[];
  } | null;
  cae: string | null;
  caeExpires: string | null;
  detail: string | null;
  issuer: FiscalProfile;
};
/**
 * Problema con ARCA al probar la conexión (SISTEMA-97): ARCA rechazó
 * (`ARCA_RECHAZO`) o no respondió (`ARCA_SIN_RESPUESTA`). `falla` es el código
 * técnico de ARCA, para el detalle desplegable.
 */
export class ErrorDeArca extends Error {
  constructor(
    message: string,
    readonly tipo: "ARCA_RECHAZO" | "ARCA_SIN_RESPUESTA",
    readonly falla?: string,
  ) {
    super(message);
    this.name = "ErrorDeArca";
  }
}

/** Error de una respuesta fiscal, con el de ARCA si lo es. */
async function errorFiscal(response: Response, fallback: string) {
  const result = (await response.json().catch(() => ({}))) as {
    message?: string | string[];
    code?: string;
    details?: { codigo?: unknown };
  };
  const mensaje = Array.isArray(result.message)
    ? result.message.join(", ")
    : (result.message ?? fallback);
  if (result.code === "ARCA_RECHAZO" || result.code === "ARCA_SIN_RESPUESTA")
    return new ErrorDeArca(
      mensaje,
      result.code,
      typeof result.details?.codigo === "string"
        ? result.details.codigo
        : undefined,
    );
  return new Error(mensaje);
}

export async function fiscalTesting<T>(
  token: string,
  organizationId: string,
  path: string,
  input?: object,
): Promise<T> {
  const response = await fetch(
    `${apiBaseUrl}/organizations/${organizationId}/fiscal-testing/${path}`,
    {
      method: input ? "POST" : "GET",
      headers: authJson(token),
      ...(input ? { body: JSON.stringify(input) } : {}),
    },
  );
  if (!response.ok)
    throw await errorFiscal(
      response,
      "No se pudo completar la prueba con ARCA.",
    );
  return response.json() as Promise<T>;
}
export async function fiscalCredentials(
  token: string,
  organizationId: string,
  action?: "request" | "certificate",
  input?: {
    holderCuit: string;
    expectedVersion: number;
    replace?: boolean;
    certificate?: string;
    privateKey?: string;
    passphrase?: string;
  },
  environment: "HOMOLOGATION" | "PRODUCTION" = "HOMOLOGATION",
): Promise<FiscalCredentialStatus> {
  const response = await fetch(
    `${apiBaseUrl}/organizations/${organizationId}/${environment === "PRODUCTION" ? "fiscal-production/credentials" : "fiscal-credentials"}${action ? `/${action}` : ""}`,
    {
      method: input ? "POST" : "GET",
      headers: authJson(token),
      ...(input ? { body: JSON.stringify(input) } : {}),
    },
  );
  if (!response.ok)
    throw await responseError(
      response,
      "No se pudo completar la configuración del certificado.",
    );
  return response.json();
}
export async function getFiscalRequest(
  token: string,
  organizationId: string,
  environment: "HOMOLOGATION" | "PRODUCTION" = "HOMOLOGATION",
): Promise<{ csr: string; holderCuit: string; filename: string }> {
  const response = await fetch(
    `${apiBaseUrl}/organizations/${organizationId}/${environment === "PRODUCTION" ? "fiscal-production/credentials" : "fiscal-credentials"}/request`,
    { headers: authJson(token) },
  );
  if (!response.ok)
    throw await responseError(response, "No se pudo descargar la solicitud.");
  return response.json();
}
export async function getFiscalSetup(
  token: string,
  organizationId: string,
): Promise<FiscalSetup> {
  const response = await fetch(
    `${apiBaseUrl}/organizations/${organizationId}/fiscal-setup`,
    { headers: authJson(token) },
  );
  if (!response.ok)
    throw await responseError(
      response,
      "No se pudo cargar la preparación fiscal.",
    );
  return response.json();
}
export async function checkProductionConnection(
  token: string,
  organizationId: string,
  action: "authenticate" | "points",
): Promise<{
  environment: "PRODUCTION";
  issuanceEnabled: false;
  points?: { number: number }[];
}> {
  const response = await fetch(
    `${apiBaseUrl}/organizations/${organizationId}/fiscal-production/${action}`,
    { method: "POST", headers: authJson(token) },
  );
  if (!response.ok)
    throw await errorFiscal(
      response,
      "No se pudo verificar la facturación real. Revisá el certificado y su autorización.",
    );
  return response.json();
}
export async function saveFiscalPoint(
  token: string,
  organizationId: string,
  input: { branchId: string; number: number } | { id: string; active: boolean },
): Promise<void> {
  const editing = "id" in input;
  const response = await fetch(
    `${apiBaseUrl}/organizations/${organizationId}/fiscal-points${editing ? `/${input.id}` : ""}`,
    {
      method: editing ? "PATCH" : "POST",
      headers: authJson(token),
      body: JSON.stringify(editing ? { active: input.active } : input),
    },
  );
  if (!response.ok)
    throw await responseError(
      response,
      "No se pudo guardar el punto de venta.",
    );
}
export async function fiscalSettings(
  token: string,
  organizationId: string,
  profile?: FiscalProfile,
): Promise<FiscalSettings> {
  const response = await fetch(
    `${apiBaseUrl}/organizations/${organizationId}/fiscal-profile`,
    {
      method: profile ? "PATCH" : "GET",
      headers: authJson(token),
      ...(profile ? { body: JSON.stringify(profile) } : {}),
    },
  );
  if (!response.ok)
    throw await responseError(
      response,
      "No se pudo acceder a los datos fiscales.",
    );
  return response.json();
}
export async function getTicketHeader(
  token: string,
  organizationId: string,
): Promise<TicketHeaderSettings> {
  const response = await fetch(
    `${apiBaseUrl}/organizations/${organizationId}/ticket-header`,
    { headers: authJson(token) },
  );
  if (!response.ok)
    throw await responseError(response, "No se pudo cargar el encabezado.");
  return response.json();
}
export async function saveTicketHeader(
  token: string,
  organizationId: string,
  data: TicketHeaderSettings,
): Promise<TicketHeaderSettings> {
  const response = await fetch(
    `${apiBaseUrl}/organizations/${organizationId}/ticket-header`,
    { method: "PATCH", headers: authJson(token), body: JSON.stringify(data) },
  );
  if (!response.ok)
    throw await responseError(response, "No se pudo guardar el encabezado.");
  return response.json();
}

export type Sale = {
  id: string;
  documentType?: "INTERNAL" | "INVOICE";
  fiscalTrial?: FiscalTrial | null;
  /** Factura de producción que devuelve la venta recién confirmada. */
  fiscalDocument?: Pick<FiscalTrial, "status"> | null;
  customerId?: string | null;
  status: "COMPLETED" | "CANCELLED";
  totalMinor: string;
  completedAt: string | null;
  items: {
    id: string;
    productId: string | null;
    description?: string | null;
    /** Null en un renglón de producto: faltante de una venta sin conexión. */
    lotId?: string | null;
    quantity: number;
    unitPriceMinor?: string;
    discountMinor?: string;
  }[];
  payments: {
    method: "CASH" | "CARD" | "TRANSFER" | "ACCOUNT" | "OTHER";
    amountMinor: string;
  }[];
  /** Factura de producción de la venta (número de ARCA), si tiene. */
  fiscalDocuments?: {
    status: string;
    point: number;
    number: number | null;
    voucherType: number;
    /** Facturada después de la venta: CAJA_CERRADA o COMPROBANTE_INTERNO. */
    deferredReason?: string | null;
  }[];
};

export async function saleInvoice(
  token: string,
  organizationId: string,
  branchId: string,
  saleId: string,
  process = false,
): Promise<FiscalTrial> {
  const response = await fetch(
    `${apiBaseUrl}/organizations/${organizationId}/branches/${branchId}/sales/${saleId}/invoice${process ? "/process" : ""}`,
    { method: process ? "POST" : "GET", headers: authJson(token) },
  );
  if (!response.ok)
    throw await responseError(
      response,
      "No se pudo consultar la factura. No vuelvas a registrar la venta.",
    );
  return response.json();
}

/** Vuelve a emitir una factura rechazada o que no llegó a ARCA. */
export async function requeueSaleInvoice(
  token: string,
  organizationId: string,
  branchId: string,
  saleId: string,
): Promise<FiscalTrial> {
  const response = await fetch(
    `${apiBaseUrl}/organizations/${organizationId}/branches/${branchId}/sales/${saleId}/invoice/reencolar`,
    { method: "POST", headers: authJson(token) },
  );
  if (!response.ok)
    throw await responseError(
      response,
      "No se pudo volver a emitir la factura. La venta sigue registrada.",
    );
  return response.json();
}

/**
 * Manda a ARCA una venta hecha con comprobante interno (SISTEMA-65). Sale con
 * la fecha de hoy y queda marcada como facturada después.
 */
export async function invoiceInternalSale(
  token: string,
  organizationId: string,
  branchId: string,
  saleId: string,
  input: {
    fiscalEnvironment: "HOMOLOGATION" | "PRODUCTION";
    fiscalOptions: SaleFiscalOptions;
  },
): Promise<FiscalTrial> {
  const production = input.fiscalEnvironment === "PRODUCTION";
  const response = await fetch(
    `${apiBaseUrl}/organizations/${organizationId}/branches/${branchId}/sales/${saleId}/invoice/emitir`,
    {
      method: "POST",
      headers: authJson(token),
      body: JSON.stringify({
        fiscalEnvironment: input.fiscalEnvironment,
        fiscalOptions: input.fiscalOptions,
        ...(production
          ? { confirmProduction: true }
          : { confirmHomologation: true }),
      }),
    },
  );
  if (!response.ok)
    throw await responseError(response, "No se pudo enviar la venta a ARCA.");
  return response.json();
}

export async function getSaleTicket(
  token: string,
  organizationId: string,
  branchId: string,
  saleId: string,
): Promise<import("@gestion/contracts").ThermalTicket> {
  const response = await fetch(
    `${apiBaseUrl}/organizations/${organizationId}/branches/${branchId}/sales/${saleId}/ticket`,
    { headers: authJson(token) },
  );
  if (!response.ok)
    throw await responseError(response, "No se pudo cargar el comprobante.");
  const ticket =
    (await response.json()) as import("@gestion/contracts").ThermalTicket;
  // El encabezado queda guardado para el ticket provisorio sin conexión.
  void recordarEncabezado(organizationId, branchId, ticket).catch(() => {});
  return ticket;
}

/** Venta hecha sin conexión, al volver (SISTEMA-63/64). */
export async function sendOfflineSale(
  token: string,
  organizationId: string,
  branchId: string,
  body: Record<string, unknown>,
): Promise<Sale & { offlineIssues: OfflineIssue[] }> {
  const response = await fetch(
    `${apiBaseUrl}/organizations/${organizationId}/branches/${branchId}/sales/offline`,
    { method: "POST", headers: authJson(token), body: JSON.stringify(body) },
  );
  if (!response.ok) {
    throw await envioRechazado(
      response,
      "El servidor no aceptó la venta sin conexión.",
    );
  }
  return response.json();
}

/**
 * Venta sin conexión de otro usuario de esta PC (SISTEMA-66): va el texto
 * exacto que firmó, y el servidor la registra a su nombre.
 */
export async function sendSignedOfflineSale(
  token: string,
  organizationId: string,
  branchId: string,
  body: {
    sellerId: string;
    deviceId: string;
    payload: string;
    signature: string;
  },
): Promise<Sale & { offlineIssues: OfflineIssue[] }> {
  const response = await fetch(
    `${apiBaseUrl}/organizations/${organizationId}/branches/${branchId}/sales/offline/firmada`,
    { method: "POST", headers: authJson(token), body: JSON.stringify(body) },
  );
  if (!response.ok) {
    throw await envioRechazado(
      response,
      "El servidor no aceptó la venta sin conexión.",
    );
  }
  return response.json();
}

/** Operación de caja hecha sin conexión (SISTEMA-67). */
export async function sendOfflineCash(
  token: string,
  organizationId: string,
  branchId: string,
  body: Record<string, unknown>,
): Promise<{ entityId: string | null; offlineIssues: OfflineIssue[] }> {
  const response = await fetch(
    `${apiBaseUrl}/organizations/${organizationId}/branches/${branchId}/cash/offline`,
    { method: "POST", headers: authJson(token), body: JSON.stringify(body) },
  );
  if (!response.ok) {
    throw await envioRechazado(
      response,
      "El servidor no aceptó la operación de caja sin conexión.",
    );
  }
  return response.json();
}

/** La de otro usuario de esta PC, firmada por él (SISTEMA-67). */
export async function sendSignedOfflineCash(
  token: string,
  organizationId: string,
  branchId: string,
  body: {
    actorId: string;
    deviceId: string;
    payload: string;
    signature: string;
  },
): Promise<{ entityId: string | null; offlineIssues: OfflineIssue[] }> {
  const response = await fetch(
    `${apiBaseUrl}/organizations/${organizationId}/branches/${branchId}/cash/offline/firmada`,
    { method: "POST", headers: authJson(token), body: JSON.stringify(body) },
  );
  if (!response.ok) {
    throw await envioRechazado(
      response,
      "El servidor no aceptó la operación de caja sin conexión.",
    );
  }
  return response.json();
}

/** Operación de compras hecha sin conexión (SISTEMA-69). */
export async function sendOfflinePurchase(
  token: string,
  organizationId: string,
  branchId: string,
  body: Record<string, unknown>,
) {
  const response = await fetch(
    `${apiBaseUrl}/organizations/${organizationId}/branches/${branchId}/purchases/offline`,
    { method: "POST", headers: authJson(token), body: JSON.stringify(body) },
  );
  if (!response.ok) {
    throw await envioRechazado(
      response,
      "El servidor no aceptó la operación de compras sin conexión.",
    );
  }
  return (await response.json()) as { offlineIssues?: unknown[] };
}

/** La de otro usuario de esta PC, firmada por él (SISTEMA-69). */
export async function sendSignedOfflinePurchase(
  token: string,
  organizationId: string,
  branchId: string,
  body: {
    actorId: string;
    deviceId: string;
    payload: string;
    signature: string;
  },
) {
  const response = await fetch(
    `${apiBaseUrl}/organizations/${organizationId}/branches/${branchId}/purchases/offline/firmada`,
    { method: "POST", headers: authJson(token), body: JSON.stringify(body) },
  );
  if (!response.ok) {
    throw await envioRechazado(
      response,
      "El servidor no aceptó la operación de compras sin conexión.",
    );
  }
  return (await response.json()) as { offlineIssues?: unknown[] };
}

/** Registra la clave con la que esta PC firma las ventas del usuario. */
export async function registerOfflineKey(
  token: string,
  body: { deviceId: string; publicKey: string },
) {
  const response = await fetch(`${apiBaseUrl}/auth/offline-key`, {
    method: "POST",
    headers: authJson(token),
    body: JSON.stringify(body),
  });
  if (!response.ok)
    throw await responseError(
      response,
      "No se pudo registrar la clave de la PC.",
    );
}

export type OfflineIssue = {
  id: string;
  kind: string;
  status: "OPEN" | "RESOLVED";
  detail: Record<string, string | number | null>;
  saleId: string | null;
  saleTotalMinor?: string | null;
  saleStatus?: "COMPLETED" | "CANCELLED" | null;
  occurredAt?: string;
  createdAt?: string;
};

/** Avisos "a revisar" de lo sincronizado sin conexión (abiertos). */
export async function getOfflineIssues(
  token: string,
  organizationId: string,
  branchId: string,
): Promise<OfflineIssue[]> {
  const response = await fetch(
    `${apiBaseUrl}/organizations/${organizationId}/branches/${branchId}/sales/offline-issues`,
    { headers: authJson(token) },
  );
  if (!response.ok)
    throw await responseError(response, "No se pudieron cargar los avisos.");
  return response.json();
}

export async function resolveOfflineIssue(
  token: string,
  organizationId: string,
  branchId: string,
  issueId: string,
  note?: string,
): Promise<void> {
  const response = await fetch(
    `${apiBaseUrl}/organizations/${organizationId}/branches/${branchId}/sales/offline-issues/${issueId}/resolve`,
    {
      method: "POST",
      headers: authJson(token),
      body: JSON.stringify(note ? { note } : {}),
    },
  );
  if (!response.ok)
    throw await responseError(response, "No se pudo marcar como revisado.");
}

export async function getSales(
  token: string,
  organizationId: string,
  branchId: string,
): Promise<Sale[]> {
  const response = await fetch(
    `${apiBaseUrl}/organizations/${organizationId}/branches/${branchId}/sales`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!response.ok)
    throw await responseError(response, "No se pudieron cargar las ventas.");
  return (await response.json()) as Sale[];
}

export async function createSale(
  token: string,
  organizationId: string,
  branchId: string,
  input: {
    fiscalOptions?: SaleFiscalOptions;
    fiscalEnvironment?: "HOMOLOGATION" | "PRODUCTION";
    confirmProduction?: boolean;
    documentType?: "INTERNAL" | "INVOICE";
    confirmHomologation?: boolean;
    clientOperationId?: string;
    priceListId?: string;
    customerId?: string;
    items: {
      productId?: string;
      description?: string;
      unitPriceMinor?: number;
      quantity: number;
      packQuantity?: number;
      discountMinor?: number;
      expectedUnitPriceMinor?: string;
      requestedUnitPriceMinor?: number;
    }[];
    payments: {
      method: "CASH" | "CARD" | "TRANSFER" | "ACCOUNT" | "OTHER";
      amountMinor: number;
      cashSessionId?: string;
    }[];
  },
): Promise<Sale> {
  const response = await fetch(
    `${apiBaseUrl}/organizations/${organizationId}/branches/${branchId}/sales`,
    { method: "POST", headers: authJson(token), body: JSON.stringify(input) },
  );
  if (!response.ok)
    throw await responseError(response, "No se pudo completar la venta.");
  return (await response.json()) as Sale;
}

export async function getSaleFiscalCapabilities(
  token: string,
  organizationId: string,
  branchId: string,
): Promise<SaleFiscalCapabilities> {
  const response = await fetch(
    `${apiBaseUrl}/organizations/${organizationId}/branches/${branchId}/sales/fiscal-options`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!response.ok)
    throw await responseError(
      response,
      "No se pudo consultar la configuración fiscal.",
    );
  return (await response.json()) as SaleFiscalCapabilities;
}

export type CreditDetail = {
  original: FiscalTrial;
  credits: FiscalTrial[];
  items: {
    id: string;
    name: string;
    quantity: number;
    available: number;
    unitPriceMinor: string;
    discountMinor: string;
  }[];
};
export async function saleCreditOperation<T>(
  token: string,
  organizationId: string,
  branchId: string,
  saleId: string,
  suffix = "",
  input?: object,
): Promise<T> {
  const response = await fetch(
    `${apiBaseUrl}/organizations/${organizationId}/branches/${branchId}/sales/${saleId}/credits${suffix}`,
    {
      method: input ? "POST" : "GET",
      headers: authJson(token),
      ...(input ? { body: JSON.stringify(input) } : {}),
    },
  );
  if (!response.ok)
    throw await responseError(
      response,
      "No se pudo completar la operación de nota de crédito.",
    );
  return (await response.json()) as T;
}
export async function activateProduction(
  token: string,
  organizationId: string,
  input: { branchId: string; point: number; exclusive: boolean },
) {
  const response = await fetch(
    `${apiBaseUrl}/organizations/${organizationId}/fiscal-production/activate`,
    { method: "POST", headers: authJson(token), body: JSON.stringify(input) },
  );
  if (!response.ok)
    throw await responseError(response, "No se pudo activar producción.");
  return (await response.json()) as {
    environment: "PRODUCTION";
    point: number;
    issuanceEnabled: true;
  };
}

export async function cancelSale(
  token: string,
  organizationId: string,
  branchId: string,
  saleId: string,
  reason: string,
): Promise<void> {
  const response = await fetch(
    `${apiBaseUrl}/organizations/${organizationId}/branches/${branchId}/sales/${saleId}/cancel`,
    {
      method: "POST",
      headers: authJson(token),
      body: JSON.stringify({ reason }),
    },
  );
  if (!response.ok)
    throw await responseError(response, "No se pudo anular la venta.");
}

export async function createCustomerReturn(
  token: string,
  organizationId: string,
  branchId: string,
  saleId: string,
  input: { reason: string; items: { saleItemId: string; quantity: number }[] },
): Promise<void> {
  const response = await fetch(
    `${apiBaseUrl}/organizations/${organizationId}/branches/${branchId}/sales/${saleId}/customer-returns`,
    { method: "POST", headers: authJson(token), body: JSON.stringify(input) },
  );
  if (!response.ok)
    throw await responseError(response, "No se pudo registrar la devolución.");
}

function authJson(token: string): HeadersInit {
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
}

/**
 * Rechazo del servidor a una operación hecha sin conexión, con el código del
 * error (`PARA_SU_DUENO` cuando la tiene que mandar quien la hizo).
 */
async function envioRechazado(
  response: Response,
  fallback: string,
): Promise<EnvioRechazado> {
  const result = (await response.json().catch(() => ({}))) as {
    message?: string | string[];
    code?: string;
  };
  const mensaje = Array.isArray(result.message)
    ? result.message.join(", ")
    : (result.message ?? fallback);
  return new EnvioRechazado(mensaje, response.status, result.code);
}

async function responseError(
  response: Response,
  fallback: string,
): Promise<Error> {
  const result = (await response.json()) as { message?: string | string[] };
  return new Error(
    Array.isArray(result.message)
      ? result.message.join(", ")
      : (result.message ?? fallback),
  );
}

export type Purchase = {
  canRegisterDebt?: boolean;
  /** Hecha sin conexión en esta PC y todavía sin enviar (SISTEMA-69). */
  porEnviar?: boolean;
  hasRegisteredDebt?: boolean;
  clientOperationId?: string | null;
  reference?: string | null;
  notes?: string | null;
  orderedAt?: string | null;
  closedAt?: string | null;
  closedReason?: string | null;
  supplierName?: string;
  id: string;
  createdAt: string;
  status: "ORDERED" | "PARTIALLY_RECEIVED" | "RECEIVED" | "CANCELLED" | "DRAFT";
  supplierId: string;
  items: {
    id: string;
    productId: string;
    cancelledQuantity?: number;
    orderedQuantity: number;
    receivedQuantity: number;
    unitCostMinor?: string;
  }[];
};
export type InventoryHistoryEntry = {
  referenceType?: string | null;
  id: string;
  occurredAt: string;
  productName: string;
  lotNumber: string | null;
  quantity: number;
  type:
    "PURCHASE_RECEIPT" | "ADJUSTMENT_IN" | "ADJUSTMENT_OUT" | "SUPPLIER_RETURN";
};
export async function getInventoryHistory(
  token: string,
  organizationId: string,
  branchId: string,
  rango?: RangoHistorial,
): Promise<InventoryHistoryEntry[]> {
  const response = await fetch(
    `${apiBaseUrl}/organizations/${organizationId}/branches/${branchId}/inventory/history${consultaDeRango(rango)}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!response.ok)
    throw await responseError(
      response,
      "No se pudo cargar el historial de inventario.",
    );
  return response.json() as Promise<InventoryHistoryEntry[]>;
}
export type ReceiptLot = Pick<
  StockLot,
  "id" | "productId" | "number" | "quantity" | "expiresAt" | "expiryStatus"
>;

export async function getReceiptLots(
  token: string,
  organizationId: string,
  branchId: string,
): Promise<ReceiptLot[]> {
  const response = await fetch(
    `${apiBaseUrl}/organizations/${organizationId}/branches/${branchId}/purchases/lots`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!response.ok)
    throw await responseError(response, "No se pudieron cargar los lotes.");
  return (await response.json()) as ReceiptLot[];
}

/**
 * Rango de un historial (SISTEMA-74): sin fechas, el servidor devuelve los
 * últimos 90 días (en Compras, además, los pedidos abiertos).
 */
export type RangoHistorial = { desde?: string; hasta?: string };

const consultaDeRango = (rango?: RangoHistorial) => {
  const consulta = new URLSearchParams();
  if (rango?.desde) consulta.set("desde", rango.desde);
  if (rango?.hasta) consulta.set("hasta", rango.hasta);
  const texto = consulta.toString();
  return texto ? `?${texto}` : "";
};

export async function getPurchases(
  token: string,
  organizationId: string,
  branchId: string,
  rango?: RangoHistorial,
): Promise<Purchase[]> {
  const response = await fetch(
    `${apiBaseUrl}/organizations/${organizationId}/branches/${branchId}/purchases${consultaDeRango(rango)}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!response.ok) throw new Error("No se pudieron cargar las compras.");
  return (await response.json()) as Purchase[];
}
export async function createPurchase(
  token: string,
  organizationId: string,
  branchId: string,
  input: {
    supplierId: string;
    items: { productId: string; quantity: number; unitCostMinor: number }[];
  },
): Promise<void> {
  const response = await fetch(
    `${apiBaseUrl}/organizations/${organizationId}/branches/${branchId}/purchases`,
    { method: "POST", headers: authJson(token), body: JSON.stringify(input) },
  );
  if (!response.ok)
    throw await responseError(response, "No se pudo crear la compra.");
}
export async function receivePurchase(
  token: string,
  organizationId: string,
  branchId: string,
  purchaseId: string,
  input: {
    itemId: string;
    quantity: number;
    lotNumber: string;
    expiresAt?: string;
  },
): Promise<void> {
  const response = await fetch(
    `${apiBaseUrl}/organizations/${organizationId}/branches/${branchId}/purchases/${purchaseId}/receipts`,
    { method: "POST", headers: authJson(token), body: JSON.stringify(input) },
  );
  if (!response.ok)
    throw await responseError(response, "No se pudo recibir la compra.");
}

export type Transfer = {
  id: string;
  /** Clave con que la preparó la PC (SISTEMA-71). */
  clientOperationId?: string | null;
  sourceBranchId: string;
  destinationBranchId: string;
  status: "PREPARED" | "IN_TRANSIT" | "RECEIVED" | "CANCELLED";
  createdAt: string;
  /** Hecha o cambiada sin conexión y todavía no enviada (SISTEMA-71). */
  porEnviar?: boolean;
  items: {
    id: string;
    productId: string;
    lotId: string;
    /** Sólo en las preparadas sin conexión, que la PC conoce por número. */
    lotNumber?: string;
    quantity: number;
    receivedQuantity: number;
  }[];
};

const rutaTransferencias = (organizationId: string, branchId: string) =>
  `${apiBaseUrl}/organizations/${organizationId}/branches/${branchId}/transfers`;

async function getTransfersDelServidor(
  token: string,
  organizationId: string,
  branchId: string,
): Promise<Transfer[]> {
  const response = await fetch(rutaTransferencias(organizationId, branchId), {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok)
    throw await responseError(
      response,
      "No se pudieron cargar las transferencias.",
    );
  return (await response.json()) as Transfer[];
}

/** Las del servidor más lo hecho en la PC que todavía no llegó (SISTEMA-71). */
export async function getTransfers(
  token: string,
  organizationId: string,
  branchId: string,
): Promise<Transfer[]> {
  return transferenciasConPendientes(
    await getTransfersDelServidor(token, organizationId, branchId),
    await bandejaDeLaPc(),
    organizationId,
    branchId,
  );
}

// --- Transferencias sin conexión (SISTEMA-71) ---
// Preparar y despachar funcionan sin internet; recibir, sólo una que ya estaba
// en tránsito cuando había conexión. Lo de una transferencia que ya tiene algo
// sin enviar también espera en la PC, para llegar en orden.

/** Dónde quedó la operación: en el servidor o en la bandeja de la PC. */
export type DondeQuedo = "SERVIDOR" | "PC";

/** Manda la operación al servidor; si no hay conexión, la guarda en la PC. */
async function transferenciaConRespaldo(
  token: string,
  organizationId: string,
  enEspera: boolean,
  enLinea: () => Promise<void>,
  enLaPc: () => Promise<void>,
  permitirSoloLectura = false,
): Promise<DondeQuedo> {
  if (enEspera && token !== TOKEN_SIN_CONEXION) {
    await enLaPc();
    return "PC";
  }
  if (token !== TOKEN_SIN_CONEXION)
    try {
      await enLinea();
      return "SERVIDOR";
    } catch (cause) {
      if (!(cause instanceof SinConexionError)) throw cause;
    }
  await puedeOperarSinConexion(token, organizationId, permitirSoloLectura);
  await enLaPc();
  return "PC";
}

type LoteDeLaPc = {
  id: string;
  productId: string;
  number: string;
  quantity: number;
};

/** Lotes de la sucursal con lo que se puede despachar desde la PC. */
async function lotesDeLaPc(
  token: string,
  organizationId: string,
  branchId: string,
  bandeja: VentaPendiente[],
) {
  const delServidor = await getStock(token, organizationId, branchId).catch(
    () => [] as StockLot[],
  );
  return lotesParaTransferir(
    lotesConPendientes<LoteDeLaPc>(
      delServidor,
      lotesSinEnviar(bandeja, organizationId, branchId),
    ),
    delServidor,
    bandeja,
    organizationId,
    branchId,
  );
}

/** Sin conexión no se despacha más de lo que la PC sabe que hay. */
function revisarStockParaDespachar(
  items: readonly {
    productId: string;
    lotId: string;
    lotNumber?: string;
    quantity: number;
  }[],
  lotes: readonly LoteDeLaPc[],
) {
  for (const item of items) {
    const lote = lotes.find(
      (l) =>
        l.id === item.lotId ||
        (item.lotNumber !== undefined &&
          l.productId === item.productId &&
          l.number === item.lotNumber),
    );
    if (!lote || lote.quantity < item.quantity)
      throw new Error(
        `Sin conexión: el lote ${lote?.number ?? item.lotNumber ?? ""} tiene ${lote?.quantity ?? 0} unidades disponibles en esta PC. Revisá la cantidad.`,
      );
  }
}

export async function createTransfer(
  token: string,
  organizationId: string,
  branchId: string,
  input: {
    destinationBranchId: string;
    items: { lotId: string; quantity: number }[];
  },
): Promise<DondeQuedo> {
  const clientOperationId = crypto.randomUUID();
  return transferenciaConRespaldo(
    token,
    organizationId,
    // Un lote recibido sin conexión todavía no existe en el servidor: espera
    // en la PC detrás de su compra.
    input.items.some((item) => item.lotId.startsWith("sin-enviar:")),
    async () => {
      const response = await fetch(
        rutaTransferencias(organizationId, branchId),
        {
          method: "POST",
          headers: authJson(token),
          body: JSON.stringify({ ...input, clientOperationId }),
        },
      );
      if (!response.ok)
        throw await responseError(
          response,
          "No se pudo preparar la transferencia.",
        );
    },
    async () => {
      const bandeja = await bandejaDeLaPc();
      const lotes = await lotesDeLaPc(token, organizationId, branchId, bandeja);
      const items = renglonesDeLotes(input.items, lotes);
      if (items.length !== input.items.length)
        throw new Error(
          "Sin conexión: un lote ya no está disponible en esta PC. Elegilo de nuevo.",
        );
      await guardarOperacionTransferencia(organizationId, branchId, {
        tipo: "PREPARAR",
        cuerpo: { destinationBranchId: input.destinationBranchId, items },
      });
    },
  );
}

export async function dispatchTransfer(
  token: string,
  organizationId: string,
  branchId: string,
  transfer: Transfer,
): Promise<DondeQuedo> {
  const bandeja = await bandejaDeLaPc();
  return transferenciaConRespaldo(
    token,
    organizationId,
    transferenciaConPendientes(bandeja, organizationId, branchId, transfer),
    async () => {
      const response = await fetch(
        `${rutaTransferencias(organizationId, branchId)}/${transfer.id}/dispatch`,
        { method: "POST", headers: authJson(token) },
      );
      if (!response.ok)
        throw await responseError(
          response,
          "No se pudo despachar la transferencia.",
        );
    },
    async () => {
      const lotes = await lotesDeLaPc(token, organizationId, branchId, bandeja);
      revisarStockParaDespachar(transfer.items, lotes);
      await guardarOperacionTransferencia(
        organizationId,
        branchId,
        { tipo: "DESPACHAR", cuerpo: { transferId: transfer.id } },
        unidadesDeTransferencia("DESPACHAR", transfer, lotes),
      );
    },
  );
}

export async function receiveTransfer(
  token: string,
  organizationId: string,
  branchId: string,
  transfer: Transfer,
): Promise<DondeQuedo> {
  const bandeja = await bandejaDeLaPc();
  return transferenciaConRespaldo(
    token,
    organizationId,
    transferenciaConPendientes(bandeja, organizationId, branchId, transfer),
    async () => {
      const response = await fetch(
        `${rutaTransferencias(organizationId, branchId)}/${transfer.id}/receive`,
        { method: "POST", headers: authJson(token) },
      );
      if (!response.ok)
        throw await responseError(
          response,
          "No se pudo recibir la transferencia.",
        );
    },
    async () => {
      // Sólo lo que ya estaba en camino cuando había conexión.
      const guardadas = await getTransfersDelServidor(
        token,
        organizationId,
        branchId,
      ).catch(() => [] as Transfer[]);
      const enCamino = guardadas.find(
        (t) =>
          t.id === transfer.id &&
          t.status === "IN_TRANSIT" &&
          t.destinationBranchId === branchId,
      );
      if (!enCamino)
        throw new Error(
          "Sin conexión sólo se puede recibir una transferencia que ya estaba en camino cuando había internet.",
        );
      await guardarOperacionTransferencia(
        organizationId,
        branchId,
        { tipo: "RECIBIR", cuerpo: { transferId: transfer.id } },
        unidadesDeTransferencia("RECIBIR", enCamino, []),
      );
    },
    true,
  );
}

/** Transferencia hecha sin conexión (SISTEMA-71). */
export async function sendOfflineTransfer(
  token: string,
  organizationId: string,
  branchId: string,
  body: Record<string, unknown>,
) {
  const response = await fetch(
    `${rutaTransferencias(organizationId, branchId)}/offline`,
    { method: "POST", headers: authJson(token), body: JSON.stringify(body) },
  );
  if (!response.ok) {
    throw await envioRechazado(
      response,
      "El servidor no aceptó la transferencia sin conexión.",
    );
  }
  return (await response.json()) as { offlineIssues?: unknown[] };
}

/** La de otro usuario de esta PC, firmada por él (SISTEMA-71). */
export async function sendSignedOfflineTransfer(
  token: string,
  organizationId: string,
  branchId: string,
  body: {
    actorId: string;
    deviceId: string;
    payload: string;
    signature: string;
  },
) {
  const response = await fetch(
    `${rutaTransferencias(organizationId, branchId)}/offline/firmada`,
    { method: "POST", headers: authJson(token), body: JSON.stringify(body) },
  );
  if (!response.ok) {
    throw await envioRechazado(
      response,
      "El servidor no aceptó la transferencia sin conexión.",
    );
  }
  return (await response.json()) as { offlineIssues?: unknown[] };
}

export type ReportSummary = {
  salesTrend?: { date: string; totalMinor: string; count: number }[];
  salesTodayCount: number;
  salesTodayMinor: string;
  // Opcionales: una API anterior no los informa (SISTEMA-85).
  averageTicketMinor?: string;
  customerReceivables?: { count: number; totalMinor: string };
  supplierDebt?: {
    count: number;
    totalMinor: string;
    overdueMinor: string;
    todayMinor: string;
    next7Minor: string;
    nextDueOn: string | null;
  };
  /** Cada caja activa de la sucursal; el esperado solo si está abierta. */
  cashRegisters?: {
    id: string;
    name: string;
    open: boolean;
    expectedAmountMinor: string | null;
  }[];
  stockLots: number;
  stockUnits: number;
  expiringLots: number;
  pendingPurchases: number;
  openCashSessions: number;
};
export async function getReportSummary(
  token: string,
  organizationId: string,
  branchId: string,
): Promise<ReportSummary> {
  const response = await fetch(
    `${apiBaseUrl}/organizations/${organizationId}/branches/${branchId}/reports/summary`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!response.ok) throw new Error("No se pudieron cargar los reportes.");
  return (await response.json()) as ReportSummary;
}

export type ReportDetail = {
  from: string;
  to: string;
  totalSalesMinor: string;
  saleCount: number;
  /** Unidades de venta de productos, menos las devueltas en el periodo. */
  unitsSold: number;
  dailySales: { date: string; totalMinor: string }[];
  cashClosures: {
    count: number;
    expectedMinor: string;
    countedMinor: string;
    differenceMinor: string;
    daily: CashClosureGroup[];
    monthly: CashClosureGroup[];
  };
  payments: { method: string; amountMinor: string }[];
  topProducts: { productId: string; productName: string; quantity: number }[];
  stockCostMinor: string;
  expiring: {
    productName: string;
    lotNumber: string;
    quantity: number;
    expiresAt: string | null;
  }[];
};

export type CashClosureGroup = {
  period: string;
  count: number;
  expectedMinor: string;
  countedMinor: string;
  differenceMinor: string;
};

export async function getReportDetail(
  token: string,
  organizationId: string,
  branchId: string,
  from?: string,
  to?: string,
): Promise<ReportDetail> {
  const params = new URLSearchParams();
  if (from) params.set("from", from);
  if (to) params.set("to", to);
  const response = await fetch(
    `${apiBaseUrl}/organizations/${organizationId}/branches/${branchId}/reports/detail?${params.toString()}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!response.ok)
    throw await responseError(response, "No se pudieron cargar los reportes.");
  return (await response.json()) as ReportDetail;
}

// --- Cuenta corriente sin conexión (SISTEMA-70) ---
// Las consultas de cuenta corriente suman lo hecho en la PC que todavía no
// llegó; las escrituras que no llegan al servidor quedan en la bandeja y se
// mandan solas al volver. Lo de un cliente que ya tiene algo sin enviar
// también espera en la PC, para llegar en orden.

export const bandejaDeLaPc = () =>
  ventasDeLaPc().catch(() => [] as VentaPendiente[]);

/** Sin conexión no se opera pasadas 24 h o con la farmacia en solo lectura. */
export async function puedeOperarSinConexion(
  token: string,
  organizationId: string,
  /** Termina algo pendiente (recibir): con conexión se permite en solo lectura. */
  permitirSoloLectura = false,
) {
  const ultima = horaUltimaSincronizacion();
  if (!ultima || Date.now() - ultima > VIGENCIA_SIN_CONEXION_MS)
    throw new SinConexionError(
      "Pasaron más de 24 horas sin conexión con el servidor. Para registrar esta operación hace falta que vuelva internet.",
    );
  const { getSubscriptionStatus } = await import("./subscription-status");
  const estado = await getSubscriptionStatus(token, organizationId).catch(
    () => undefined,
  );
  if (
    (estado?.access === "READ_ONLY" && !permitirSoloLectura) ||
    estado?.access === "BLOCKED"
  )
    throw new SinConexionError(
      "La farmacia está en solo lectura o bloqueada: sin conexión no se pueden registrar operaciones.",
    );
}

/**
 * Manda la operación al servidor; si no hay conexión (o el cliente tiene algo
 * sin enviar), la guarda en la PC.
 */
async function cuentaConRespaldo<T>(
  token: string,
  organizationId: string,
  customerId: string,
  enLinea: () => Promise<T>,
  enLaPc: () => Promise<T>,
): Promise<T> {
  const enEspera =
    token !== TOKEN_SIN_CONEXION &&
    clienteConPendientes(await bandejaDeLaPc(), organizationId, customerId);
  if (enEspera) return enLaPc();
  if (token !== TOKEN_SIN_CONEXION)
    try {
      return await enLinea();
    } catch (cause) {
      if (!(cause instanceof SinConexionError)) throw cause;
    }
  await puedeOperarSinConexion(token, organizationId);
  return enLaPc();
}

export async function getCustomerAccounts(
  token: string,
  organizationId: string,
  branchId: string,
): Promise<CustomerAccount[]> {
  const [cuentas, bandeja] = await Promise.all([
    getCustomerAccountsDelServidor(token, organizationId, branchId),
    bandejaDeLaPc(),
  ]);
  // Para no contar dos veces lo que la PC envió y el servidor ya tiene, se
  // piden los movimientos de los clientes con algo pendiente (pocos).
  const conPendientes = new Set(
    clientesConMovimientosPendientes(bandeja, organizationId),
  );
  const conMovimientos = await Promise.all(
    cuentas.map(async (cuenta) =>
      conPendientes.has(cuenta.id)
        ? {
            ...cuenta,
            movements: await getCustomerAccountMovementsDelServidor(
              token,
              organizationId,
              branchId,
              cuenta.id,
            ).catch(() => undefined),
          }
        : cuenta,
    ),
  );
  return cuentasConPendientes(conMovimientos, bandeja, organizationId);
}

/**
 * Movimientos de un cliente, con lo hecho en la PC que todavía no llegó
 * (SISTEMA-75).
 */
export async function getCustomerAccountMovements(
  token: string,
  organizationId: string,
  branchId: string,
  customerId: string,
): Promise<CustomerAccountMovement[]> {
  const bandeja = await bandejaDeLaPc();
  const servidor = await getCustomerAccountMovementsDelServidor(
    token,
    organizationId,
    branchId,
    customerId,
  ).catch((cause: unknown) => {
    // Un cliente dado de alta sin conexión todavía no existe en el servidor.
    if (pendientesDelCliente(bandeja, organizationId, customerId).length)
      return [] as CustomerAccountMovement[];
    throw cause;
  });
  return movimientosConPendientes(
    servidor,
    bandeja,
    organizationId,
    customerId,
  );
}

export async function getParties(
  token: string,
  organizationId: string,
  type: "customers" | "suppliers",
): Promise<Party[]> {
  const lista = await getPartiesDelServidor(token, organizationId, type);
  return type === "customers"
    ? clientesConPendientes(lista, await bandejaDeLaPc(), organizationId)
    : proveedoresConPendientes(lista, await bandejaDeLaPc(), organizationId);
}

export async function getAccountItems(
  token: string,
  org: string,
  branch: string,
  customer: string,
): Promise<AccountItems> {
  const bandeja = await bandejaDeLaPc();
  let base: AccountItems | undefined;
  try {
    base = await getAccountItemsDelServidor(token, org, branch, customer);
  } catch (cause) {
    // Un cliente nuevo o sin datos guardados: alcanza con lo de la PC.
    if (
      !(cause instanceof SinConexionError) ||
      !clienteConPendientes(bandeja, org, customer)
    )
      throw cause;
  }
  return itemsConPendientes(base, bandeja, org, customer);
}

/** Aumento por precios calculado en la PC, con lo que debe hoy cada artículo. */
async function previewLocal(
  token: string,
  org: string,
  branch: string,
  customer: string,
  sale: string,
): Promise<AccountPricePreview> {
  const detalle = await getAccountItems(token, org, branch, customer);
  const filas = detalle.items.filter(
    (item) => sale === "all" || item.saleId === sale,
  );
  const cambiados = filas.filter((item) => BigInt(item.increaseMinor) > 0n);
  const aumento = cambiados.reduce((s, i) => s + BigInt(i.increaseMinor), 0n);
  const pendiente = filas.reduce((s, i) => s + BigInt(i.pendingMinor), 0n);
  return {
    fingerprint: "sin-conexion",
    items: cambiados,
    increaseMinor: aumento.toString(),
    pendingMinor: pendiente.toString(),
    nextPendingMinor: (pendiente + aumento).toString(),
  };
}

export async function previewAccountPrices(
  token: string,
  org: string,
  branch: string,
  customer: string,
  sale: string,
): Promise<AccountPricePreview> {
  return cuentaConRespaldo(
    token,
    org,
    customer,
    () => previewAccountPricesEnLinea(token, org, branch, customer, sale),
    () => previewLocal(token, org, branch, customer, sale),
  );
}

/** Cuánto cambia lo que debe cada venta, para Vencimientos. */
function porVenta(cambios: { saleId: string; deltaMinor: bigint }[]) {
  const total = new Map<string, bigint>();
  for (const c of cambios)
    if (c.saleId)
      total.set(c.saleId, (total.get(c.saleId) ?? 0n) + c.deltaMinor);
  return [...total].map(([saleId, d]) => ({
    saleId,
    deltaMinor: d.toString(),
  }));
}

export async function updateAccountPrices(
  token: string,
  org: string,
  branch: string,
  customer: string,
  sale: string,
  fingerprint: string,
  clientOperationId: string,
): Promise<void> {
  return cuentaConRespaldo(
    token,
    org,
    customer,
    () =>
      updateAccountPricesEnLinea(
        token,
        org,
        branch,
        customer,
        sale,
        fingerprint,
        clientOperationId,
      ),
    async () => {
      const vista = await previewLocal(token, org, branch, customer, sale);
      const referencias = [
        ...new Map(
          vista.items
            .filter((item) => item.productId && item.referencePriceMinor)
            .map((item) => [
              item.productId!,
              {
                productId: item.productId!,
                referencePriceMinor: Number(item.referencePriceMinor),
              },
            ]),
        ).values(),
      ];
      if (!referencias.length) return;
      await guardarOperacionCuenta(org, branch, {
        tipo: "ACTUALIZAR_PRECIOS",
        customerId: customer,
        cuerpo: { saleId: sale, referencias },
        clientOperationId,
        totalMinor: vista.increaseMinor,
        local: {
          ventas: porVenta(
            vista.items.map((item) => ({
              saleId: item.saleId,
              deltaMinor: BigInt(item.increaseMinor),
            })),
          ),
        },
      });
    },
  );
}

export async function increaseAccountDebt(
  token: string,
  org: string,
  branch: string,
  customer: string,
  item: string,
  input: {
    expectedPendingMinor: number;
    nextPendingMinor: number;
    reason: string;
    clientOperationId: string;
  },
): Promise<void> {
  return cuentaConRespaldo(
    token,
    org,
    customer,
    () => increaseAccountDebtEnLinea(token, org, branch, customer, item, input),
    async () => {
      const linea = lineaDeId(item);
      const detalle = await getAccountItems(token, org, branch, customer);
      const saleId =
        detalle.items.find((i) => i.saleItemId === item)?.saleId ?? "";
      const { clientOperationId, ...resto } = input;
      const aumento = BigInt(
        input.nextPendingMinor - input.expectedPendingMinor,
      );
      await guardarOperacionCuenta(org, branch, {
        tipo: "AUMENTO_DEUDA",
        customerId: customer,
        cuerpo: { ...resto, destino: linea ? { linea } : { saleItemId: item } },
        clientOperationId,
        totalMinor: aumento.toString(),
        local: { ventas: porVenta([{ saleId, deltaMinor: aumento }]) },
      });
    },
  );
}

export async function increaseAccountTotalDebt(
  token: string,
  org: string,
  branch: string,
  customer: string,
  input: {
    expectedPendingMinor: number;
    nextPendingMinor: number;
    reason: string;
    clientOperationId: string;
    expectedItems: { saleItemId: string; pendingMinor: string }[];
  },
): Promise<void> {
  return cuentaConRespaldo(
    token,
    org,
    customer,
    () => increaseAccountTotalDebtEnLinea(token, org, branch, customer, input),
    async () => {
      const detalle = await getAccountItems(token, org, branch, customer);
      const aumento = BigInt(
        input.nextPendingMinor - input.expectedPendingMinor,
      );
      await guardarOperacionCuenta(org, branch, {
        tipo: "AUMENTO_DEUDA_TOTAL",
        customerId: customer,
        // El servidor reparte el aumento con lo que debe cada artículo al llegar.
        cuerpo: {
          expectedPendingMinor: input.expectedPendingMinor,
          nextPendingMinor: input.nextPendingMinor,
          reason: input.reason,
        },
        clientOperationId: input.clientOperationId,
        totalMinor: aumento.toString(),
        local: {
          ventas: porVenta(
            repartirAumento(detalle.items, aumento).map((parte) => ({
              saleId:
                detalle.items.find((i) => i.saleItemId === parte.saleItemId)
                  ?.saleId ?? "",
              deltaMinor: parte.amountMinor,
            })),
          ),
        },
      });
    },
  );
}

export async function assignAccountItems(
  token: string,
  org: string,
  branch: string,
  customer: string,
  movement: string,
  allocations: ItemAllocation[],
): Promise<void> {
  return cuentaConRespaldo(
    token,
    org,
    customer,
    () =>
      assignAccountItemsEnLinea(
        token,
        org,
        branch,
        customer,
        movement,
        allocations,
      ),
    async () => {
      const detalle = await getAccountItems(token, org, branch, customer);
      // Asignar un cobro suelto baja lo que debe cada venta; la asignación
      // inicial de una venta mixta, no.
      const suelto = detalle.unassignedReceipts.some((u) => u.id === movement);
      await guardarOperacionCuenta(org, branch, {
        tipo: "ASIGNACION",
        customerId: customer,
        cuerpo: {
          movementId: movement,
          imputaciones: aImputaciones(allocations),
        },
        local: suelto
          ? {
              ventas: porVenta(
                allocations.map((a) => ({
                  saleId:
                    detalle.items.find((i) => i.saleItemId === a.saleItemId)
                      ?.saleId ?? "",
                  deltaMinor: -BigInt(a.amountMinor),
                })),
              ),
            }
          : undefined,
      });
    },
  );
}

export async function configureCustomerAccount(
  token: string,
  organizationId: string,
  branchId: string,
  customerId: string,
  enabled: boolean,
  creditLimitMinor: number | null,
  accountTermDays?: number | null,
): Promise<void> {
  return cuentaConRespaldo(
    token,
    organizationId,
    customerId,
    () =>
      configureCustomerAccountEnLinea(
        token,
        organizationId,
        branchId,
        customerId,
        enabled,
        creditLimitMinor,
        accountTermDays,
      ),
    async () => {
      await guardarOperacionCuenta(organizationId, branchId, {
        tipo: "CONFIGURAR",
        customerId,
        cuerpo: {
          enabled,
          creditLimitMinor,
          ...(accountTermDays !== undefined ? { accountTermDays } : {}),
        },
      });
    },
  );
}

export async function createCustomerAccountReceipt(
  token: string,
  organizationId: string,
  branchId: string,
  customerId: string,
  amountMinor: number,
  method: "CASH" | "CARD" | "TRANSFER" | "OTHER",
  note?: string,
  cashSessionId?: string,
  clientOperationId: string = crypto.randomUUID(),
  allocations: ItemAllocation[] = [],
  payments?: { method: "CASH" | "CARD" | "TRANSFER"; amountMinor: number }[],
): Promise<{ id: string; amountMinor: string }> {
  return cuentaConRespaldo(
    token,
    organizationId,
    customerId,
    () =>
      createCustomerAccountReceiptEnLinea(
        token,
        organizationId,
        branchId,
        customerId,
        amountMinor,
        method,
        note,
        cashSessionId,
        clientOperationId,
        allocations,
        payments,
      ),
    async () => {
      const [detalle, cuentas, encabezado] = await Promise.all([
        getAccountItems(token, organizationId, branchId, customerId),
        getCustomerAccounts(token, organizationId, branchId).catch(
          () => [] as CustomerAccount[],
        ),
        encabezadoGuardado(organizationId, branchId).catch(() => undefined),
      ]);
      const fila = (id: string) =>
        detalle.items.find((i) => i.saleItemId === id);
      const ajuste = (a: ItemAllocation) =>
        a.expectedPendingMinor !== undefined
          ? BigInt(a.nextPendingMinor ?? a.amountMinor) -
            BigInt(a.expectedPendingMinor)
          : 0n;
      const ajustes = allocations.reduce((s, a) => s + ajuste(a), 0n);
      const recibo: AccountReceipt = {
        id: clientOperationId,
        createdAt: new Date().toISOString(),
        customerName:
          cuentas.find((c) => c.id === customerId)?.name ?? "Cliente",
        branchName: encabezado?.branch ?? "",
        ...(encabezado?.store ? { store: encabezado.store } : {}),
        amountMinor: String(amountMinor),
        method,
        ...(payments
          ? {
              payments: payments.map((p) => ({
                method: p.method,
                amountMinor: String(p.amountMinor),
              })),
            }
          : {}),
        note: [note?.trim(), LEYENDA_PROVISORIO].filter(Boolean).join(" · "),
        balanceAfterMinor: (
          BigInt(detalle.balanceMinor) +
          ajustes -
          BigInt(amountMinor)
        ).toString(),
        items: allocations.map((a) => ({
          name: fila(a.saleItemId)?.name ?? "Artículo",
          saleId: fila(a.saleItemId)?.saleId ?? "",
          amountMinor: String(a.amountMinor),
        })),
      };
      const { op } = await guardarOperacionCuenta(organizationId, branchId, {
        tipo: "COBRO",
        customerId,
        cuerpo: {
          amountMinor,
          method,
          ...(note?.trim() ? { note: note.trim() } : {}),
          ...(cashSessionId ? { cashSessionId } : {}),
          ...(payments ? { payments } : {}),
          ...(allocations.length
            ? { imputaciones: aImputaciones(allocations) }
            : {}),
        },
        clientOperationId,
        totalMinor: String(amountMinor),
        local: {
          ventas: porVenta(
            allocations.map((a) => ({
              saleId: fila(a.saleItemId)?.saleId ?? "",
              deltaMinor: ajuste(a) - BigInt(a.amountMinor),
            })),
          ),
          recibo,
        },
      });
      return { id: op.clientOperationId, amountMinor: String(amountMinor) };
    },
  );
}

export async function getAccountReceipt(
  token: string,
  organizationId: string,
  branchId: string,
  customerId: string,
  receiptId: string,
): Promise<AccountReceipt> {
  const local = reciboLocal(await bandejaDeLaPc(), receiptId);
  if (local) return local;
  return getAccountReceiptDelServidor(
    token,
    organizationId,
    branchId,
    customerId,
    receiptId,
  );
}

export async function getAccountSaleDetail(
  token: string,
  organizationId: string,
  branchId: string,
  customerId: string,
  movementId: string,
): Promise<AccountSaleDetail> {
  const local = detalleDeVentaLocal(await bandejaDeLaPc(), movementId);
  if (local) return local;
  return getAccountSaleDetailDelServidor(
    token,
    organizationId,
    branchId,
    customerId,
    movementId,
  );
}

export async function createParty(
  token: string,
  organizationId: string,
  type: "customers" | "suppliers",
  name: string,
  document: string,
  priceListId?: string,
  billing?: CustomerBilling,
  supplierTerms?: SupplierProfileInput,
  /** Sucursal desde la que se da de alta: sin conexión, el cliente queda en la PC. */
  branchId?: string,
): Promise<{ id: string; donde?: DondeQuedo }> {
  const enLinea = () =>
    createPartyEnLinea(
      token,
      organizationId,
      type,
      name,
      document,
      priceListId,
      billing,
      supplierTerms,
    );
  if (!branchId) return enLinea();
  if (token !== TOKEN_SIN_CONEXION)
    try {
      return await enLinea();
    } catch (cause) {
      if (!(cause instanceof SinConexionError)) throw cause;
    }
  await puedeOperarSinConexion(token, organizationId);
  if (type === "suppliers") {
    // El proveedor nuevo se usa enseguida: su id es el de la PC (SISTEMA-73).
    const alta = await guardarOperacionProveedor(organizationId, branchId, {
      tipo: "ALTA",
      cuerpo: {
        ...supplierTerms,
        name: name.trim(),
        ...(document ? { document } : {}),
      },
    });
    return { id: alta.clientOperationId, donde: "PC" };
  }
  const alta = await guardarAltaCliente(organizationId, branchId, {
    name: name.trim(),
    ...(document ? { document } : {}),
    ...(priceListId ? { priceListId } : {}),
    ...(billing ? { billing } : {}),
  });
  return { id: alta.clientOperationId };
}

async function enviarSinConexion(
  token: string,
  url: string,
  body: unknown,
  mensaje: string,
) {
  const response = await fetch(url, {
    method: "POST",
    headers: authJson(token),
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw await envioRechazado(response, mensaje);
  }
  return (await response.json()) as { offlineIssues?: unknown[] };
}

type EnvioFirmado = {
  actorId: string;
  deviceId: string;
  payload: string;
  signature: string;
};

/** Operación de cuenta corriente hecha sin conexión (SISTEMA-70). */
export function sendOfflineAccount(
  token: string,
  organizationId: string,
  branchId: string,
  body: Record<string, unknown>,
) {
  return enviarSinConexion(
    token,
    `${apiBaseUrl}/organizations/${organizationId}/branches/${branchId}/customer-accounts/offline`,
    body,
    "El servidor no aceptó la operación de cuenta corriente sin conexión.",
  );
}

/** La de otro usuario de esta PC, firmada por él (SISTEMA-70). */
export function sendSignedOfflineAccount(
  token: string,
  organizationId: string,
  branchId: string,
  body: EnvioFirmado,
) {
  return enviarSinConexion(
    token,
    `${apiBaseUrl}/organizations/${organizationId}/branches/${branchId}/customer-accounts/offline/firmada`,
    body,
    "El servidor no aceptó la operación de cuenta corriente sin conexión.",
  );
}

/** Cliente dado de alta sin conexión (SISTEMA-70). */
export function sendOfflineCustomer(
  token: string,
  organizationId: string,
  branchId: string,
  body: Record<string, unknown>,
) {
  return enviarSinConexion(
    token,
    `${apiBaseUrl}/organizations/${organizationId}/branches/${branchId}/customers/offline`,
    body,
    "El servidor no aceptó el cliente dado de alta sin conexión.",
  );
}

export function sendSignedOfflineCustomer(
  token: string,
  organizationId: string,
  branchId: string,
  body: EnvioFirmado,
) {
  return enviarSinConexion(
    token,
    `${apiBaseUrl}/organizations/${organizationId}/branches/${branchId}/customers/offline/firmada`,
    body,
    "El servidor no aceptó el cliente dado de alta sin conexión.",
  );
}

/** Editar un cliente: sin conexión (o si tiene algo sin enviar) queda en la PC (SISTEMA-70). */
export async function updateCustomerBilling(
  token: string,
  organizationId: string,
  customerId: string,
  billing: CustomerBilling & { name?: string; priceListId?: string | null },
  branchId?: string,
): Promise<void> {
  const enLinea = () =>
    updateCustomerBillingEnLinea(token, organizationId, customerId, billing);
  if (!branchId) return enLinea();
  return cuentaConRespaldo(
    token,
    organizationId,
    customerId,
    enLinea,
    async () => {
      await guardarEdicionCliente(
        organizationId,
        branchId,
        customerId,
        billing,
      );
    },
  );
}

/** Datos de un CUIT en el padrón de ARCA (SISTEMA-70). */
export type DatosDePadron = {
  cuit: string;
  nombre: string;
  condicionIva:
    "Responsable inscripto" | "Monotributista" | "Exento" | "Consumidor final";
  domicilio: string;
  localidad: string;
  provincia: string;
  codigoPostal: string;
  estado: string;
  environment: "HOMOLOGATION" | "PRODUCTION";
};

/** Busca un CUIT en ARCA para completar la ficha del cliente. Necesita internet. */
export async function buscarCuitEnArca(
  token: string,
  organizationId: string,
  cuit: string,
): Promise<DatosDePadron> {
  if (token === TOKEN_SIN_CONEXION)
    throw new SinConexionError(
      "Sin conexión: la búsqueda en ARCA necesita internet. Cargá los datos a mano.",
    );
  const response = await fetch(
    `${apiBaseUrl}/organizations/${organizationId}/fiscal/padron/${encodeURIComponent(cuit.replace(/[\s.-]/g, ""))}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!response.ok)
    throw await responseError(response, "No se pudo buscar el CUIT en ARCA.");
  return (await response.json()) as DatosDePadron;
}

// --- Proveedores sin conexión (SISTEMA-73) ---

/**
 * Manda la operación de proveedor al servidor; si no hay conexión (o el
 * proveedor tiene algo sin enviar), la guarda en la PC.
 */
async function proveedorConRespaldo(
  token: string,
  organizationId: string,
  supplierId: string,
  enLinea: () => Promise<void>,
  enLaPc: () => Promise<void>,
): Promise<DondeQuedo> {
  if (
    token !== TOKEN_SIN_CONEXION &&
    proveedorConPendientes(await bandejaDeLaPc(), organizationId, supplierId)
  ) {
    await enLaPc();
    return "PC";
  }
  if (token !== TOKEN_SIN_CONEXION)
    try {
      await enLinea();
      return "SERVIDOR";
    } catch (cause) {
      if (!(cause instanceof SinConexionError)) throw cause;
    }
  await puedeOperarSinConexion(token, organizationId);
  await enLaPc();
  return "PC";
}

/** Proveedor dado de alta, editado o dado de baja sin conexión (SISTEMA-73). */
export function sendOfflineSupplier(
  token: string,
  organizationId: string,
  branchId: string,
  body: Record<string, unknown>,
) {
  return enviarSinConexion(
    token,
    `${apiBaseUrl}/organizations/${organizationId}/branches/${branchId}/suppliers/offline`,
    body,
    "El servidor no aceptó el proveedor guardado sin conexión.",
  );
}

export function sendSignedOfflineSupplier(
  token: string,
  organizationId: string,
  branchId: string,
  body: EnvioFirmado,
) {
  return enviarSinConexion(
    token,
    `${apiBaseUrl}/organizations/${organizationId}/branches/${branchId}/suppliers/offline/firmada`,
    body,
    "El servidor no aceptó el proveedor guardado sin conexión.",
  );
}

/** Deuda, pago o anulación de cuentas por pagar hecho sin conexión (SISTEMA-73). */
export function sendOfflinePayable(
  token: string,
  organizationId: string,
  branchId: string,
  body: Record<string, unknown>,
) {
  return enviarSinConexion(
    token,
    `${apiBaseUrl}/organizations/${organizationId}/branches/${branchId}/supplier-payables/offline`,
    body,
    "El servidor no aceptó la operación de cuentas por pagar sin conexión.",
  );
}

export function sendSignedOfflinePayable(
  token: string,
  organizationId: string,
  branchId: string,
  body: EnvioFirmado,
) {
  return enviarSinConexion(
    token,
    `${apiBaseUrl}/organizations/${organizationId}/branches/${branchId}/supplier-payables/offline/firmada`,
    body,
    "El servidor no aceptó la operación de cuentas por pagar sin conexión.",
  );
}

// --- Productos e inventario sin conexión (SISTEMA-79) ---
// Cada operación intenta con conexión; sin conexión queda en la PC, firmada,
// y se manda sola al volver. Si el producto o el lote ya tiene algo sin
// enviar (o se creó sin conexión), va directo a la PC para llegar en orden.
// Las lecturas suman lo hecho en la PC que todavía no llegó.

async function conRespaldoEnLaPc<T>(
  token: string,
  organizationId: string,
  enEspera: boolean,
  enLinea: () => Promise<T>,
  enLaPc: () => Promise<T>,
): Promise<T> {
  if (enEspera && token !== TOKEN_SIN_CONEXION) return enLaPc();
  if (token !== TOKEN_SIN_CONEXION)
    try {
      return await enLinea();
    } catch (cause) {
      if (!(cause instanceof SinConexionError)) throw cause;
    }
  await puedeOperarSinConexion(token, organizationId);
  return enLaPc();
}

/** ¿El producto, o la categoría o el laboratorio que usa, espera en la PC? */
async function catalogoEnEspera(
  organizationId: string,
  ...ids: (string | null | undefined)[]
) {
  const bandeja = await bandejaDeLaPc();
  const pendientes = pendientesDeCatalogo(bandeja, organizationId);
  return ids.some(
    (id) =>
      id &&
      (productoConPendientes(bandeja, organizationId, id) ||
        pendientes.some(
          ({ op }) => op.tipo === "OPCION" && op.clientOperationId === id,
        )),
  );
}

/** El producto como se ve en la PC (para saber qué cambió una edición). */
async function productoDeLaPc(
  token: string,
  organizationId: string,
  branchId: string,
  productId: string,
) {
  return productoPorId(
    await getCatalogProducts(token, organizationId, branchId).catch(
      () => [] as CatalogProduct[],
    ),
    productId,
  );
}

/**
 * Catálogo de la sucursal (o de la organización sin `branchId`). Se baja por
 * partes y sólo lo que cambió desde la última vez; la PC lo guarda y sin
 * conexión lo arma con lo guardado (SISTEMA-74). Suma lo hecho en la PC que
 * todavía no llegó (SISTEMA-79).
 */
export async function getCatalogProducts(
  token: string,
  organizationId: string,
  branchId?: string,
): Promise<CatalogProduct[]> {
  const [catalogo, bandeja] = await Promise.all([
    getCatalogProductsDelServidor(token, organizationId, branchId),
    bandejaDeLaPc(),
  ]);
  const pendientes = pendientesDeCatalogo(bandeja, organizationId);
  if (!pendientes.some(({ op }) => op.tipo !== "OPCION")) return catalogo;
  const opciones = pendientes.some(
    ({ op }) =>
      op.tipo === "ALTA" ||
      op.tipo === "EDICION" ||
      op.tipo === "OPCION_EDICION",
  )
    ? await getCatalogOptionsDelServidor(token, organizationId).catch(
        () => undefined,
      )
    : undefined;
  return productosConPendientes(
    catalogo,
    bandeja,
    organizationId,
    branchId,
    opciones,
  );
}

export async function getCatalogOptions(
  token: string,
  organizationId: string,
): Promise<CatalogOptions> {
  const [opciones, bandeja] = await Promise.all([
    getCatalogOptionsDelServidor(token, organizationId),
    bandejaDeLaPc(),
  ]);
  return opcionesConPendientes(opciones, bandeja, organizationId);
}

/**
 * Stock de la sucursal. Se baja por partes y sólo lo que cambió desde la
 * última vez (SISTEMA-77). Suma los ingresos, ajustes, devoluciones y
 * correcciones hechos en la PC que todavía no llegaron (SISTEMA-79).
 */
export async function getStock(
  token: string,
  organizationId: string,
  branchId: string,
): Promise<StockLot[]> {
  const [stock, bandeja] = await Promise.all([
    getStockDelServidor(token, organizationId, branchId),
    bandejaDeLaPc(),
  ]);
  const pendientes = pendientesDeInventario(bandeja, organizationId, branchId);
  if (!pendientes.length) return stock;
  // Nombre de un producto que todavía no tiene lotes en la sucursal.
  const sinLotes = pendientes.some(
    (op) =>
      op.tipo === "INGRESO" &&
      !stock.some((lote) => lote.productId === op.cuerpo.productId),
  );
  const catalogo = sinLotes
    ? await getCatalogProducts(token, organizationId, branchId).catch(
        () => [] as CatalogProduct[],
      )
    : [];
  return stockConPendientes(
    stock,
    bandeja,
    organizationId,
    branchId,
    (id) => productoPorId(catalogo, id)?.name,
  );
}

export async function createCatalogProduct(
  token: string,
  organizationId: string,
  input: Parameters<typeof createCatalogProductEnLinea>[2],
  /** Sucursal desde la que se da de alta: sin conexión, queda en la PC. */
  branchId?: string,
): Promise<{ id?: string; donde?: DondeQuedo }> {
  const enLinea = () =>
    createCatalogProductEnLinea(token, organizationId, input);
  if (!branchId) return enLinea();
  return conRespaldoEnLaPc(
    token,
    organizationId,
    await catalogoEnEspera(
      organizationId,
      input.categoryId,
      input.laboratoryId,
    ),
    enLinea,
    async () => {
      // El producto nuevo se usa enseguida: su id es el de la PC.
      const id = crypto.randomUUID();
      await guardarOperacionCatalogo(
        organizationId,
        branchId,
        { tipo: "ALTA", cuerpo: input },
        id,
      );
      return { id, donde: "PC" as const };
    },
  );
}

export async function updateCatalogProduct(
  token: string,
  organizationId: string,
  productId: string,
  input: Parameters<typeof updateCatalogProductEnLinea>[3],
  branchId?: string,
): Promise<void> {
  const enLinea = () =>
    updateCatalogProductEnLinea(token, organizationId, productId, input);
  if (!branchId) return enLinea();
  return conRespaldoEnLaPc(
    token,
    organizationId,
    await catalogoEnEspera(
      organizationId,
      productId,
      input.categoryId,
      input.laboratoryId,
    ),
    enLinea,
    async () => {
      // Sólo lo que cambió: no se pisa lo que otra PC cambió en otros datos.
      const antes = await productoDeLaPc(
        token,
        organizationId,
        branchId,
        productId,
      );
      const cuerpo = antes ? camposCambiadosDelProducto(antes, input) : input;
      if (!Object.keys(cuerpo).length) return;
      await guardarOperacionCatalogo(organizationId, branchId, {
        tipo: "EDICION",
        productId,
        cuerpo,
      });
    },
  );
}

export async function updateCatalogProductImage(
  token: string,
  organizationId: string,
  productId: string,
  imageDataUrl: string | null,
  branchId?: string,
): Promise<void> {
  const enLinea = () =>
    updateCatalogProductImageEnLinea(
      token,
      organizationId,
      productId,
      imageDataUrl,
    );
  if (!branchId) return enLinea();
  return conRespaldoEnLaPc(
    token,
    organizationId,
    await catalogoEnEspera(organizationId, productId),
    enLinea,
    async () => {
      await guardarOperacionCatalogo(organizationId, branchId, {
        tipo: "EDICION",
        productId,
        cuerpo: { imageDataUrl },
      });
    },
  );
}

export async function changeBranchProduct(
  token: string,
  organizationId: string,
  branchId: string,
  productId: string,
  input: Parameters<typeof changeBranchProductEnLinea>[4],
): Promise<void> {
  return conRespaldoEnLaPc(
    token,
    organizationId,
    await catalogoEnEspera(organizationId, productId),
    () =>
      changeBranchProductEnLinea(
        token,
        organizationId,
        branchId,
        productId,
        input,
      ),
    async () => {
      await guardarOperacionCatalogo(organizationId, branchId, {
        tipo: "ESTADO_SUCURSAL",
        productId,
        cuerpo: input,
      });
    },
  );
}

export async function addEquivalentBarcode(
  token: string,
  organizationId: string,
  productId: string,
  code: string,
  branchId?: string,
): Promise<{ productId: string; productName: string; code: string }> {
  const enLinea = () =>
    addEquivalentBarcodeEnLinea(token, organizationId, productId, code);
  if (!branchId) return enLinea();
  return conRespaldoEnLaPc(
    token,
    organizationId,
    await catalogoEnEspera(organizationId, productId),
    enLinea,
    async () => {
      await guardarOperacionCatalogo(organizationId, branchId, {
        tipo: "CODIGO_AGREGAR",
        productId,
        cuerpo: { code: code.trim() },
      });
      const producto = await productoDeLaPc(
        token,
        organizationId,
        branchId,
        productId,
      );
      return {
        productId,
        productName: producto?.name ?? "Producto",
        code: code.trim(),
      };
    },
  );
}

export async function removeEquivalentBarcode(
  token: string,
  organizationId: string,
  productId: string,
  code: string,
  branchId?: string,
): Promise<void> {
  const enLinea = () =>
    removeEquivalentBarcodeEnLinea(token, organizationId, productId, code);
  if (!branchId) return enLinea();
  return conRespaldoEnLaPc(
    token,
    organizationId,
    await catalogoEnEspera(organizationId, productId),
    enLinea,
    async () => {
      await guardarOperacionCatalogo(organizationId, branchId, {
        tipo: "CODIGO_QUITAR",
        productId,
        cuerpo: { code: code.trim() },
      });
    },
  );
}

export async function deleteUnusedCatalogProduct(
  token: string,
  organizationId: string,
  productId: string,
  branchId?: string,
): Promise<void> {
  const enLinea = () =>
    deleteUnusedCatalogProductEnLinea(token, organizationId, productId);
  if (!branchId) return enLinea();
  return conRespaldoEnLaPc(
    token,
    organizationId,
    await catalogoEnEspera(organizationId, productId),
    enLinea,
    async () => {
      await guardarOperacionCatalogo(organizationId, branchId, {
        tipo: "ELIMINAR",
        productId,
        cuerpo: {},
      });
    },
  );
}

export async function createCatalogNamedItem(
  token: string,
  organizationId: string,
  type: "categories" | "laboratories",
  name: string,
  icon?: import("@gestion/contracts").CategoryIcon,
  color?: import("@gestion/contracts").CategoryColor,
  parentId?: string | null,
  /** Sin conexión, la categoría o el laboratorio queda en la PC. */
  branchId?: string,
): Promise<CatalogOptions["categories"][number]> {
  const enLinea = () =>
    createCatalogNamedItemEnLinea(
      token,
      organizationId,
      type,
      name,
      icon,
      color,
      parentId,
    );
  if (!branchId) return enLinea();
  return conRespaldoEnLaPc(
    token,
    organizationId,
    await catalogoEnEspera(organizationId, parentId),
    enLinea,
    async () => {
      const id = crypto.randomUUID();
      await guardarOperacionCatalogo(
        organizationId,
        branchId,
        {
          tipo: "OPCION",
          cuerpo: {
            type,
            name: name.trim(),
            ...(type === "categories"
              ? {
                  parentId: parentId ?? null,
                  ...(icon ? { icon } : {}),
                  ...(color ? { color } : {}),
                }
              : {}),
          },
        },
        id,
      );
      return {
        id,
        name: name.trim(),
        ...(type === "categories" ? { parentId: parentId ?? null } : {}),
      };
    },
  );
}

/** ¿El lote o su producto esperan en la PC? Lo nuevo va detrás, en orden. */
async function inventarioEnEspera(
  organizationId: string,
  branchId: string,
  lotId: string | undefined,
  productId: string | undefined,
) {
  const bandeja = await bandejaDeLaPc();
  return (
    (lotId !== undefined &&
      loteConPendientes(bandeja, organizationId, branchId, lotId)) ||
    (productId !== undefined &&
      (productoConPendientes(bandeja, organizationId, productId) ||
        pendientesDeInventario(bandeja, organizationId, branchId).some(
          (op) => op.tipo === "INGRESO" && op.cuerpo.productId === productId,
        )))
  );
}

export async function receiveStock(
  token: string,
  organizationId: string,
  branchId: string,
  input: Parameters<typeof receiveStockEnLinea>[3],
): Promise<void> {
  return conRespaldoEnLaPc(
    token,
    organizationId,
    await inventarioEnEspera(
      organizationId,
      branchId,
      undefined,
      input.productId,
    ),
    () => receiveStockEnLinea(token, organizationId, branchId, input),
    async () => {
      await guardarOperacionInventario(organizationId, branchId, {
        tipo: "INGRESO",
        cuerpo: input,
      });
    },
  );
}

export async function adjustStock(
  token: string,
  organizationId: string,
  branchId: string,
  input: Parameters<typeof adjustStockEnLinea>[3],
): Promise<void> {
  return conRespaldoEnLaPc(
    token,
    organizationId,
    await inventarioEnEspera(organizationId, branchId, input.lotId, undefined),
    () => adjustStockEnLinea(token, organizationId, branchId, input),
    async () => {
      const { lotId, ...cuerpo } = input;
      await guardarOperacionInventario(organizationId, branchId, {
        tipo: "AJUSTE",
        cuerpo: { ...cuerpo, lote: loteDeLaOperacion(lotId) },
      });
    },
  );
}

export async function createSupplierReturn(
  token: string,
  organizationId: string,
  branchId: string,
  input: Parameters<typeof createSupplierReturnEnLinea>[3],
): Promise<void> {
  return conRespaldoEnLaPc(
    token,
    organizationId,
    await inventarioEnEspera(organizationId, branchId, input.lotId, undefined),
    () => createSupplierReturnEnLinea(token, organizationId, branchId, input),
    async () => {
      const { lotId, ...cuerpo } = input;
      await guardarOperacionInventario(organizationId, branchId, {
        tipo: "DEVOLUCION",
        cuerpo: { ...cuerpo, lote: loteDeLaOperacion(lotId) },
      });
    },
  );
}

export async function editLotMetadata(
  token: string,
  organizationId: string,
  branchId: string,
  lot: StockLot,
  number: string,
  expiresAt: string | null,
  reason: string,
  unitCostMinor?: string,
): Promise<void> {
  return conRespaldoEnLaPc(
    token,
    organizationId,
    await inventarioEnEspera(organizationId, branchId, lot.id, undefined),
    () =>
      editLotMetadataEnLinea(
        token,
        organizationId,
        branchId,
        lot,
        number,
        expiresAt,
        reason,
        unitCostMinor,
      ),
    async () => {
      // Sólo lo que cambió: no se pisa lo que otra PC corrigió en otro dato.
      const vence = lot.expiresAt?.slice(0, 10) ?? null;
      await guardarOperacionInventario(organizationId, branchId, {
        tipo: "EDICION_LOTE",
        cuerpo: {
          lote: loteDeLaOperacion(lot.id),
          ...(number.trim() !== lot.number ? { number: number.trim() } : {}),
          ...(expiresAt !== vence ? { expiresAt } : {}),
          ...(unitCostMinor !== undefined && unitCostMinor !== lot.unitCostMinor
            ? { unitCostMinor }
            : {}),
          reason,
        },
      });
    },
  );
}

/** Operación de productos hecha sin conexión (SISTEMA-79). */
export function sendOfflineCatalog(
  token: string,
  organizationId: string,
  branchId: string,
  body: Record<string, unknown>,
) {
  return enviarSinConexion(
    token,
    `${apiBaseUrl}/organizations/${organizationId}/branches/${branchId}/catalog/offline`,
    body,
    "El servidor no aceptó el producto guardado sin conexión.",
  );
}

export function sendSignedOfflineCatalog(
  token: string,
  organizationId: string,
  branchId: string,
  body: EnvioFirmado,
) {
  return enviarSinConexion(
    token,
    `${apiBaseUrl}/organizations/${organizationId}/branches/${branchId}/catalog/offline/firmada`,
    body,
    "El servidor no aceptó el producto guardado sin conexión.",
  );
}

/** Movimiento de inventario hecho sin conexión (SISTEMA-79). */
export function sendOfflineInventory(
  token: string,
  organizationId: string,
  branchId: string,
  body: Record<string, unknown>,
) {
  return enviarSinConexion(
    token,
    `${apiBaseUrl}/organizations/${organizationId}/branches/${branchId}/inventory/offline`,
    body,
    "El servidor no aceptó el movimiento de inventario guardado sin conexión.",
  );
}

export function sendSignedOfflineInventory(
  token: string,
  organizationId: string,
  branchId: string,
  body: EnvioFirmado,
) {
  return enviarSinConexion(
    token,
    `${apiBaseUrl}/organizations/${organizationId}/branches/${branchId}/inventory/offline/firmada`,
    body,
    "El servidor no aceptó el movimiento de inventario guardado sin conexión.",
  );
}

// --- Categorías, laboratorios y listas de precios sin conexión (SISTEMA-80) ---

export async function changeCatalogNamedItem(
  token: string,
  organizationId: string,
  type: "categories" | "laboratories",
  id: string,
  name?: string,
  parentId?: string | null,
  /** Sin conexión, el cambio queda en la PC. */
  branchId?: string,
): Promise<void> {
  const enLinea = () =>
    changeCatalogNamedItemEnLinea(
      token,
      organizationId,
      type,
      id,
      name,
      parentId,
    );
  if (!branchId) return enLinea();
  return conRespaldoEnLaPc(
    token,
    organizationId,
    await catalogoEnEspera(organizationId, id, parentId),
    enLinea,
    async () => {
      await guardarOperacionCatalogo(
        organizationId,
        branchId,
        name === undefined
          ? { tipo: "OPCION_BAJA", cuerpo: { type, id } }
          : {
              tipo: "OPCION_EDICION",
              cuerpo: {
                type,
                id,
                name: name.trim(),
                ...(type === "categories" && parentId !== undefined
                  ? { parentId }
                  : {}),
              },
            },
      );
    },
  );
}

export async function updateCategoryIcon(
  token: string,
  organizationId: string,
  id: string,
  icon: import("@gestion/contracts").CategoryIcon,
  color?: import("@gestion/contracts").CategoryColor,
  branchId?: string,
): Promise<void> {
  const enLinea = () =>
    updateCategoryIconEnLinea(token, organizationId, id, icon, color);
  if (!branchId) return enLinea();
  return conRespaldoEnLaPc(
    token,
    organizationId,
    await catalogoEnEspera(organizationId, id),
    enLinea,
    async () => {
      await guardarOperacionCatalogo(organizationId, branchId, {
        tipo: "OPCION_ICONO",
        cuerpo: { id, icon, ...(color ? { color } : {}) },
      });
    },
  );
}

/**
 * Logo de un laboratorio: sin `value` lo lee; con un dato lo guarda y con
 * null lo quita. Sin conexión, el cambio queda en la PC y se ve enseguida.
 */
export async function laboratoryLogo(
  token: string,
  organizationId: string,
  id: string,
  value?: string | null,
  signal?: AbortSignal,
  branchId?: string,
): Promise<string | undefined> {
  if (value === undefined) {
    const pendiente = logoPendiente(await bandejaDeLaPc(), organizationId, id);
    if (pendiente !== undefined) {
      if (pendiente === null) throw new Error("El laboratorio no tiene logo.");
      return pendiente;
    }
    return laboratoryLogoEnLinea(token, organizationId, id, value, signal);
  }
  const enLinea = () =>
    laboratoryLogoEnLinea(token, organizationId, id, value, signal);
  if (!branchId) return enLinea();
  return conRespaldoEnLaPc(
    token,
    organizationId,
    await catalogoEnEspera(organizationId, id),
    enLinea,
    async () => {
      await guardarOperacionCatalogo(organizationId, branchId, {
        tipo: "LOGO",
        cuerpo: { id, dataUrl: value },
      });
      return undefined;
    },
  );
}

/** Listas de precios con lo hecho en la PC que todavía no llegó. */
export async function getPriceLists(
  token: string,
  organizationId: string,
): Promise<PriceList[]> {
  const [listas, bandeja] = await Promise.all([
    getPriceListsDelServidor(token, organizationId),
    bandejaDeLaPc(),
  ]);
  return listasConPendientes(listas, bandeja, organizationId);
}

export async function createPriceList(
  token: string,
  organizationId: string,
  name: string,
  includeAll = false,
  /** Sin conexión, la lista nueva queda en la PC y se usa enseguida. */
  branchId?: string,
): Promise<{ id: string }> {
  const enLinea = () =>
    createPriceListEnLinea(token, organizationId, name, includeAll);
  if (!branchId) return enLinea();
  return conRespaldoEnLaPc(token, organizationId, false, enLinea, async () => {
    const id = crypto.randomUUID();
    await guardarOperacionCatalogo(
      organizationId,
      branchId,
      { tipo: "LISTA_ALTA", cuerpo: { name: name.trim(), includeAll } },
      id,
    );
    return { id };
  });
}

/** ¿La lista se creó o se cambió en la PC y todavía no llegó? */
export async function listaEnEspera(organizationId: string, listId: string) {
  return pendientesDeCatalogo(await bandejaDeLaPc(), organizationId).some(
    ({ op }) =>
      (op.tipo === "LISTA_ALTA" && op.clientOperationId === listId) ||
      ((op.tipo === "LISTA_EDICION" || op.tipo === "LISTA_PRECIOS") &&
        op.cuerpo.priceListId === listId),
  );
}

/** Guarda en la PC un cambio de una lista de precios hecho sin conexión. */
export async function guardarCambioDeLista(
  token: string,
  organizationId: string,
  branchId: string,
  datos:
    | {
        tipo: "LISTA_EDICION";
        cuerpo: {
          priceListId: string;
          name: string;
          fallbackPriceListId?: string | null;
        };
      }
    | {
        tipo: "LISTA_PRECIOS";
        cuerpo: {
          priceListId: string;
          changes: {
            productId: string;
            expectedMinor: string | null;
            amountMinor: string | null;
          }[];
        };
      },
) {
  await puedeOperarSinConexion(token, organizationId);
  await guardarOperacionCatalogo(organizationId, branchId, datos);
}
