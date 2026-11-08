export type AvisoConexion = {
  etiqueta: string;
  texto: string;
};

const hora = (valor: number) =>
  new Intl.DateTimeFormat("es-AR", {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: "America/Argentina/Buenos_Aires",
  }).format(valor);

/**
 * Qué mostrar en el encabezado según la conexión. `null` cuando todo está
 * normal. `sinSesion` es abrir sin conexión (todavía sin token del servidor).
 */
export function avisoConexion(estado: {
  enLinea: boolean;
  sinSesion: boolean;
  ultimaSincronizacion?: number;
}): AvisoConexion | null {
  if (estado.enLinea && !estado.sinSesion) return null;
  if (estado.enLinea)
    return {
      etiqueta: "Reconectando…",
      texto:
        "El servidor volvió a responder. Se está recuperando la sesión y actualizando los datos.",
    };
  const datos = estado.ultimaSincronizacion
    ? `Se muestran los datos guardados a las ${hora(estado.ultimaSincronizacion)}.`
    : "Se muestran los últimos datos guardados en esta PC.";
  return {
    etiqueta: estado.ultimaSincronizacion
      ? `Sin conexión · datos de las ${hora(estado.ultimaSincronizacion)}`
      : "Sin conexión",
    texto: `No hay conexión con el servidor. ${datos} Podés consultar productos, stock y precios; vender, cobrar y guardar cambios necesitan internet. Se actualiza solo cuando vuelva.`,
  };
}
