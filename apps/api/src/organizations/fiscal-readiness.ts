import { readFiscalProfile, validateFiscalDraft } from "./fiscal-profile";

export function fiscalReadiness(profileValue: unknown, activePoints: number) {
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
  return {
    environment: "HOMOLOGATION" as const,
    issuanceEnabled: false as const,
    checks: [
      {
        code: "PROFILE",
        ready: missing.length === 0,
        label: "Datos del emisor",
        detail: missing.length
          ? `Falta completar: ${missing.join(", ")}.`
          : "Datos básicos completos; resta validación fiscal y con ARCA.",
      },
      {
        code: "POINT",
        ready: activePoints > 0,
        label: "Punto de venta de prueba",
        detail: activePoints
          ? "Configurado localmente. Su habilitación en ARCA todavía no está verificada."
          : "Pendiente para después de conectar con ARCA. No hace falta ingresar un número ahora.",
      },
      {
        code: "AUTH",
        ready: false,
        label: "Autenticación con ARCA",
        detail:
          "Pendiente: conector WSAA y certificado de homologación autorizado para el servicio fiscal.",
      },
      {
        code: "ISSUANCE",
        ready: false,
        label: "Emisión y conciliación",
        detail:
          "Pendiente: impuestos, autorización, registro fiscal, reintentos seguros e impresión fiscal.",
      },
    ],
  };
}
