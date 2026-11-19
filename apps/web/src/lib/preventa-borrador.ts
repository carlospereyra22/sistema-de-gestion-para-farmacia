import type { ProductoPreventa } from "./preventa-api";

/**
 * Pedido sin enviar, uno por cliente (SISTEMA-108), como en la app de
 * preventistas anterior: cada cliente tiene su carrito. Cambiar de cliente no
 * arrastra los productos (los precios dependen de la lista de cada uno) y, al
 * volver a un cliente con un pedido a medio armar, se ofrece retomarlo. Vive
 * en el teléfono (localStorage) por usuario y farmacia: sobrevive a recargar
 * o cerrar la app. Nunca es autoridad: al enviar, la API recalcula todo.
 */

export type RenglonBorrador = {
  productId: string;
  quantity: number;
  /** Precio que bajó el preventista, en centavos. */
  unitPriceMinor?: string;
};

export type ClienteBorrador = {
  id: string;
  name: string;
  address: string | null;
};

export type Borrador = {
  renglones: RenglonBorrador[];
  notas: string;
  /** Lo que se vio de cada producto (nombre, precio, ofertas) para mostrarlo. */
  productos: Record<string, ProductoPreventa>;
  actualizado: number;
};

export type Almacen = Pick<Storage, "getItem" | "setItem" | "removeItem">;

const PREFIJO = "preventa:borrador:v2";

export const borradorVacio = (): Borrador => ({
  renglones: [],
  notas: "",
  productos: {},
  actualizado: 0,
});

const clave = (organizacion: string, usuario: string, cliente: string) =>
  `${PREFIJO}:${organizacion}:${usuario}:${cliente}`;
const claveActual = (organizacion: string, usuario: string) =>
  `${PREFIJO}:actual:${organizacion}:${usuario}`;

function almacenDelNavegador(): Almacen | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

export const tieneProductos = (b: Pick<Borrador, "renglones">) =>
  b.renglones.some((r) => r.quantity > 0);

/** Lee el borrador de un cliente y descarta lo que no tenga sentido. */
export function leerBorrador(
  organizacion: string,
  usuario: string,
  cliente: string,
  almacen: Almacen | null = almacenDelNavegador(),
): Borrador | null {
  try {
    const texto = almacen?.getItem(clave(organizacion, usuario, cliente));
    if (!texto) return null;
    const datos = JSON.parse(texto) as Partial<Borrador>;
    const renglones = (Array.isArray(datos.renglones) ? datos.renglones : [])
      .filter(
        (r): r is RenglonBorrador =>
          typeof r?.productId === "string" &&
          Number.isInteger(r.quantity) &&
          r.quantity > 0 &&
          (r.unitPriceMinor === undefined ||
            /^\d{1,15}$/.test(r.unitPriceMinor)),
      )
      .map((r) => ({ ...r, quantity: Math.min(r.quantity, 9999) }));
    const borrador = {
      renglones,
      notas: typeof datos.notas === "string" ? datos.notas.slice(0, 500) : "",
      productos:
        datos.productos && typeof datos.productos === "object"
          ? datos.productos
          : {},
      actualizado: Number(datos.actualizado) || 0,
    };
    return tieneProductos(borrador) ? borrador : null;
  } catch {
    return null;
  }
}

/** Guarda el borrador del cliente; sin productos, lo borra. */
export function guardarBorrador(
  organizacion: string,
  usuario: string,
  cliente: string,
  borrador: Borrador,
  almacen: Almacen | null = almacenDelNavegador(),
) {
  try {
    const k = clave(organizacion, usuario, cliente);
    if (!tieneProductos(borrador)) {
      almacen?.removeItem(k);
      return;
    }
    // Sólo se guarda lo de los productos que están en el carrito.
    const ids = new Set(borrador.renglones.map((r) => r.productId));
    const productos = Object.fromEntries(
      Object.entries(borrador.productos).filter(([id]) => ids.has(id)),
    );
    almacen?.setItem(
      k,
      JSON.stringify({ ...borrador, productos, actualizado: Date.now() }),
    );
  } catch {
    // Sin espacio o bloqueado: el pedido sigue en pantalla.
  }
}

export function borrarBorrador(
  organizacion: string,
  usuario: string,
  cliente: string,
  almacen: Almacen | null = almacenDelNavegador(),
) {
  try {
    almacen?.removeItem(clave(organizacion, usuario, cliente));
  } catch {
    // Nada que hacer.
  }
}

/** Cliente del pedido en armado, para volver a él al recargar. */
export function leerClienteActual(
  organizacion: string,
  usuario: string,
  almacen: Almacen | null = almacenDelNavegador(),
): ClienteBorrador | null {
  try {
    const texto = almacen?.getItem(claveActual(organizacion, usuario));
    const datos = texto ? (JSON.parse(texto) as ClienteBorrador) : null;
    return datos &&
      typeof datos.id === "string" &&
      typeof datos.name === "string"
      ? { id: datos.id, name: datos.name, address: datos.address ?? null }
      : null;
  } catch {
    return null;
  }
}

export function guardarClienteActual(
  organizacion: string,
  usuario: string,
  cliente: ClienteBorrador | null,
  almacen: Almacen | null = almacenDelNavegador(),
) {
  try {
    const k = claveActual(organizacion, usuario);
    if (cliente) almacen?.setItem(k, JSON.stringify(cliente));
    else almacen?.removeItem(k);
  } catch {
    // Nada que hacer.
  }
}

/** Texto sin tildes ni mayúsculas, para buscar "Martin" y encontrar "Martín". */
export function normalizar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** ¿El cliente coincide con la búsqueda (nombre, dirección, documento o teléfono)? */
export function clienteCoincide(
  cliente: {
    name: string;
    address: string | null;
    document: string | null;
    phone: string | null;
  },
  busqueda: string,
): boolean {
  const q = normalizar(busqueda);
  if (!q) return true;
  const digitos = busqueda.replace(/\D/g, "");
  return (
    q
      .split(" ")
      .every((parte) =>
        normalizar(`${cliente.name} ${cliente.address ?? ""}`).includes(parte),
      ) ||
    (digitos.length >= 3 &&
      `${cliente.document ?? ""} ${cliente.phone ?? ""}`
        .replace(/\D/g, "")
        .includes(digitos))
  );
}
