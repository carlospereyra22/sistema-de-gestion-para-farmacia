import { apiBaseUrl } from "./api";

// Comprobante A4 y formato de impresión (SISTEMA-17). Aparte de api.ts para no
// tocar el archivo compartido más de lo necesario.
export type PrintFormat = "TICKET" | "A4";
export type DocumentTemplateSettings = {
  accentColor: string;
  footerText: string;
  defaultFormat: PrintFormat;
  // Con branchId: formato propio de la sucursal (null = el de la organización)
  // y el que se usa al vender.
  branchFormat: PrintFormat | null;
  effectiveFormat: PrintFormat;
  logo: string | null;
  logoUpdatedAt: string | null;
};
export type BranchPrintFormat = {
  id: string;
  name: string;
  active: boolean;
  printFormat: PrintFormat | null;
};

async function request<T>(
  token: string,
  organizationId: string,
  path: string,
  method: "GET" | "PATCH" | "DELETE",
  fallback: string,
  data?: unknown,
): Promise<T> {
  const response = await fetch(
    `${apiBaseUrl}/organizations/${organizationId}/${path}`,
    {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      ...(data === undefined ? {} : { body: JSON.stringify(data) }),
    },
  );
  const result = (await response.json()) as T & {
    message?: string | string[];
  };
  if (!response.ok)
    throw new Error(
      Array.isArray(result.message)
        ? result.message.join(", ")
        : (result.message ?? fallback),
    );
  return result;
}

export const getDocumentTemplate = (
  token: string,
  organizationId: string,
  branchId?: string,
) =>
  request<DocumentTemplateSettings>(
    token,
    organizationId,
    `document-template${branchId ? `?branchId=${encodeURIComponent(branchId)}` : ""}`,
    "GET",
    "No se pudo cargar la plantilla A4.",
  );

export const saveDocumentTemplate = (
  token: string,
  organizationId: string,
  // Parcial: cada pantalla envía sólo lo que edita; la API conserva el resto.
  data: Partial<{
    accentColor: string;
    footerText: string;
    defaultFormat: PrintFormat;
  }>,
) =>
  request<{
    accentColor: string;
    footerText: string;
    defaultFormat: PrintFormat;
  }>(
    token,
    organizationId,
    "document-template",
    "PATCH",
    "No se pudo guardar la plantilla A4.",
    data,
  );

export const saveDocumentLogo = (
  token: string,
  organizationId: string,
  dataUrl: string | null,
) =>
  request<{ logoUpdatedAt: string | null }>(
    token,
    organizationId,
    "document-logo",
    dataUrl === null ? "DELETE" : "PATCH",
    "No se pudo guardar el logo del comprobante.",
    dataUrl === null ? undefined : { dataUrl },
  );

export const getBranchPrintFormats = (token: string, organizationId: string) =>
  request<BranchPrintFormat[]>(
    token,
    organizationId,
    "branches",
    "GET",
    "No se pudieron cargar las sucursales.",
  );

export const saveBranchPrintFormat = (
  token: string,
  organizationId: string,
  branchId: string,
  printFormat: PrintFormat | null,
) =>
  request<{ branchId: string; printFormat: PrintFormat | null }>(
    token,
    organizationId,
    `branches/${encodeURIComponent(branchId)}/print-format`,
    "PATCH",
    "No se pudo guardar el formato de la sucursal.",
    { printFormat },
  );
