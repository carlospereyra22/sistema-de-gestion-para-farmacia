// Fechas del selector de fecha del sistema (SISTEMA-110). Trabaja con el texto
// "AAAA-MM-DD" de siempre (el mismo valor que daba <input type="date">) y sin
// zonas horarias: una fecha es un día del calendario, no un instante.

export type Dia = { anio: number; mes: number; dia: number };

const dosDigitos = (numero: number) => String(numero).padStart(2, "0");

export function aTexto({ anio, mes, dia }: Dia): string {
  return `${anio}-${dosDigitos(mes)}-${dosDigitos(dia)}`;
}

export function desdeTexto(texto: string | undefined | null): Dia | null {
  const partes = /^(\d{4})-(\d{2})-(\d{2})$/.exec(texto ?? "");
  if (!partes) return null;
  const dia = {
    anio: Number(partes[1]),
    mes: Number(partes[2]),
    dia: Number(partes[3]),
  };
  // "2026-02-31" no existe: se descarta en vez de pasar a marzo.
  const fecha = new Date(Date.UTC(dia.anio, dia.mes - 1, dia.dia));
  return fecha.getUTCMonth() === dia.mes - 1 ? dia : null;
}

export function hoy(ahora = new Date()): Dia {
  return {
    anio: ahora.getFullYear(),
    mes: ahora.getMonth() + 1,
    dia: ahora.getDate(),
  };
}

export function sumarDias(base: Dia, dias: number): Dia {
  const fecha = new Date(Date.UTC(base.anio, base.mes - 1, base.dia + dias));
  return {
    anio: fecha.getUTCFullYear(),
    mes: fecha.getUTCMonth() + 1,
    dia: fecha.getUTCDate(),
  };
}

/** El mismo día en otro mes; si no existe (31 de febrero), el último. */
export function sumarMeses(base: Dia, meses: number): Dia {
  const primero = new Date(Date.UTC(base.anio, base.mes - 1 + meses, 1));
  const anio = primero.getUTCFullYear();
  const mes = primero.getUTCMonth() + 1;
  const ultimo = new Date(Date.UTC(anio, mes, 0)).getUTCDate();
  return { anio, mes, dia: Math.min(base.dia, ultimo) };
}

/** 0 = lunes … 6 = domingo. */
export function diaDeLaSemana({ anio, mes, dia }: Dia): number {
  return (new Date(Date.UTC(anio, mes - 1, dia)).getUTCDay() + 6) % 7;
}

export function comparar(a: Dia, b: Dia): number {
  return aTexto(a).localeCompare(aTexto(b));
}

/** 25/12/2026 */
export function formatoCorto(dia: Dia): string {
  return `${dosDigitos(dia.dia)}/${dosDigitos(dia.mes)}/${dia.anio}`;
}

const MESES = [
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
  "Diciembre",
];

export function nombreDelMes(anio: number, mes: number): string {
  return `${MESES[mes - 1] ?? ""} ${anio}`;
}

/** "jueves 19 de noviembre de 2026", para lectores de pantalla. */
export function formatoLargo(dia: Dia): string {
  return new Date(Date.UTC(dia.anio, dia.mes - 1, dia.dia)).toLocaleDateString(
    "es-AR",
    {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    },
  );
}

/**
 * Las 6 semanas que se ven de un mes, empezando el lunes (como se usa en
 * Argentina). Incluye días del mes anterior y del siguiente para completar.
 */
export function semanasDelMes(anio: number, mes: number): Dia[][] {
  const primero = new Date(Date.UTC(anio, mes - 1, 1));
  // getUTCDay: 0 domingo … 6 sábado. Lunes = 0 en esta grilla.
  const corrimiento = (primero.getUTCDay() + 6) % 7;
  const inicio = sumarDias({ anio, mes, dia: 1 }, -corrimiento);
  return Array.from({ length: 6 }, (_, semana) =>
    Array.from({ length: 7 }, (_, dia) => sumarDias(inicio, semana * 7 + dia)),
  );
}
