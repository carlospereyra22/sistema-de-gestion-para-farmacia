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

/** Lista de farmacias, por nombre. */
export function filtrarFarmacias<T extends { name: string }>(
  farmacias: readonly T[],
  texto: string,
) {
  const buscado = texto.trim().toLocaleLowerCase("es-AR");
  return farmacias.filter((f) =>
    f.name.toLocaleLowerCase("es-AR").includes(buscado),
  );
}
