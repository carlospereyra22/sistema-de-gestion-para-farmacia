import { canonicalGtin } from "./external-gtin";

// Ficha terapéutica de un medicamento (SISTEMA-108): datos públicos del padrón
// oficial que sirven de orientación en el mostrador. No reemplaza al prospecto
// ni indica dosis: el padrón no publica posología.
export type FichaTerapeutica = {
  nombre: string;
  presentacion: string;
  laboratorio: string;
  accionTerapeutica: string;
  via: string;
  principioActivo: string;
  formaFarmaceutica: string;
  condicionVenta: string;
  // Por qué se eligió esta fila: el código del producto o el nombre exacto.
  coincidencia: "codigo" | "nombre";
};

type FilaPadron = Record<string, unknown>;

function texto(value: unknown): string {
  return String(value ?? "").trim();
}

function normalizado(value: unknown): string {
  return texto(value)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLocaleLowerCase("es-AR")
    .replace(/\s+/g, " ");
}

function gtin(value: unknown): string | null {
  const code = texto(value).replace(/\D/g, "");
  if (!code) return null;
  try {
    return canonicalGtin(code);
  } catch {
    return null;
  }
}

function ficha(
  fila: FilaPadron,
  coincidencia: FichaTerapeutica["coincidencia"],
): FichaTerapeutica {
  return {
    nombre: texto(fila.NOMBRE),
    presentacion: texto(fila.PRESENTACION),
    laboratorio: texto(fila.LABORATORIO),
    accionTerapeutica: texto(fila.ACCION),
    via: texto(fila.VIA),
    principioActivo: texto(fila.DROGA),
    formaFarmaceutica: texto(fila.FORMA),
    condicionVenta: texto(fila.TIPO_DE_VENTA),
    coincidencia,
  };
}

// Primero por código de barras; si no, por nombre exacto, y solo cuando todas
// las filas con ese nombre coinciden en acción terapéutica (sin adivinar).
export function elegirFichaTerapeutica(
  filas: unknown[],
  buscado: { nombre: string; codigos: string[] },
): FichaTerapeutica | null {
  const validas = filas.filter(
    (fila): fila is FilaPadron =>
      typeof fila === "object" &&
      fila !== null &&
      texto((fila as FilaPadron).ACCION) !== "",
  );
  const codigos = new Set(
    buscado.codigos.map(gtin).filter((code): code is string => !!code),
  );
  if (codigos.size) {
    const porCodigo = validas.find((fila) =>
      [fila.C_BARRA, fila.GTIN1].some((value) => {
        const code = gtin(value);
        return !!code && codigos.has(code);
      }),
    );
    if (porCodigo) return ficha(porCodigo, "codigo");
  }
  const nombre = normalizado(buscado.nombre);
  if (!nombre) return null;
  const porNombre = validas.filter(
    (fila) => normalizado(fila.NOMBRE) === nombre,
  );
  const acciones = new Set(porNombre.map((fila) => normalizado(fila.ACCION)));
  if (porNombre[0] && acciones.size === 1) return ficha(porNombre[0], "nombre");
  return null;
}
