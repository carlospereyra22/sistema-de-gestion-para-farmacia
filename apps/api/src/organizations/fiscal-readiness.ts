import { readFiscalProfile, validateFiscalDraft } from "./fiscal-profile";

/** Lo que el servidor sabe de cada paso fuera del perfil (SISTEMA-95). */
export type FiscalReadinessExtra = {
  /** Certificado de prueba conectado con ARCA, vigente y del CUIT emisor. */
  connectedAt?: Date | null;
  /** Última factura de prueba (homologación) y si alguna fue autorizada. */
  trial?: {
    authorized: boolean;
    last: { status: string; point: number; number: number | null } | null;
  };
  /** Sucursales que ya facturan en real. */
  productionBranches?: number;
};

const fecha = (value: Date) =>
  value.toLocaleDateString("es-AR", {
    timeZone: "America/Argentina/Buenos_Aires",
  });

/**
 * Estado de cada paso para dejar lista la facturación (SISTEMA-95). Sólo
 * informa: no habilita la emisión. Textos sin jerga técnica.
 */
export function fiscalReadiness(
  profileValue: unknown,
  activePoints: number,
  extra: FiscalReadinessExtra = {},
) {
  const profile = readFiscalProfile(profileValue);
  const missing = [
    ["legalName", "Razón social"],
    ["cuit", "CUIT"],
    ["vatCondition", "Condición frente al IVA"],
    ["address", "Domicilio fiscal"],
    ["city", "Localidad"],
    ["province", "Provincia"],
    ["activityStart", "Inicio de actividades"],
  ]
    .filter(([key]) => !profile[key as keyof typeof profile])
    .map(([, label]) => label);
  if (
    profile.vatCondition &&
    !["MONOTAX", "REGISTERED", "EXEMPT"].includes(profile.vatCondition)
  )
    missing.push("Condición fiscal válida");
  try {
    validateFiscalDraft(profile);
  } catch {
    missing.push("Revisar CUIT o fecha de inicio");
  }
  const trial = extra.trial;
  const last = trial?.last;
  const numero = (point: number, number: number | null) =>
    `${String(point).padStart(4, "0")}-${String(number ?? 0).padStart(8, "0")}`;
  return {
    environment: "HOMOLOGATION" as const,
    issuanceEnabled: false as const,
    checks: [
      {
        code: "PROFILE",
        ready: missing.length === 0,
        label: "Datos de la farmacia",
        detail: missing.length
          ? `Falta completar: ${missing.join(", ")}.`
          : "Datos completos. Confirmalos con tu contador antes de facturar en real.",
      },
      {
        code: "AUTH",
        ready: !!extra.connectedAt,
        label: "Conexión con ARCA",
        detail: extra.connectedAt
          ? `Conectada con ARCA el ${fecha(extra.connectedAt)}.`
          : "Falta cargar el certificado de ARCA y probar la conexión.",
      },
      {
        code: "POINT",
        ready: activePoints > 0,
        label: "Punto de venta",
        detail: activePoints
          ? "Hay sucursales con punto de venta asignado."
          : "Falta asignarle un punto de venta a tus sucursales.",
      },
      {
        code: "TRIAL",
        ready: !!trial?.authorized,
        label: "Factura de prueba",
        detail: trial?.authorized
          ? "ARCA autorizó una factura de prueba."
          : last && ["PENDING", "UNCERTAIN", "QUEUED"].includes(last.status)
            ? `La factura de prueba ${numero(last.point, last.number)} espera respuesta de ARCA: consultá el resultado.`
            : last?.status === "REJECTED"
              ? "ARCA rechazó la última factura de prueba. Revisá el motivo y probá de nuevo."
              : "Todavía no hiciste la factura de prueba.",
      },
      {
        code: "PRODUCTION",
        ready: (extra.productionBranches ?? 0) > 0,
        label: "Facturación real",
        detail: extra.productionBranches
          ? `${extra.productionBranches === 1 ? "1 sucursal factura" : `${extra.productionBranches} sucursales facturan`} en real.`
          : "Todavía no se activó la facturación real.",
      },
    ],
  };
}
