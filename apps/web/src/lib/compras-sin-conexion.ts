import type { Purchase } from "./api";
import type { PurchaseDetail } from "./purchases";
import { guardarVentaPendiente, type VentaPendiente } from "./bandeja-ventas";
import { leerSesion } from "./cache-local";
import { firmarVenta } from "./firma-ventas";
import { ahoraSegunServidor, idDeEstaPc } from "./venta-sin-conexion";

// Compras sin conexión (SISTEMA-69). Pedido, compra directa o recepción hecho
// sin internet: se guarda la misma solicitud que se mandaría con conexión (con
// su clave, así el servidor no la duplica) y se envía sola al volver, en orden
// con las ventas y la caja.

export type OperacionCompra = {
  tipo: "PEDIDO" | "DIRECTA" | "RECEPCION";
  occurredAt: string;
  deviceId: string;
  /** Recepción: el pedido. */
  purchaseId?: string;
  /** La misma solicitud que con conexión. */
  cuerpo: Record<string, unknown>;
};

/** Qué tipo es, según la ruta con la que se mandaría con conexión. */
export function tipoDeCompra(path: string): OperacionCompra["tipo"] {
  return path === "/direct"
    ? "DIRECTA"
    : path.endsWith("/receipts/batch")
      ? "RECEPCION"
      : "PEDIDO";
}

/** Pedido de una recepción (`/{id}/receipts/batch`). */
export const pedidoDeRecepcion = (path: string) =>
  /^\/([^/]+)\/receipts\/batch$/.exec(path)?.[1];

/**
 * Guarda la operación en la bandeja de la PC, firmada por quien la hace.
 * `ingresos` son las unidades que entran al stock (compra directa o
 * recepción): se ven enseguida en la PC.
 */
export async function guardarOperacionCompra(
  organizationId: string,
  branchId: string,
  path: string,
  cuerpo: Record<string, unknown>,
  ingresos: Ingreso[],
  total = 0,
) {
  const sesion = await leerSesion();
  if (!sesion) throw new Error("No hay una sesión abierta en esta PC.");
  const tipo = tipoDeCompra(path);
  const op: OperacionCompra = {
    tipo,
    occurredAt: ahoraSegunServidor().toISOString(),
    deviceId: idDeEstaPc(),
    ...(tipo === "RECEPCION" ? { purchaseId: pedidoDeRecepcion(path) } : {}),
    cuerpo,
  };
  const payload = JSON.stringify(op);
  const vendedorId = sesion.perfil.id;
  const firma = vendedorId
    ? await firmarVenta(sesion.alcance, payload).catch(() => undefined)
    : undefined;
  await guardarVentaPendiente({
    version: 1,
    id: String(
      cuerpo.clientOperationId ?? cuerpo.operationId ?? crypto.randomUUID(),
    ),
    alcance: sesion.alcance,
    organizationId,
    branchId,
    occurredAt: op.occurredAt,
    totalMinor: String(total),
    documentType: "INTERNAL",
    cuerpo: op,
    // En negativo: suman stock en la pantalla.
    unidades: ingresos.map((ingreso) => ({
      productId: ingreso.productId,
      cantidad: -ingreso.cantidad,
      ...(ingreso.lote
        ? { lote: ingreso.lote, vence: ingreso.vence ?? null }
        : {}),
    })),
    estado: "PENDIENTE",
    intentos: 0,
    operacion: "COMPRA",
    actorName:
      sesion.perfil.organizations.find(
        (membresia) => membresia.organizationId === organizationId,
      )?.displayName || sesion.perfil.email,
    ...(vendedorId && firma ? { vendedorId, payload, firma } : {}),
  });
}

/** Unidades que entran al stock, con su lote (compra directa o recepción). */
export type Ingreso = {
  productId: string;
  cantidad: number;
  lote?: string;
  vence?: string | null;
};

type LineaDeLote = {
  quantity: number;
  lotNumber?: string;
  expiresAt?: string | null;
  /** Abrir cajas al recibir (SISTEMA-103). */
  openBoxes?: number;
};

/** En qué producto se abre una caja y cuántas trae (vínculo del producto). */
export type AperturaDeProducto = (
  productId: string,
) => { targetProductId: string; factor: number } | null;

/**
 * Abrir cajas al recibir sin conexión (SISTEMA-103): en la PC, lo abierto
 * sale de la caja y entra al otro producto con el mismo lote, igual que lo
 * hará el servidor al llegar.
 */
function conAperturas(
  ingresos: Ingreso[],
  lineas: readonly LineaDeLote[],
  apertura?: AperturaDeProducto,
): Ingreso[] {
  if (!apertura) return ingresos;
  return ingresos.flatMap((ingreso, i) => {
    const cajas = Math.min(lineas[i]?.openBoxes ?? 0, ingreso.cantidad);
    const destino = cajas > 0 ? apertura(ingreso.productId) : null;
    if (!destino) return [ingreso];
    return [
      { ...ingreso, cantidad: ingreso.cantidad - cajas },
      {
        ...ingreso,
        productId: destino.targetProductId,
        cantidad: cajas * destino.factor,
      },
    ].filter((item) => item.cantidad > 0);
  });
}
const conLote = (linea: LineaDeLote) =>
  linea.lotNumber?.trim()
    ? { lote: linea.lotNumber.trim(), vence: linea.expiresAt || null }
    : {};

/** Unidades que entran al stock con esta solicitud (compra directa o recepción). */
export function ingresosDeCompra(
  solicitud: { path: string; body: unknown },
  renglones: readonly { id: string; productId: string }[],
  apertura?: AperturaDeProducto,
): Ingreso[] {
  const cuerpo = solicitud.body as {
    receipts?: (LineaDeLote & { productId: string })[];
    items?: (LineaDeLote & { itemId?: string })[];
  };
  if (solicitud.path === "/direct") {
    const lineas = cuerpo.receipts ?? [];
    return conAperturas(
      lineas.map((lote) => ({
        productId: lote.productId,
        cantidad: lote.quantity,
        ...conLote(lote),
      })),
      lineas,
      apertura,
    );
  }
  if (!pedidoDeRecepcion(solicitud.path)) return [];
  const lineas = (cuerpo.items ?? []).flatMap((lote) => {
    const productId = renglones.find((r) => r.id === lote.itemId)?.productId;
    return productId ? [{ lote, productId }] : [];
  });
  return conAperturas(
    lineas.map(({ lote, productId }) => ({
      productId,
      cantidad: lote.quantity,
      ...conLote(lote),
    })),
    lineas.map(({ lote }) => lote),
    apertura,
  );
}

/**
 * Lotes recibidos sin conexión que todavía no llegaron: se suman a los del
 * servidor para que la próxima recepción los reconozca (SISTEMA-69).
 */
export function lotesSinEnviar(
  bandeja: readonly VentaPendiente[],
  organizationId: string,
  branchId: string,
  hoy = new Date().toISOString().slice(0, 10),
) {
  const lotes = new Map<
    string,
    {
      id: string;
      productId: string;
      number: string;
      quantity: number;
      expiresAt: string | null;
      expiryStatus: "EXPIRED" | "AVAILABLE";
    }
  >();
  for (const item of bandeja) {
    if (
      item.operacion !== "COMPRA" ||
      item.estado !== "PENDIENTE" ||
      item.organizationId !== organizationId ||
      item.branchId !== branchId
    )
      continue;
    for (const unidad of item.unidades) {
      if (!unidad.lote) continue;
      const clave = `${unidad.productId}|${unidad.lote}`;
      const previo = lotes.get(clave);
      const vence = unidad.vence?.slice(0, 10) || null;
      lotes.set(clave, {
        id: `sin-enviar:${clave}`,
        productId: unidad.productId,
        number: unidad.lote,
        quantity: (previo?.quantity ?? 0) - unidad.cantidad,
        expiresAt: previo?.expiresAt ?? vence,
        expiryStatus:
          (previo?.expiresAt ?? vence ?? "9999") < hoy
            ? "EXPIRED"
            : "AVAILABLE",
      });
    }
  }
  return [...lotes.values()];
}

/** Junta los lotes del servidor con los recibidos sin conexión. */
export function lotesConPendientes<
  T extends { productId: string; number: string; quantity: number },
>(delServidor: readonly T[], pendientes: readonly T[]): T[] {
  const resultado = [...delServidor];
  for (const lote of pendientes) {
    const i = resultado.findIndex(
      (l) => l.productId === lote.productId && l.number === lote.number,
    );
    if (i < 0) resultado.push(lote);
    else
      resultado[i] = {
        ...resultado[i]!,
        quantity: resultado[i]!.quantity + lote.quantity,
      };
  }
  return resultado;
}

/** Nombre de la operación para mostrar. */
export const tipoDeCompraTexto = (tipo: OperacionCompra["tipo"]) =>
  tipo === "PEDIDO"
    ? "Pedido"
    : tipo === "DIRECTA"
      ? "Compra directa"
      : "Recepción";

// Lo hecho sin conexión se ve en Compras como si ya hubiera llegado
// (SISTEMA-69): pedidos y compras directas como filas y recepciones sumadas
// a su pedido. Así se puede recibir sin internet un pedido que ya estaba o
// uno creado sin internet, varias veces y de a partes.

type CuerpoPedido = {
  clientOperationId?: string;
  supplierId: string;
  reference?: string;
  notes?: string;
  items: {
    productId: string;
    quantity: number;
    unitCostMinor: number;
    packFactor?: number;
  }[];
  receipts?: { productId: string; quantity: number }[];
  debt?: unknown;
};
type CuerpoRecepcion = {
  debt?: unknown;
  items: { itemId: string; quantity: number }[];
};

/** Operaciones de compra de la sucursal que todavía no llegaron. */
function comprasPendientes(
  bandeja: readonly VentaPendiente[],
  organizationId: string,
  branchId: string,
) {
  return bandeja
    .filter(
      (item) =>
        item.operacion === "COMPRA" &&
        item.estado === "PENDIENTE" &&
        item.organizationId === organizationId &&
        item.branchId === branchId,
    )
    .sort((a, b) => a.occurredAt.localeCompare(b.occurredAt))
    .map((item) => item.cuerpo as OperacionCompra);
}

/** Suma al pedido lo recibido sin conexión y recalcula su estado. */
function conRecepciones<T extends Purchase>(
  compra: T,
  pendientes: readonly OperacionCompra[],
): T {
  const recepciones = pendientes.filter(
    (op) =>
      op.tipo === "RECEPCION" &&
      (op.purchaseId === compra.id ||
        (!!compra.clientOperationId &&
          op.purchaseId === compra.clientOperationId)),
  );
  if (!recepciones.length) return compra;
  const items = compra.items.map((renglon) => ({
    ...renglon,
    receivedQuantity:
      renglon.receivedQuantity +
      recepciones.reduce(
        (suma, op) =>
          suma +
          (op.cuerpo as CuerpoRecepcion).items
            .filter(
              (lote) =>
                lote.itemId === renglon.id || lote.itemId === renglon.productId,
            )
            .reduce((s, lote) => s + lote.quantity, 0),
        0,
      ),
  }));
  const completo = items.every(
    (i) => i.orderedQuantity - (i.cancelledQuantity ?? 0) <= i.receivedQuantity,
  );
  return {
    ...compra,
    items,
    status: completo ? "RECEIVED" : "PARTIALLY_RECEIVED",
    porEnviar: true,
    ...(recepciones.some((op) => (op.cuerpo as CuerpoRecepcion).debt)
      ? { hasRegisteredDebt: true }
      : {}),
  };
}

/** Pedido o compra directa hecho sin conexión, como lo mostraría el servidor. */
function compraLocal(
  op: OperacionCompra,
  proveedores: readonly { id: string; name: string }[],
): PurchaseDetail {
  const cuerpo = op.cuerpo as CuerpoPedido;
  const directa = op.tipo === "DIRECTA";
  return {
    id: String(cuerpo.clientOperationId),
    clientOperationId: cuerpo.clientOperationId ?? null,
    createdAt: op.occurredAt,
    orderedAt: op.occurredAt,
    status: directa ? "RECEIVED" : "ORDERED",
    supplierId: cuerpo.supplierId,
    supplierName: proveedores.find((p) => p.id === cuerpo.supplierId)?.name,
    reference: cuerpo.reference ?? null,
    notes: cuerpo.notes ?? null,
    canRegisterDebt: true,
    hasRegisteredDebt: directa && !!cuerpo.debt,
    porEnviar: true,
    // Un producto no se repite en un pedido: el renglón se conoce por él.
    items: cuerpo.items.map((renglon) => ({
      id: renglon.productId,
      productId: renglon.productId,
      orderedQuantity: renglon.quantity,
      receivedQuantity: directa
        ? (cuerpo.receipts ?? [])
            .filter((lote) => lote.productId === renglon.productId)
            .reduce((s, lote) => s + lote.quantity, 0)
        : 0,
      unitCostMinor: String(renglon.unitCostMinor),
    })),
    receipts: [],
    legacyMovements: [],
  };
}

/** La lista de compras con lo hecho sin conexión en esta PC. */
export function comprasConPendientes(
  filas: readonly Purchase[],
  bandeja: readonly VentaPendiente[],
  organizationId: string,
  branchId: string,
  proveedores: readonly { id: string; name: string }[] = [],
): Purchase[] {
  const pendientes = comprasPendientes(bandeja, organizationId, branchId);
  const locales = pendientes
    .filter(
      (op) =>
        op.tipo !== "RECEPCION" &&
        // Si ya llegó, el servidor la trae en la lista.
        !filas.some(
          (fila) =>
            !!fila.clientOperationId &&
            fila.clientOperationId === op.cuerpo.clientOperationId,
        ),
    )
    .map((op) => compraLocal(op, proveedores))
    .reverse();
  return [...locales, ...filas].map((fila) => conRecepciones(fila, pendientes));
}

/**
 * Detalle de una compra con lo hecho sin conexión: el del servidor (o su copia
 * guardada) o, si el pedido se creó sin conexión, el armado en la PC.
 */
export function detalleConPendientes(
  id: string,
  detalle: PurchaseDetail | undefined,
  bandeja: readonly VentaPendiente[],
  organizationId: string,
  branchId: string,
  proveedores: readonly { id: string; name: string }[] = [],
): PurchaseDetail | undefined {
  const pendientes = comprasPendientes(bandeja, organizationId, branchId);
  if (detalle) return conRecepciones(detalle, pendientes);
  const local = pendientes.find(
    (op) => op.tipo !== "RECEPCION" && op.cuerpo.clientOperationId === id,
  );
  return local
    ? conRecepciones(compraLocal(local, proveedores), pendientes)
    : undefined;
}
