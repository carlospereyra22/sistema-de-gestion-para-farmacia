import type { HealthResponse } from "@gestion/contracts";
import { categoryPath } from "./category-tree";
import type {
  SaleFiscalOptions,
  SaleFiscalCapabilities,
} from "@gestion/contracts";
import { withStockAvailability } from "./stock-availability";

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
    if (response.status === 400 || response.status === 409)
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
  const response = await fetch(`${apiBaseUrl}/auth/login`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!response.ok) throw new Error("No se pudo iniciar sesion.");
  return (await response.json()) as { accessToken: string };
}

export class SessionExpiredError extends Error {}
export async function refreshSession(): Promise<{ accessToken: string }> {
  const response = await fetch(`${apiBaseUrl}/auth/refresh`, {
    method: "POST",
    credentials: "include",
    signal: AbortSignal.timeout(10000),
  });
  if (response.status === 401)
    throw new SessionExpiredError("La sesión ya no es válida.");
  if (!response.ok)
    throw new Error("No se pudo renovar la conexión. Se reintentará.");
  return (await response.json()) as { accessToken: string };
}

export async function logout(): Promise<void> {
  await fetch(`${apiBaseUrl}/auth/logout`, {
    method: "POST",
    credentials: "include",
  });
}

export type CurrentUserProfile = {
  email: string;
  organizations: {
    organizationId: string;
    displayName?: string | null;
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
  roles: { role: { id: string; code: string } }[];
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
  permissions: { permission: { code: string } }[];
};

export type BranchListItem = {
  id: string;
  code: string;
  name: string;
  active: boolean;
  address?: string;
  city?: string;
  province?: string;
  phone?: string;
};

export type BranchInput = {
  name: string;
  code: string;
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
  input: { active: boolean; branchIds: string[]; roleIds: string[] },
): Promise<void> {
  const response = await fetch(
    `${apiBaseUrl}/organizations/${organizationId}/users/${userId}`,
    {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(input),
    },
  );
  if (!response.ok) {
    const result = (await response.json()) as { message?: string };
    throw new Error(result.message ?? "No se pudo actualizar el usuario.");
  }
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
  input: { name: string; code: string; permissionCodes: string[] },
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
  if (!response.ok) throw new Error("No se pudo crear el rol.");
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
  barcodes: { code: string; primary?: boolean }[];
  prices: { amountMinor: string }[];
};
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

export async function laboratoryLogo(
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
};
export async function getCatalogProducts(
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

export async function refreshCatalogPriceReferences(
  token: string,
  organizationId: string,
): Promise<{ checked: number; updated: number; skipped: boolean }> {
  const response = await fetch(
    `${apiBaseUrl}/organizations/${organizationId}/catalog/price-references/refresh`,
    { method: "POST", headers: authJson(token) },
  );
  if (!response.ok)
    throw await responseError(
      response,
      "No se pudieron actualizar las referencias de precios.",
    );
  return (await response.json()) as {
    checked: number;
    updated: number;
    skipped: boolean;
  };
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

export async function searchMedicineReferences(
  token: string,
  organizationId: string,
  query: string,
  source: MedicineReference["source"],
  signal?: AbortSignal,
): Promise<MedicineReference[]> {
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
}
export async function createCatalogProduct(
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
  },
): Promise<void> {
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

export async function changeBranchProduct(
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

export async function updateCatalogProductImage(
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

export async function updateCatalogProduct(
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

export async function deleteUnusedCatalogProduct(
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

export async function getCatalogOptions(
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

export async function createCatalogNamedItem(
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

export async function updateCategoryIcon(
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
export async function changeCatalogNamedItem(
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
export async function getPriceLists(
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
export async function createPriceList(
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
};
export type CustomerAccount = {
  document?: string | null;
  billingTaxId?: string | null;
  billingPhone?: string | null;
  accountTermDays?: number | null;
  id: string;
  name: string;
  creditEnabled: boolean;
  active: boolean;
  creditLimitMinor: string | null;
  balanceMinor: string;
  movements: {
    isPriceAdjustment?: boolean;
    isDebtAdjustment?: boolean;
    id: string;
    type: "DEBIT" | "CREDIT";
    amountMinor: string;
    note: string | null;
    createdAt: string;
    paymentMethod?: string | null;
    saleId?: string | null;
  }[];
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
export async function previewAccountPrices(
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
export async function updateAccountPrices(
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
  const response = await fetch(
    `${apiBaseUrl}/organizations/${org}/branches/${branch}/customer-accounts/${customer}/debt-increase`,
    { method: "POST", headers: authJson(token), body: JSON.stringify(input) },
  );
  if (!response.ok)
    throw await responseError(response, "No se pudo aumentar el saldo total.");
}
export async function getAccountItems(
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
export async function assignAccountItems(
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
export async function getAccountSaleDetail(
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
export async function getCustomerAccounts(
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
export async function configureCustomerAccount(
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

export async function getAccountReceipt(
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
export async function getParties(
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
export async function createParty(
  token: string,
  organizationId: string,
  type: "customers" | "suppliers",
  name: string,
  document: string,
  priceListId?: string,
  billing?: CustomerBilling,
  supplierTerms?: SupplierProfileInput,
): Promise<void> {
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
}

export async function updateSupplierTerms(
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

export async function updateCustomerBilling(
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

export async function setSupplierActive(
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
  unitCostMinor: string;
};

export async function getStock(
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

export async function receiveStock(
  token: string,
  organizationId: string,
  branchId: string,
  input: {
    productId: string;
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

export async function adjustStock(
  token: string,
  organizationId: string,
  branchId: string,
  input: { lotId: string; quantity: number; reason: string },
): Promise<void> {
  const response = await fetch(
    `${apiBaseUrl}/organizations/${organizationId}/branches/${branchId}/inventory/adjustments`,
    { method: "POST", headers: authJson(token), body: JSON.stringify(input) },
  );
  if (!response.ok)
    throw await responseError(response, "No se pudo ajustar el stock.");
}

export async function createSupplierReturn(
  token: string,
  organizationId: string,
  branchId: string,
  input: {
    supplierId: string;
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
export type CashSession = {
  openedBy?: string | null;
  id: string;
  cashRegisterId: string;
  openedAt: string;
  closedAt: string | null;
  openingAmountMinor: string;
  closingAmountMinor: string | null;
  cashSalesMinor: string;
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
  }[];
};

export type CashClosure = CashSession & {
  registerResponsibleName?: string | null;
  cashRegisterName: string;
  closedBy?: string | null;
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
  return (await response.json()) as CashClosure | null;
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
  if (!response.ok)
    throw await responseError(response, "No se pudo cerrar la caja.");
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
  status: "QUEUED" | "PENDING" | "AUTHORIZED" | "REJECTED" | "UNCERTAIN";
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
    throw await responseError(
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
    throw await responseError(
      response,
      "No se pudo verificar producción. Revisá el certificado y la autorización WSFE.",
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
  customerId?: string | null;
  status: "COMPLETED" | "CANCELLED";
  totalMinor: string;
  completedAt: string | null;
  items: {
    id: string;
    productId: string | null;
    description?: string | null;
    quantity: number;
    unitPriceMinor?: string;
    discountMinor?: string;
  }[];
  payments: {
    method: "CASH" | "CARD" | "TRANSFER" | "ACCOUNT" | "OTHER";
    amountMinor: string;
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
  return response.json();
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
    unitCostMinor: string;
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
): Promise<InventoryHistoryEntry[]> {
  const response = await fetch(
    `${apiBaseUrl}/organizations/${organizationId}/branches/${branchId}/inventory/history`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!response.ok)
    throw await responseError(
      response,
      "No se pudo cargar el historial de inventario.",
    );
  return response.json() as Promise<InventoryHistoryEntry[]>;
}
export async function getPurchases(
  token: string,
  organizationId: string,
  branchId: string,
): Promise<Purchase[]> {
  const response = await fetch(
    `${apiBaseUrl}/organizations/${organizationId}/branches/${branchId}/purchases`,
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
  sourceBranchId: string;
  destinationBranchId: string;
  status: "PREPARED" | "IN_TRANSIT" | "RECEIVED" | "CANCELLED";
  createdAt: string;
  items: {
    id: string;
    productId: string;
    lotId: string;
    quantity: number;
    receivedQuantity: number;
  }[];
};

export async function getTransfers(
  token: string,
  organizationId: string,
  branchId: string,
): Promise<Transfer[]> {
  const response = await fetch(
    `${apiBaseUrl}/organizations/${organizationId}/branches/${branchId}/transfers`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!response.ok)
    throw await responseError(
      response,
      "No se pudieron cargar las transferencias.",
    );
  return (await response.json()) as Transfer[];
}

export async function createTransfer(
  token: string,
  organizationId: string,
  branchId: string,
  input: {
    destinationBranchId: string;
    items: { lotId: string; quantity: number }[];
  },
): Promise<void> {
  const response = await fetch(
    `${apiBaseUrl}/organizations/${organizationId}/branches/${branchId}/transfers`,
    { method: "POST", headers: authJson(token), body: JSON.stringify(input) },
  );
  if (!response.ok)
    throw await responseError(
      response,
      "No se pudo preparar la transferencia.",
    );
}

export async function dispatchTransfer(
  token: string,
  organizationId: string,
  branchId: string,
  transferId: string,
): Promise<void> {
  const response = await fetch(
    `${apiBaseUrl}/organizations/${organizationId}/branches/${branchId}/transfers/${transferId}/dispatch`,
    { method: "POST", headers: authJson(token) },
  );
  if (!response.ok)
    throw await responseError(
      response,
      "No se pudo despachar la transferencia.",
    );
}

export async function receiveTransfer(
  token: string,
  organizationId: string,
  branchId: string,
  transferId: string,
): Promise<void> {
  const response = await fetch(
    `${apiBaseUrl}/organizations/${organizationId}/branches/${branchId}/transfers/${transferId}/receive`,
    { method: "POST", headers: authJson(token) },
  );
  if (!response.ok)
    throw await responseError(response, "No se pudo recibir la transferencia.");
}

export type ReportSummary = {
  salesTrend?: { date: string; totalMinor: string; count: number }[];
  salesTodayCount: number;
  salesTodayMinor: string;
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
