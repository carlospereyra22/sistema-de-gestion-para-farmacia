import { createHash } from "node:crypto";
import { canonicalGtin } from "./external-gtin";

/**
 * Aportes de las farmacias al catálogo externo (SISTEMA-112). Reglas puras:
 * qué producto comercial se puede aportar y cómo se ofrece después a otra
 * farmacia. Nunca se copian precio, stock, costos ni datos de la farmacia.
 */

/** Fuente con la que la web reconoce un aporte. */
export const FUENTE_APORTE = "farmacia";

/** Ambiente de los aportes: separa producción, test y la PC. */
export function ambienteAportes(valor = ""): string | undefined {
  const limpio = valor.trim().toLowerCase();
  return /^[a-z0-9-]{1,20}$/.test(limpio) ? limpio : undefined;
}

/** GTIN de 14 dígitos o undefined si el código no sirve para el catálogo. */
export function gtinAportable(codigo: string): string | undefined {
  try {
    return canonicalGtin(codigo.trim());
  } catch {
    return undefined;
  }
}

export type ProductoParaAporte = {
  productId: string;
  organizationId: string;
  nombre: string;
  marca: string | null;
  presentacion: string | null;
  esMedicamento: boolean;
  activo: boolean;
  codigos: string[];
  categoriaRuta: string[];
  foto: Uint8Array | null;
};

export type Aporte = {
  gtin14: string;
  organizationId: string;
  productId: string;
  nombre: string;
  marca: string;
  presentacion: string;
  categoriaRuta: string[];
  foto: Uint8Array | null;
  fotoSha256: string | null;
};

const texto = (valor: string | null | undefined, maximo: number) =>
  (valor ?? "").replace(/\s+/g, " ").trim().slice(0, maximo);

/**
 * Los aportes de un producto, uno por código de barras válido. Un medicamento,
 * un producto dado de baja o uno sin nombre no aporta nada: sus aportes previos
 * dejan de ofrecerse.
 */
export function aportesDelProducto(producto: ProductoParaAporte): Aporte[] {
  const nombre = texto(producto.nombre, 300);
  if (producto.esMedicamento || !producto.activo || nombre.length < 2)
    return [];
  const gtins = new Set(
    producto.codigos
      .map(gtinAportable)
      .filter((gtin): gtin is string => !!gtin),
  );
  const foto = producto.foto?.length ? producto.foto : null;
  const fotoSha256 = foto
    ? createHash("sha256").update(foto).digest("hex")
    : null;
  return [...gtins].map((gtin14) => ({
    gtin14,
    organizationId: producto.organizationId,
    productId: producto.productId,
    nombre,
    marca: texto(producto.marca, 120),
    presentacion: texto(producto.presentacion, 200),
    categoriaRuta: producto.categoriaRuta
      .map((nombreCategoria) => texto(nombreCategoria, 120))
      .filter(Boolean)
      .slice(0, 8),
    foto,
    fotoSha256,
  }));
}

/** Ruta de categorías desde la raíz, sin ciclos aunque el dato venga mal. */
export function rutaDeCategoria(
  categoriaId: string | null,
  categorias: Map<string, { name: string; parentId: string | null }>,
): string[] {
  const ruta: string[] = [];
  const vistas = new Set<string>();
  let actual = categoriaId;
  while (actual && !vistas.has(actual) && ruta.length < 8) {
    vistas.add(actual);
    const categoria = categorias.get(actual);
    if (!categoria) break;
    ruta.unshift(categoria.name);
    actual = categoria.parentId;
  }
  return ruta;
}

export type FilaAporte = {
  gtin14: string;
  nombre: string;
  marca: string;
  presentacion: string;
  categoria_ruta: string[];
  foto: Uint8Array | null;
  foto_sha256: string | null;
  actualizado: Date;
};

/**
 * Un aporte con la misma forma que una ficha de tienda, así la web y la elección
 * de categoría lo tratan igual. No dice qué farmacia lo cargó.
 */
export function fichaDeAporte(fila: FilaAporte) {
  const gtin14 = fila.gtin14.trim();
  const ruta = fila.categoria_ruta ?? [];
  const fingerprint = createHash("sha256")
    .update(
      JSON.stringify([
        FUENTE_APORTE,
        gtin14,
        fila.nombre,
        fila.marca,
        fila.presentacion,
        ruta,
        fila.foto_sha256 ?? "",
      ]),
    )
    .digest("hex");
  return {
    // Como EAN-13 cuando se puede: es lo que imprime el envase.
    code: gtin14.startsWith("0") ? gtin14.slice(1) : gtin14,
    gtin14,
    name: fila.nombre,
    brand: fila.marca,
    category: ruta.at(-1) ?? "",
    presentation: fila.presentacion,
    source: FUENTE_APORTE,
    source_ref: "Cargado por una farmacia",
    license: "APORTE_DE_FARMACIA",
    verification: "CHECKSUM_VALID_NOT_PHYSICALLY_VERIFIED",
    scope_group: ruta[0] ?? "",
    ...(ruta.length ? { category_path: ruta } : {}),
    ...(ruta.length > 1 ? { subcategory: ruta.at(-1) } : {}),
    isMedication: false,
    argentina_evidence: "aporte_de_farmacia_argentina",
    fingerprint,
    evidence_count: 1,
    sources: [FUENTE_APORTE],
    ...(fila.foto?.length && fila.foto_sha256
      ? {
          image: {
            data_url: `data:image/jpeg;base64,${Buffer.from(fila.foto).toString("base64")}`,
            url: "",
            source: FUENTE_APORTE,
            source_ref: "Foto cargada por una farmacia",
            license: "APORTE_DE_FARMACIA",
            sha256: fila.foto_sha256,
          },
        }
      : {}),
  };
}
