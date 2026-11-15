import type { StockLot } from "./api";
import type { VentaPendiente } from "./bandeja-ventas";
import { guardarEnLaPc } from "./guardar-en-la-pc";
import { withStockAvailability } from "./stock-availability";

// Inventario sin conexión (SISTEMA-79). Sin internet se puede ingresar stock,
// ajustar un lote, devolverle al proveedor, corregir un lote y abrir cajas
// (SISTEMA-103). Se guarda en la
// PC, firmado por quien lo hizo, y se manda solo al volver, en orden con lo
// demás. Al llegar, una salida que supera lo que queda se registra hasta lo
// que hay, con aviso (decisión del usuario).

type Base = { clientOperationId: string; occurredAt: string; deviceId: string };

/** Lote por su id, o por producto y número si se creó sin conexión. */
export type LoteDeLaOperacion = {
  lotId?: string;
  productId?: string;
  number?: string;
};

export type OperacionInventario = Base &
  (
    | {
        tipo: "INGRESO";
        cuerpo: {
          productId: string;
          supplierId: string | null;
          lotNumber: string;
          quantity: number;
          unitCostMinor: number;
          expiresAt?: string;
        };
      }
    | {
        tipo: "AJUSTE";
        cuerpo: {
          lote: LoteDeLaOperacion;
          quantity: number;
          reason: string;
          supplierId?: string | null;
          unitCostMinor?: number;
        };
      }
    | {
        tipo: "DEVOLUCION";
        cuerpo: {
          lote: LoteDeLaOperacion;
          supplierId: string | null;
          quantity: number;
          reason: string;
        };
      }
    | {
        tipo: "EDICION_LOTE";
        cuerpo: {
          lote: LoteDeLaOperacion;
          number?: string;
          expiresAt?: string | null;
          unitCostMinor?: string;
          reason: string;
        };
      }
    | {
        /** Abrir cajas (SISTEMA-103): N cajas del lote pasan a otro producto. */
        tipo: "APERTURA";
        cuerpo: {
          lote: LoteDeLaOperacion;
          boxes: number;
          targetProductId: string;
          factor: number;
        };
      }
  );

type DatosInventario = OperacionInventario extends infer T
  ? T extends OperacionInventario
    ? Omit<T, keyof Base>
    : never
  : never;

/** Id que la PC le da a un lote creado sin conexión (todavía sin id real). */
const PREFIJO = "pc|";
export const idDeLoteDeLaPc = (productId: string, number: string) =>
  `${PREFIJO}${productId}|${number.trim()}`;

/** Cómo nombrar el lote al servidor: por su id o, si es de la PC, por producto y número. */
export function loteDeLaOperacion(lotId: string): LoteDeLaOperacion {
  if (lotId.startsWith(PREFIJO)) {
    const [productId, ...numero] = lotId.slice(PREFIJO.length).split("|");
    return { productId, number: numero.join("|") };
  }
  return { lotId };
}

const operacionDe = (item: VentaPendiente) =>
  item.operacion === "INVENTARIO"
    ? (item.cuerpo as unknown as OperacionInventario)
    : undefined;

/** Movimientos de inventario de la sucursal que esperan llegar al servidor. */
export function pendientesDeInventario(
  bandeja: readonly VentaPendiente[],
  org: string,
  branchId: string,
) {
  return bandeja.flatMap((item) => {
    const op = operacionDe(item);
    return op &&
      item.estado === "PENDIENTE" &&
      item.organizationId === org &&
      item.branchId === branchId
      ? [op]
      : [];
  });
}

/** ¿El lote (o su producto) tiene algo sin enviar? Lo nuevo va detrás, en la PC. */
export function loteConPendientes(
  bandeja: readonly VentaPendiente[],
  org: string,
  branchId: string,
  lotId: string,
) {
  return (
    lotId.startsWith(PREFIJO) ||
    pendientesDeInventario(bandeja, org, branchId).some(
      (op) => op.tipo !== "INGRESO" && op.cuerpo.lote.lotId === lotId,
    )
  );
}

/** Guarda la operación en la PC, firmada por quien la hace. */
export function guardarOperacionInventario(
  organizationId: string,
  branchId: string,
  datos: DatosInventario,
) {
  return guardarEnLaPc<OperacionInventario>(
    organizationId,
    branchId,
    "INVENTARIO",
    { ...datos, clientOperationId: crypto.randomUUID() } as Omit<
      OperacionInventario,
      "occurredAt" | "deviceId"
    >,
  );
}

/**
 * El stock de la sucursal con lo hecho en la PC que todavía no llegó: los
 * ingresos (un lote nuevo o sumado), los ajustes, las devoluciones y las
 * correcciones. Nunca queda en negativo.
 */
export function stockConPendientes(
  stock: readonly StockLot[],
  bandeja: readonly VentaPendiente[],
  org: string,
  branchId: string,
  nombreDe: (productId: string) => string | undefined = () => undefined,
): StockLot[] {
  const pendientes = pendientesDeInventario(bandeja, org, branchId);
  if (!pendientes.length) return stock as StockLot[];
  const lotes = stock.map((lote) => ({ ...lote }));
  const buscar = (ref: LoteDeLaOperacion) =>
    ref.lotId && !ref.lotId.startsWith(PREFIJO)
      ? lotes.find((l) => l.id === ref.lotId)
      : lotes.find(
          (l) =>
            l.productId === ref.productId && l.number === ref.number?.trim(),
        );
  for (const op of pendientes) {
    if (op.tipo === "INGRESO") {
      const c = op.cuerpo;
      const lote = buscar({ productId: c.productId, number: c.lotNumber });
      if (lote) {
        lote.quantity += c.quantity;
        if (c.expiresAt)
          lote.expiresAt = `${c.expiresAt.slice(0, 10)}T00:00:00.000Z`;
        lote.porEnviar = true;
      } else
        lotes.push({
          id: idDeLoteDeLaPc(c.productId, c.lotNumber),
          productId: c.productId,
          productName: nombreDe(c.productId) ?? "Producto",
          number: c.lotNumber.trim(),
          quantity: c.quantity,
          expiresAt: c.expiresAt
            ? `${c.expiresAt.slice(0, 10)}T00:00:00.000Z`
            : null,
          unitCostMinor: String(c.unitCostMinor),
          metadataVersion: 0,
          sellableQuantity: 0,
          expiredQuantity: 0,
          expiryStatus: "AVAILABLE",
          porEnviar: true,
        });
      continue;
    }
    const lote = buscar(op.cuerpo.lote);
    if (!lote) continue;
    lote.porEnviar = true;
    if (op.tipo === "APERTURA") {
      // Abrir cajas: sale de la caja y entra al otro producto, mismo lote y
      // vencimiento (SISTEMA-103). Como en el servidor, hasta lo que hay.
      const c = op.cuerpo;
      const cajas = Math.min(c.boxes, lote.quantity);
      lote.quantity -= cajas;
      if (!cajas) continue;
      const destino = buscar({
        productId: c.targetProductId,
        number: lote.number,
      });
      if (destino) {
        destino.quantity += cajas * c.factor;
        destino.porEnviar = true;
      } else
        lotes.push({
          id: idDeLoteDeLaPc(c.targetProductId, lote.number),
          productId: c.targetProductId,
          productName: nombreDe(c.targetProductId) ?? "Producto",
          number: lote.number,
          quantity: cajas * c.factor,
          expiresAt: lote.expiresAt,
          ...(lote.unitCostMinor !== undefined
            ? {
                unitCostMinor: String(
                  Math.round(Number(lote.unitCostMinor) / c.factor),
                ),
              }
            : {}),
          metadataVersion: 0,
          sellableQuantity: 0,
          expiredQuantity: 0,
          expiryStatus: "AVAILABLE",
          porEnviar: true,
        });
      continue;
    }
    if (op.tipo === "AJUSTE")
      lote.quantity = Math.max(0, lote.quantity + op.cuerpo.quantity);
    else if (op.tipo === "DEVOLUCION")
      lote.quantity = Math.max(0, lote.quantity - op.cuerpo.quantity);
    else {
      const c = op.cuerpo;
      if (c.number !== undefined) lote.number = c.number.trim();
      if (c.expiresAt !== undefined)
        lote.expiresAt = c.expiresAt ? `${c.expiresAt}T00:00:00.000Z` : null;
      if (c.unitCostMinor !== undefined) lote.unitCostMinor = c.unitCostMinor;
      lote.metadataVersion += 1;
    }
  }
  // Lo que depende de la cantidad y del vencimiento se vuelve a calcular.
  return lotes
    .filter((lote) => lote.quantity > 0)
    .map((lote) =>
      withStockAvailability({
        ...lote,
        sellableQuantity: undefined,
        expiredQuantity: undefined,
        expiryStatus: undefined,
      }),
    ) as StockLot[];
}

/** Nombre de la operación para el panel de sincronización. */
export function operacionInventarioTexto(item: VentaPendiente) {
  const op = operacionDe(item);
  if (!op) return "Inventario";
  switch (op.tipo) {
    case "INGRESO":
      return `Ingreso de ${op.cuerpo.quantity} un. · lote ${op.cuerpo.lotNumber}`;
    case "AJUSTE":
      return `Ajuste de ${op.cuerpo.quantity > 0 ? "+" : ""}${op.cuerpo.quantity} un.`;
    case "DEVOLUCION":
      return `Devolución al proveedor · ${op.cuerpo.quantity} un.`;
    case "EDICION_LOTE":
      return "Corrección de lote";
    case "APERTURA":
      return `Apertura de ${op.cuerpo.boxes === 1 ? "1 caja" : `${op.cuerpo.boxes} cajas`} (+${op.cuerpo.boxes * op.cuerpo.factor} un.)`;
  }
}
