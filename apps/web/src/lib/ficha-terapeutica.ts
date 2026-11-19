import { apiFetch as fetch } from "./api-fetch";
import { apiBaseUrl } from "./api";

// Ficha del padrón oficial consultada en vivo (SISTEMA-108).
export type FichaTerapeutica = {
  nombre: string;
  presentacion: string;
  laboratorio: string;
  accionTerapeutica: string;
  via: string;
  principioActivo: string;
  formaFarmaceutica: string;
  condicionVenta: string;
  coincidencia: "codigo" | "nombre";
};

// Guía guardada por principio activo: acción y vía del padrón; uso y dosis
// orientativos generados con IA (`dosageSource: "ia"`).
export type GuiaPrincipioActivo = {
  activeIngredient: string;
  therapeuticAction: string;
  route: string;
  usage: string;
  dosage: string;
  dosageSource: string;
  /** Dosis o concentración de esta presentación ("50 mg/ml"), si se conoce. */
  presentationDose?: string;
  /** La dosis guardada es de otra forma (gel, ampolla…): ver el prospecto. */
  dosageOtherForm?: boolean;
  /** Dosis infantil por kilo de jarabes, gotas y suspensiones. */
  pediatric?: DosisPediatrica | null;
};

// Igual que en la API (apps/api/src/catalog/dosis-pediatricas.ts).
export type DosisPediatrica = {
  mgKgToma?: [number, number];
  mgKgDia?: [number, number];
  tomasPorDia: number;
  cadaHoras: string;
  maxMgToma?: number;
  maxMgDia?: number;
  maxMgKgDia?: number;
  desde: string;
  nota?: string;
};

export type RespuestaFicha = {
  guia: GuiaPrincipioActivo | null;
  ficha: FichaTerapeutica | null;
};

// Lo que muestra la tarjeta, venga de la guía, del padrón en vivo o de ambos.
export type ResumenFicha = {
  paraQueSirve: string;
  accionTerapeutica: string;
  dosis: string;
  dosisGeneradaConIa: boolean;
  via: string;
  condicionVenta: string;
  principioActivo: string;
  /** Dosis o concentración de la presentación según la base ("50 mg/ml"). */
  dosisPresentacion: string;
  /** No hay dosis para esta forma: se remite al prospecto. */
  dosisDeOtraForma: boolean;
  pediatrica: DosisPediatrica | null;
};

export function resumenFicha(respuesta: RespuestaFicha): ResumenFicha | null {
  const { guia, ficha } = respuesta;
  const accion = ficha?.accionTerapeutica || guia?.therapeuticAction || "";
  const uso = guia?.usage ?? "";
  if (!accion && !uso) return null;
  return {
    paraQueSirve: uso || accion,
    // Solo se muestra aparte cuando agrega algo al uso.
    accionTerapeutica: uso ? accion : "",
    dosis: guia?.dosage ?? "",
    dosisGeneradaConIa: guia?.dosageSource === "ia",
    via: ficha?.via || guia?.route || "",
    condicionVenta: ficha?.condicionVenta ?? "",
    principioActivo: ficha?.principioActivo || guia?.activeIngredient || "",
    dosisPresentacion: guia?.presentationDose ?? "",
    dosisDeOtraForma: guia?.dosageOtherForm ?? false,
    pediatrica: guia?.pediatric ?? null,
  };
}

// Solo códigos numéricos que el backend acepta, sin repetir y hasta 20.
export function codigosParaFicha(codigos: string[]): string[] {
  return [
    ...new Set(
      codigos
        .map((code) => code.trim())
        .filter((code) => /^\d{8,14}$/.test(code)),
    ),
  ].slice(0, 20);
}

// Búsqueda web del prospecto: el padrón no publica un link al documento.
export function linkBusquedaProspecto(
  nombre: string,
  laboratorio?: string,
): string {
  const consulta = ["prospecto", nombre, laboratorio]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(" ");
  return `https://www.google.com/search?${new URLSearchParams({ q: consulta }).toString()}`;
}

export async function getFichaTerapeutica(
  token: string,
  organizationId: string,
  datos: {
    nombre: string;
    codigos: string[];
    principioActivo?: string;
    // La dosis que devuelve es la de esta forma.
    forma?: string | null;
    presentacion?: string | null;
  },
  signal?: AbortSignal,
): Promise<RespuestaFicha> {
  const search = new URLSearchParams({ q: datos.nombre.trim().slice(0, 120) });
  const validos = codigosParaFicha(datos.codigos);
  if (validos.length) search.set("codigos", validos.join(","));
  const principioActivo = datos.principioActivo?.trim().slice(0, 200);
  if (principioActivo) search.set("principioActivo", principioActivo);
  const forma = datos.forma?.trim().slice(0, 120);
  if (forma) search.set("forma", forma);
  const presentacion = datos.presentacion?.trim().slice(0, 120);
  if (presentacion) search.set("presentacion", presentacion);
  const response = await fetch(
    `${apiBaseUrl}/organizations/${organizationId}/catalog/medicine-references/ficha?${search.toString()}`,
    { headers: { Authorization: `Bearer ${token}` }, signal },
  );
  if (!response.ok)
    throw new Error("No se pudo consultar la ficha. Probá de nuevo.");
  return (await response.json()) as RespuestaFicha;
}

// Presentación pensada para chicos o líquida (jarabe, gotas, suspensión): la
// dosis habitual de la ficha es de adultos y en niños va según el peso.
export function esPresentacionPediatrica(
  nombre: string,
  presentacion?: string | null,
): boolean {
  const texto = `${nombre} ${presentacion ?? ""}`
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("es-AR");
  return /\b(ped|pediatric[oa]|infantil|ninos|kids|bebe|junior)\b|\b(susp|jbe|jarabe|gts|gotas|got)\b/.test(
    texto,
  );
}

const A_MG: Record<string, number> = { g: 1000, mg: 1, mcg: 0.001 };
const numero = (texto: string) => Number(texto.replace(",", "."));

// Líquidos orales que se toman por ml: jarabe, gotas, suspensión, solución.
export function esLiquidoOral(presentacion?: string | null): boolean {
  const texto = (presentacion ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("es-AR");
  return /\b(jbe|jarabe|gts|gotas|susp|suspension|sol\.? ?oral|elixir)\b/.test(
    texto,
  );
}

// Concentración en mg por ml: "50 mg/ml", "250 mg/5 ml", "5 g/100 ml", "2%".
export function mgPorMl(texto?: string | null): number | null {
  const limpio = (texto ?? "").toLocaleLowerCase("es-AR").replace(/\s+/g, " ");
  // Dos drogas ("400/57 mg/5 ml"): no se sabe a cuál se refiere la dosis.
  if (/\d ?\/ ?\d+(?:[.,]\d+)? ?(mcg|mg|g)\b/.test(limpio)) return null;
  const porVolumen =
    /(\d+(?:[.,]\d+)?) ?(mcg|mg|g) ?\/ ?(\d+(?:[.,]\d+)?)? ?ml\b/.exec(limpio);
  if (porVolumen) {
    const [, cantidad = "", unidad = "", volumen = "1"] = porVolumen;
    const valor = (numero(cantidad) * (A_MG[unidad] ?? 0)) / numero(volumen);
    return Number.isFinite(valor) && valor > 0 ? valor : null;
  }
  const porcentaje = /(\d+(?:[.,]\d+)?) ?%/.exec(limpio);
  return porcentaje ? numero(porcentaje[1] ?? "") * 10 || null : null;
}

const formatoMl = (valor: number) =>
  new Intl.NumberFormat("es-AR", { maximumFractionDigits: 1 }).format(
    Math.round(valor * 10) / 10,
  );

// La toma de adultos pasada a ml: "500 mg-1 g cada 6-8 h" con 50 mg/ml →
// "10-20 ml". Solo si la dosis empieza con una cantidad en peso (no por kg
// ni por zonas) y la cuenta da un número razonable.
export function tomaEnMl(dosis: string, concentracion: number): string | null {
  const inicio =
    /^(\d+(?:[.,]\d+)?) ?(mcg|mg|g)?(?: ?(?:-|a) ?(\d+(?:[.,]\d+)?) ?(mcg|mg|g))?(?![\w/])/i.exec(
      dosis.trim(),
    );
  if (!inicio || !concentracion) return null;
  const [, desde = "", unidadDesde, hasta, unidadHasta] = inicio;
  const unidadFinal = (unidadHasta ?? unidadDesde ?? "").toLowerCase();
  if (!unidadFinal || /kg/i.test(dosis.slice(0, 40))) return null;
  const minimo =
    (numero(desde) * (A_MG[(unidadDesde ?? unidadFinal).toLowerCase()] ?? 0)) /
    concentracion;
  const maximo = hasta
    ? (numero(hasta) * (A_MG[unidadFinal] ?? 0)) / concentracion
    : null;
  if (!(minimo > 0) || minimo > 200 || (maximo !== null && maximo > 200))
    return null;
  return maximo === null
    ? `${formatoMl(minimo)} ml`
    : `${formatoMl(minimo)}-${formatoMl(maximo)} ml`;
}
