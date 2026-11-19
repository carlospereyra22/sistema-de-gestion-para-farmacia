import { apiFetch as fetch } from "./api-fetch";
import { apiBaseUrl } from "./api";

// Equivalentes de un medicamento (SISTEMA-108). El backend arma los grupos;
// acá solo se consulta, se guarda un rato y se formatea.

export type Alternativa = {
  itemId: string;
  nombre: string;
  presentacion: string;
  laboratorio: string;
  forma: string;
  concentracion: string;
  // false: hay algo que confirmar antes de cambiar (ver `aviso`).
  dosisConfirmada: boolean;
  aviso: string | null;
  unidades: number | null;
  precioMinor: string;
  precioPorUnidadMinor: string | null;
  producto: {
    id: string;
    nombre: string;
    precioMinor: string | null;
    stock: number;
  } | null;
};

export type Equivalentes = {
  principioActivo: string;
  // Fórmula "+asoc." o multivitamínico: solo productos relacionados.
  composicionAbierta: boolean;
  equivalentes: Alternativa[];
  mismaDroga: Alternativa[];
};

export type ConsultaEquivalentes = {
  codigos?: string[];
  principioActivo?: string | null;
  forma?: string | null;
  concentracion?: string | null;
  nombre?: string | null;
  presentacion?: string | null;
};

export function parametrosEquivalentes(
  consulta: ConsultaEquivalentes,
): URLSearchParams {
  const search = new URLSearchParams();
  const codigos = [
    ...new Set(
      (consulta.codigos ?? [])
        .map((code) => code.trim())
        .filter((code) => /^\d{8,14}$/.test(code)),
    ),
  ].slice(0, 20);
  if (codigos.length) search.set("codigos", codigos.join(","));
  const textos = [
    ["principioActivo", consulta.principioActivo, 200],
    ["forma", consulta.forma, 120],
    ["concentracion", consulta.concentracion, 60],
    ["nombre", consulta.nombre, 200],
    ["presentacion", consulta.presentacion, 200],
  ] as const;
  for (const [clave, valor, maximo] of textos) {
    const texto = valor?.trim().slice(0, maximo);
    if (texto) search.set(clave, texto);
  }
  return search;
}

// Precio que ve la farmacia: el suyo si lo tiene cargado; si no, el de
// referencia.
export function precioAlternativa(alternativa: Alternativa): string {
  return alternativa.producto?.precioMinor ?? alternativa.precioMinor;
}

// La más barata por unidad entre las que se pueden contar.
export function mejorPorUnidad(lista: Alternativa[]): string | undefined {
  let mejor: Alternativa | undefined;
  for (const fila of lista)
    if (
      fila.precioPorUnidadMinor &&
      (!mejor ||
        BigInt(fila.precioPorUnidadMinor) <
          BigInt(mejor.precioPorUnidadMinor ?? "0"))
    )
      mejor = fila;
  return mejor?.itemId;
}

const cache = new Map<
  string,
  { expira: number; valor: Promise<Equivalentes> }
>();
const VIGENCIA_MS = 5 * 60_000;

export function getEquivalentes(
  token: string,
  organizationId: string,
  branchId: string,
  consulta: ConsultaEquivalentes,
): Promise<Equivalentes> {
  const search = parametrosEquivalentes(consulta);
  const url = `${apiBaseUrl}/organizations/${organizationId}/branches/${branchId}/catalog/equivalentes?${search.toString()}`;
  const guardado = cache.get(url);
  if (guardado && guardado.expira > Date.now()) return guardado.valor;
  const valor = fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  }).then(async (response) => {
    if (!response.ok)
      throw new Error("No se pudieron consultar los equivalentes.");
    return (await response.json()) as Equivalentes;
  });
  cache.set(url, { expira: Date.now() + VIGENCIA_MS, valor });
  valor.catch(() => cache.delete(url));
  return valor;
}

// Consulta desde un producto de la farmacia: sus códigos, su principio activo
// y, si no tiene código en la base, su nombre.
export function consultaEquivalentes(producto: {
  name: string;
  presentation?: string | null;
  activeIngredient?: string | null;
  pharmaceuticalForm?: string | null;
  concentration?: string | null;
  barcodes: { code: string }[];
}): ConsultaEquivalentes {
  return {
    codigos: producto.barcodes.map((barcode) => barcode.code),
    principioActivo: producto.activeIngredient,
    forma: producto.pharmaceuticalForm,
    concentracion: producto.concentration,
    nombre: producto.name,
    presentacion: producto.presentation,
  };
}

// Unidades contables del envase, igual que en el backend: "comp.x 20" → 20,
// "sob.x 15 x 2" → 30; volúmenes y pesos no se cuentan.
export function unidadesDe(
  presentacion: string | null | undefined,
): number | null {
  const texto = (presentacion ?? "").toLocaleLowerCase("es-AR");
  const partes = [
    ...texto.matchAll(
      /x\s*(\d+(?:[.,]\d+)?)(\s*(?:ml|l|g|mg|mcg|kg|cc|ds|dosis)(?![a-z]))?/g,
    ),
  ];
  // Los volúmenes de cada unidad no cuentan ("a.x 25 x 2 ml" → 25
  // ampollas); si solo hay volumen ("jbe.x 120 ml"), no se cuenta.
  const cantidades = partes.filter(([, , volumen]) => !volumen);
  if (!cantidades.length) return null;
  let total = 1;
  for (const [, numero] of cantidades) {
    const valor = Number((numero ?? "").replace(",", "."));
    if (!Number.isInteger(valor) || valor <= 0) return null;
    total *= valor;
  }
  return total > 0 && total < 10_000 ? total : null;
}

export function precioPorUnidad(
  precioMinor: string | undefined,
  presentacion: string | null | undefined,
): string | null {
  const unidades = unidadesDe(presentacion);
  if (!precioMinor || !unidades) return null;
  return String(Math.round(Number(precioMinor) / unidades));
}

// Diferencia por unidad contra el producto elegido, en porcentaje entero
// (negativo = más barato). Sin datos comparables, null.
export function diferenciaPorUnidad(
  alternativa: Alternativa,
  referenciaPorUnidadMinor: string | null | undefined,
): number | null {
  const propio = alternativa.producto?.precioMinor;
  const porUnidad =
    propio && alternativa.unidades
      ? Math.round(Number(propio) / alternativa.unidades)
      : alternativa.precioPorUnidadMinor
        ? Number(alternativa.precioPorUnidadMinor)
        : null;
  const referencia = Number(referenciaPorUnidadMinor ?? 0);
  if (porUnidad === null || !referencia) return null;
  return Math.round(((porUnidad - referencia) / referencia) * 100);
}
