import { createContext } from "react";
import type { PlatformOrganizationDetail } from "./platform-api";

/** Usuario de una farmacia, como lo lista el panel. */
export type UsuarioDeFarmacia = PlatformOrganizationDetail["users"][number];

/** Entrar como un usuario de una farmacia (SISTEMA-89). */
export type EntrarComo = (
  organizationId: string,
  organizationName: string,
  usuario: Pick<UsuarioDeFarmacia, "id" | "email" | "displayName">,
) => Promise<void>;

export const SoporteContext = createContext<EntrarComo | undefined>(undefined);

type FarmaciaConSucursales = {
  id: string;
  name: string;
  branches?: { id: string; name: string }[];
};

/** Primer buscador de Soporte: las farmacias, por nombre. */
export function opcionesDeFarmacias(
  farmacias: readonly FarmaciaConSucursales[],
) {
  return farmacias
    .map((farmacia) => ({ value: farmacia.id, label: farmacia.name }))
    .sort((a, b) => a.label.localeCompare(b.label, "es-AR"));
}

/** Segundo buscador: las sucursales de la farmacia elegida, o todas. */
export function opcionesDeSucursales(farmacia?: FarmaciaConSucursales) {
  return [
    { value: "", label: "Todas las sucursales" },
    ...(farmacia?.branches ?? []).map((sucursal) => ({
      value: sucursal.id,
      label: sucursal.name,
    })),
  ];
}

/** Valor guardado de la elección: `farmacia` o `farmacia|sucursal`. */
export function valorDeSoporte(organizationId: string, branchId?: string) {
  return branchId ? `${organizationId}|${branchId}` : organizationId;
}

/** Farmacia y sucursal (si se eligió una) del valor del selector. */
export function eleccionDeSoporte(valor: string) {
  const [organizationId, branchId] = valor.split("|");
  return { organizationId: organizationId ?? "", branchId };
}

/** Dos letras para el avatar de un usuario: "Ana Pérez" → "AP", "ana@x.com" → "AN". */
export function iniciales(nombre: string): string {
  const base = nombre.split("@")[0] ?? "";
  // Sólo letras y números: "Cajero A (mostrador)" → "CM", no "C(".
  const palabras = base.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  const letras =
    palabras.length > 1
      ? `${palabras[0]?.[0] ?? ""}${palabras.at(-1)?.[0] ?? ""}`
      : (palabras[0] ?? "").slice(0, 2);
  return letras.toLocaleUpperCase("es-AR") || "?";
}
