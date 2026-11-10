import type { Transfer } from "./api";
import {
  guardarVentaPendiente,
  unidadesPendientes,
  ventasDeLaPc,
  type VentaPendiente,
} from "./bandeja-ventas";
import { leerSesion } from "./cache-local";
import { firmarVenta } from "./firma-ventas";
import { ahoraSegunServidor, idDeEstaPc } from "./venta-sin-conexion";

// Transferencias sin conexión (SISTEMA-71). Sin internet se puede preparar y
// despachar (descuenta el stock en la PC) y recibir sólo lo que ya estaba en
// tránsito cuando había conexión (suma el stock en la PC). Se guarda la misma
// operación que se mandaría con conexión, firmada, y se envía sola al volver,
// en orden con lo demás.

export type RenglonTransferencia = {
  /** Sólo si el servidor ya conoce el lote. */
  lotId?: string;
  productId: string;
  lotNumber: string;
  quantity: number;
};

export type OperacionTransferencia = {
  clientOperationId: string;
  occurredAt: string;
  deviceId: string;
} & (
  | {
      tipo: "PREPARAR";
      cuerpo: { destinationBranchId: string; items: RenglonTransferencia[] };
    }
  | { tipo: "DESPACHAR" | "RECIBIR"; cuerpo: { transferId: string } }
);

type LoteVisible = {
  id: string;
  productId: string;
  number: string;
  quantity: number;
};

/** Transferencia como se ve en la PC, con lo que todavía no llegó. */
export type TransferenciaVisible = Transfer & { porEnviar?: boolean };

/** El servidor conoce los lotes por id; los recibidos sin conexión, no. */
const esLoteDelServidor = (id: string) => !id.startsWith("sin-enviar:");

/** Renglones de la transferencia con el número de lote que conoce la PC. */
export function renglonesDeLotes(
  items: readonly { lotId: string; quantity: number }[],
  lotes: readonly LoteVisible[],
): RenglonTransferencia[] {
  return items.flatMap((item) => {
    const lote = lotes.find((l) => l.id === item.lotId);
    return lote
      ? [
          {
            ...(esLoteDelServidor(lote.id) ? { lotId: lote.id } : {}),
            productId: lote.productId,
            lotNumber: lote.number,
            quantity: item.quantity,
          },
        ]
      : [];
  });
}

const operacionDe = (item: VentaPendiente) =>
  item.operacion === "TRANSFERENCIA"
    ? (item.cuerpo as OperacionTransferencia)
    : undefined;

/** Operaciones de transferencias de la sucursal que esperan llegar al servidor. */
function pendientesDe(
  bandeja: readonly VentaPendiente[],
  organizationId: string,
  branchId: string,
) {
  return bandeja.flatMap((item) => {
    const op = operacionDe(item);
    return op &&
      item.estado === "PENDIENTE" &&
      item.organizationId === organizationId &&
      item.branchId === branchId
      ? [op]
      : [];
  });
}

/** ¿La transferencia tiene algo sin enviar en la PC? Lo nuevo va detrás. */
export function transferenciaConPendientes(
  bandeja: readonly VentaPendiente[],
  organizationId: string,
  branchId: string,
  transfer: Pick<Transfer, "id" | "clientOperationId">,
) {
  const claves = new Set(
    [transfer.id, transfer.clientOperationId].filter(Boolean),
  );
  return pendientesDe(bandeja, organizationId, branchId).some((op) =>
    claves.has(
      op.tipo === "PREPARAR" ? op.clientOperationId : op.cuerpo.transferId,
    ),
  );
}

/**
 * Suma a la lista del servidor lo hecho en la PC: las preparadas sin conexión
 * como filas nuevas y los despachos y recepciones como cambio de estado.
 */
export function transferenciasConPendientes(
  delServidor: readonly Transfer[],
  bandeja: readonly VentaPendiente[],
  organizationId: string,
  branchId: string,
): TransferenciaVisible[] {
  const lista: TransferenciaVisible[] = delServidor.map((t) => ({ ...t }));
  const buscar = (clave: string) =>
    lista.find((t) => t.id === clave || t.clientOperationId === clave);
  // Primero las preparadas: un despacho siempre se aplica sobre su transferencia.
  const pendientes = pendientesDe(bandeja, organizationId, branchId).sort(
    (a, b) => Number(b.tipo === "PREPARAR") - Number(a.tipo === "PREPARAR"),
  );
  for (const op of pendientes) {
    if (op.tipo === "PREPARAR") {
      const ya = buscar(op.clientOperationId);
      if (ya) {
        ya.porEnviar = true;
        continue;
      }
      lista.unshift({
        id: op.clientOperationId,
        clientOperationId: op.clientOperationId,
        sourceBranchId: branchId,
        destinationBranchId: op.cuerpo.destinationBranchId,
        status: "PREPARED",
        createdAt: op.occurredAt,
        items: op.cuerpo.items.map((item, i) => ({
          id: `${op.clientOperationId}|${i}`,
          productId: item.productId,
          lotId: item.lotId ?? `sin-enviar:${item.productId}|${item.lotNumber}`,
          lotNumber: item.lotNumber,
          quantity: item.quantity,
          receivedQuantity: 0,
        })),
        porEnviar: true,
      });
      continue;
    }
    const transfer = buscar(op.cuerpo.transferId);
    if (!transfer) continue;
    transfer.porEnviar = true;
    if (op.tipo === "DESPACHAR" && transfer.status === "PREPARED")
      transfer.status = "IN_TRANSIT";
    if (op.tipo === "RECIBIR" && transfer.status === "IN_TRANSIT")
      transfer.status = "RECEIVED";
  }
  return lista;
}

/**
 * Lotes con lo que se puede despachar desde la PC: el stock del lote menos lo
 * ya despachado sin enviar, y nunca más de lo que queda del producto después
 * de lo vendido sin conexión. Así no se manda más de lo que hay.
 */
export function lotesParaTransferir<T extends LoteVisible>(
  lotes: readonly T[],
  delServidor: readonly LoteVisible[],
  bandeja: readonly VentaPendiente[],
  organizationId: string,
  branchId: string,
): T[] {
  const despachado = new Map<string, number>();
  for (const item of bandeja)
    if (
      item.operacion === "TRANSFERENCIA" &&
      item.estado === "PENDIENTE" &&
      item.organizationId === organizationId &&
      item.branchId === branchId
    )
      for (const u of item.unidades)
        if (u.lote && u.cantidad > 0) {
          const clave = `${u.productId}|${u.lote}`;
          despachado.set(clave, (despachado.get(clave) ?? 0) + u.cantidad);
        }
  const delProducto = new Map<string, number>();
  for (const lote of delServidor)
    delProducto.set(
      lote.productId,
      (delProducto.get(lote.productId) ?? 0) + lote.quantity,
    );
  for (const [productId, cantidad] of unidadesPendientes(
    bandeja,
    organizationId,
    branchId,
  ))
    delProducto.set(productId, (delProducto.get(productId) ?? 0) - cantidad);
  return lotes.flatMap((lote) => {
    const quantity = Math.max(
      0,
      Math.min(
        lote.quantity -
          (despachado.get(`${lote.productId}|${lote.number}`) ?? 0),
        delProducto.get(lote.productId) ?? 0,
      ),
    );
    return quantity > 0 ? [{ ...lote, quantity }] : [];
  });
}

/**
 * Unidades que mueve la operación en el stock que se ve en la PC: despachar
 * las descuenta (con su lote) y recibir las suma (en negativo).
 */
export function unidadesDeTransferencia(
  tipo: "DESPACHAR" | "RECIBIR",
  transfer: Pick<Transfer, "items">,
  lotes: readonly LoteVisible[],
): VentaPendiente["unidades"] {
  return transfer.items.map((item) => {
    const lote =
      item.lotNumber ?? lotes.find((l) => l.id === item.lotId)?.number;
    return tipo === "DESPACHAR"
      ? {
          productId: item.productId,
          cantidad: item.quantity,
          ...(lote ? { lote } : {}),
        }
      : { productId: item.productId, cantidad: -item.quantity };
  });
}

/** Guarda la operación en la bandeja de la PC, firmada por quien la hace. */
export async function guardarOperacionTransferencia(
  organizationId: string,
  branchId: string,
  datos:
    | {
        tipo: "PREPARAR";
        cuerpo: Extract<OperacionTransferencia, { tipo: "PREPARAR" }>["cuerpo"];
      }
    | { tipo: "DESPACHAR" | "RECIBIR"; cuerpo: { transferId: string } },
  unidades: VentaPendiente["unidades"] = [],
) {
  const sesion = await leerSesion();
  if (!sesion) throw new Error("No hay una sesión abierta en esta PC.");
  // La bandeja se manda por hora: cada operación queda después de la anterior,
  // así un despacho nunca llega antes que su preparación.
  const ultima = Math.max(
    0,
    ...(await ventasDeLaPc())
      .filter((item) => item.operacion === "TRANSFERENCIA")
      .map((item) => Date.parse(item.occurredAt)),
  );
  const op = {
    ...datos,
    clientOperationId: crypto.randomUUID(),
    occurredAt: new Date(
      Math.max(ahoraSegunServidor().getTime(), ultima + 1),
    ).toISOString(),
    deviceId: idDeEstaPc(),
  } as OperacionTransferencia;
  const payload = JSON.stringify(op);
  const vendedorId = sesion.perfil.id;
  const firma = vendedorId
    ? await firmarVenta(sesion.alcance, payload).catch(() => undefined)
    : undefined;
  await guardarVentaPendiente({
    version: 1,
    id: op.clientOperationId,
    alcance: sesion.alcance,
    organizationId,
    branchId,
    occurredAt: op.occurredAt,
    totalMinor: "0",
    documentType: "INTERNAL",
    cuerpo: op,
    unidades,
    estado: "PENDIENTE",
    intentos: 0,
    operacion: "TRANSFERENCIA",
    actorName:
      sesion.perfil.organizations.find(
        (membresia) => membresia.organizationId === organizationId,
      )?.displayName || sesion.perfil.email,
    ...(vendedorId && firma ? { vendedorId, payload, firma } : {}),
  });
  return op;
}

/** Nombre de la operación para mostrar. */
export const operacionTransferenciaTexto = (item: VentaPendiente) => {
  const tipo = operacionDe(item)?.tipo;
  return tipo === "PREPARAR"
    ? "Preparación"
    : tipo === "DESPACHAR"
      ? "Despacho"
      : "Recepción";
};
