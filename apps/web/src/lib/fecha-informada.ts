/**
 * Fecha informada por la fuente. La base de la PC la trae como instante ISO:
 * se muestra como fecha de Argentina (SISTEMA-86).
 */
export function fechaInformada(valor: string | null) {
  if (!valor) return "no disponible";
  if (!/^\d{4}-\d{2}-\d{2}T/.test(valor)) return valor;
  const fecha = new Date(valor);
  return Number.isNaN(fecha.getTime())
    ? valor
    : fecha.toLocaleDateString("es-AR", {
        timeZone: "America/Argentina/Buenos_Aires",
      });
}
