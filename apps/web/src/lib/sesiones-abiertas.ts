import type { SesionAbierta } from "./api";

/**
 * Cómo se muestra cada sesión en "Sesiones abiertas" (SISTEMA-93). Sólo
 * presentación: qué sesiones hay y quién puede cerrarlas lo decide la API.
 */
export type SesionParaMostrar = {
  id: string;
  titulo: string;
  /** Es esta PC (la pestaña actual o el mismo id de PC). */
  estaPc: boolean;
  /** Es la sesión de esta pestaña: no se cierra desde la lista. */
  actual: boolean;
  detalle: string;
};

/** "hace 5 minutos", "hace 3 horas", "hace 2 días". */
export function haceCuanto(fecha: string, ahora: number): string {
  const minutos = Math.max(0, Math.round((ahora - Date.parse(fecha)) / 60_000));
  if (minutos < 1) return "recién";
  if (minutos < 60)
    return `hace ${minutos} ${minutos === 1 ? "minuto" : "minutos"}`;
  const horas = Math.round(minutos / 60);
  if (horas < 24) return `hace ${horas} ${horas === 1 ? "hora" : "horas"}`;
  const dias = Math.round(horas / 24);
  return `hace ${dias} ${dias === 1 ? "día" : "días"}`;
}

export function sesionesParaMostrar(
  sesiones: readonly SesionAbierta[],
  idDeEstaPc: string | undefined,
  ahora: number,
): SesionParaMostrar[] {
  return sesiones.map((sesion) => {
    const estaPc =
      sesion.actual || (!!idDeEstaPc && sesion.deviceId === idDeEstaPc);
    return {
      id: sesion.id,
      titulo: sesion.navegador ?? "Navegador desconocido",
      estaPc,
      actual: sesion.actual,
      detalle: [
        `Último uso ${haceCuanto(sesion.ultimoUso, ahora)}`,
        sesion.ip ? `IP ${sesion.ip}` : undefined,
        `desde ${new Date(sesion.iniciada).toLocaleDateString("es-AR")}`,
      ]
        .filter(Boolean)
        .join(" · "),
    };
  });
}
