import type { DosisOrientativa } from "./guias-dosis.data";

// Guía por principio activo (SISTEMA-108). Reglas puras: ver docs/PRODUCTS.md.

export type GuiaPrincipioActivo = {
  activeKey: string;
  activeIngredient: string;
  therapeuticAction: string;
  route: string;
  usage: string;
  dosage: string;
  dosageSource: string;
};

// 'Losartán ' y 'losartan' son el mismo principio activo.
export function claveGuia(principioActivo: string): string {
  return String(principioActivo ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLocaleLowerCase("es-AR")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 200);
}

function texto(value: unknown): string {
  return String(value ?? "").trim();
}

function masFrecuente(valores: Map<string, number>): string {
  let elegido = "";
  let veces = 0;
  for (const [valor, cantidad] of valores)
    if (cantidad > veces) [elegido, veces] = [valor, cantidad];
  return elegido;
}

// Una guía por principio activo del padrón, con la acción y la vía más
// frecuentes entre sus presentaciones vigentes. Las dadas de baja solo cuentan
// si no hay ninguna vigente. Suma uso y dosis del archivo orientativo.
export function guiasDesdePadron(
  payload: unknown[],
  dosis: Record<string, DosisOrientativa>,
): GuiaPrincipioActivo[] {
  const dosisPorClave = new Map(
    Object.entries(dosis).map(([droga, valor]) => [claveGuia(droga), valor]),
  );
  const grupos = new Map<
    string,
    {
      nombre: string;
      vigentes: boolean;
      acciones: Map<string, number>;
      vias: Map<string, number>;
    }
  >();
  for (const value of payload) {
    if (!value || typeof value !== "object") continue;
    const fila = value as Record<string, unknown>;
    const nombre = texto(fila.DROGA);
    const clave = claveGuia(nombre);
    if (!clave) continue;
    const vigente = String(fila.BAJA) !== "1";
    let grupo = grupos.get(clave);
    if (!grupo || (vigente && !grupo.vigentes)) {
      grupo = {
        nombre,
        vigentes: vigente,
        acciones: new Map(),
        vias: new Map(),
      };
      grupos.set(clave, grupo);
    } else if (!vigente && grupo.vigentes) continue;
    for (const [mapa, dato] of [
      [grupo.acciones, texto(fila.ACCION)],
      [grupo.vias, texto(fila.VIA)],
    ] as const)
      if (dato) mapa.set(dato, (mapa.get(dato) ?? 0) + 1);
  }
  return [...grupos].map(([clave, grupo]) => {
    const orientativa = dosisPorClave.get(clave);
    return {
      activeKey: clave,
      activeIngredient: grupo.nombre,
      therapeuticAction: masFrecuente(grupo.acciones),
      route: masFrecuente(grupo.vias),
      usage: orientativa?.uso ?? "",
      dosage: orientativa?.dosis ?? "",
      dosageSource: orientativa ? "ia" : "",
    };
  });
}

export type VinculosPadron = {
  // `externalKey` de la base (`ab-<CLAVE>`) → principio activo y acción
  // terapéutica de esa presentación.
  porClave: {
    externalKey: string;
    activeKey: string;
    therapeuticAction: string;
  }[];
  // Código sin ceros a la izquierda → principio activo, solo si no es ambiguo.
  porCodigo: { codigo: string; activeKey: string }[];
};

// Qué principio activo del padrón corresponde a cada medicamento de la base:
// por CLAVE o, para lo que viene de otra fuente, por código de barras.
export function vinculosPadron(payload: unknown[]): VinculosPadron {
  const porClave = new Map<
    string,
    { activeKey: string; therapeuticAction: string }
  >();
  const porCodigo = new Map<string, string | null>();
  for (const value of payload) {
    if (!value || typeof value !== "object") continue;
    const fila = value as Record<string, unknown>;
    const activeKey = claveGuia(texto(fila.DROGA));
    if (!activeKey) continue;
    const clave = texto(fila.CLAVE);
    if (clave)
      porClave.set(`ab-${clave}`, {
        activeKey,
        therapeuticAction: texto(fila.ACCION),
      });
    for (const codigo of [fila.C_BARRA, fila.GTIN1]
      .map((code) => texto(code).replace(/^0+/, ""))
      .filter(Boolean)) {
      const previo = porCodigo.get(codigo);
      // Un código con dos principios activos distintos no se usa.
      porCodigo.set(
        codigo,
        previo === undefined || previo === activeKey ? activeKey : null,
      );
    }
  }
  return {
    porClave: [...porClave].map(([externalKey, vinculo]) => ({
      externalKey,
      ...vinculo,
    })),
    porCodigo: [...porCodigo].flatMap(([codigo, activeKey]) =>
      activeKey ? [{ codigo, activeKey }] : [],
    ),
  };
}
