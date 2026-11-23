import { decodeProductImage } from "./product-image";

/** Foto de una tienda argentina para un código de la base (SISTEMA-122). */
export type FotoMedicamento = {
  gtin14: string;
  source: string;
  sourceRef: string;
  sha256: string;
  foto: Uint8Array;
  prioridad: number;
};

/** Producto sin foto cuyo código coincide con la base de medicamentos. */
export type ProductoSinFoto = {
  id: string;
  organizationId: string;
  /** Códigos de la base que coinciden, del principal al último. */
  gtins: string[];
};

export type FotoElegida = {
  gtin14: string;
  source: string;
  sourceRef: string;
  sha256: string;
  content: Buffer;
};

/** Sólo estas tiendas: Farmacorp es de Bolivia y el envase puede ser otro. */
export const TIENDAS_FOTO = new Set([
  "public_farmalife",
  "public_farmaplus",
  "public_farmar",
  "public_farmamix",
]);

/**
 * La foto para un producto: la de mejor prioridad (ficha no medicinal antes que
 * la bajada para medicamentos) y, a igual prioridad, la del código principal.
 * La foto pasa por la misma validación que una subida a mano; si no la pasa, se
 * prueba la siguiente.
 */
export function elegirFoto(
  producto: ProductoSinFoto,
  fotos: FotoMedicamento[],
): FotoElegida | null {
  const orden = new Map(producto.gtins.map((gtin, i) => [gtin.trim(), i]));
  const candidatas = fotos
    .filter(
      (foto) => orden.has(foto.gtin14.trim()) && TIENDAS_FOTO.has(foto.source),
    )
    .sort(
      (a, b) =>
        a.prioridad - b.prioridad ||
        orden.get(a.gtin14.trim())! - orden.get(b.gtin14.trim())!,
    );
  for (const foto of candidatas) {
    try {
      const content = decodeProductImage(
        `data:image/jpeg;base64,${Buffer.from(foto.foto).toString("base64")}`,
      );
      return {
        gtin14: foto.gtin14.trim(),
        source: foto.source,
        sourceRef: foto.sourceRef,
        sha256: foto.sha256.trim(),
        content,
      };
    } catch {
      continue;
    }
  }
  return null;
}
