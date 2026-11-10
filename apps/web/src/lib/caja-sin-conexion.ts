import type { CashClosure, CashSession } from "./api";
import { guardarVentaPendiente, type VentaPendiente } from "./bandeja-ventas";
import { TOKEN_SIN_CONEXION, leerSesion } from "./cache-local";
import { firmarVenta } from "./firma-ventas";
import { ahoraSegunServidor, idDeEstaPc } from "./venta-sin-conexion";

// Caja sin conexión (SISTEMA-67). Sin internet, la pantalla de Caja y Ventas
// parten de la última copia del servidor y le aplican, en orden, lo hecho en
// la PC que todavía no llegó: aperturas, ventas, movimientos y cierres.

export type OperacionCaja = {
  tipo: "APERTURA" | "MOVIMIENTO" | "CIERRE";
  clientOperationId: string;
  occurredAt: string;
  deviceId: string;
  cashRegisterId?: string;
  openingAmountMinor?: number;
  sessionId?: string;
  type?: "IN" | "OUT";
  amountMinor?: number;
  reason?: string;
  closingAmountMinor?: number;
  expectedAmountMinor?: number;
};

type CuerpoVenta = {
  items?: unknown[];
  payments?: {
    method: string;
    amountMinor: number;
    cashSessionId?: string;
  }[];
};

const sumar = (valor: string, delta: bigint) =>
  (BigInt(valor || "0") + delta).toString();

/** Sesión que abrió esta PC sin conexión y todavía no llegó. */
function sesionLocal(op: OperacionCaja): CashSession {
  const fondo = String(op.openingAmountMinor ?? 0);
  return {
    id: op.clientOperationId,
    cashRegisterId: op.cashRegisterId!,
    openedAt: op.occurredAt,
    closedAt: null,
    openedByCurrentUser: true,
    openingAmountMinor: fondo,
    closingAmountMinor: null,
    cashSalesMinor: "0",
    saleChangeMinor: "0",
    cardMinor: "0",
    transferMinor: "0",
    manualInMinor: "0",
    manualOutMinor: "0",
    expectedAmountMinor: fondo,
    differenceMinor: null,
    movements: [],
    cashPayments: [],
  };
}

/**
 * Sesiones abiertas como las vería el servidor si ya hubiera recibido lo
 * pendiente de la PC (de cualquier usuario) para esta sucursal.
 */
export function aplicarCajaLocal(
  sesiones: readonly CashSession[],
  bandeja: readonly VentaPendiente[],
  organizationId: string,
  branchId: string,
): CashSession[] {
  const pendientes = bandeja
    .filter(
      (item) =>
        item.estado === "PENDIENTE" &&
        item.organizationId === organizationId &&
        item.branchId === branchId,
    )
    .sort(
      (a, b) =>
        a.occurredAt.localeCompare(b.occurredAt) || a.id.localeCompare(b.id),
    );
  if (!pendientes.length) return [...sesiones];
  const porId = new Map<string, CashSession>(
    sesiones.map((sesion) => [
      sesion.id,
      {
        ...sesion,
        movements: [...sesion.movements],
        cashPayments: [...(sesion.cashPayments ?? [])],
      },
    ]),
  );
  // Una apertura sin conexión de una caja que ya figura abierta apunta a esa.
  const alias = new Map<string, string>();
  const real = (id: string | undefined) =>
    id ? (alias.get(id) ?? id) : undefined;
  for (const item of pendientes) {
    if (item.operacion === "CAJA") {
      const op = item.cuerpo as OperacionCaja;
      if (op.tipo === "APERTURA") {
        const abierta = [...porId.values()].find(
          (sesion) =>
            sesion.cashRegisterId === op.cashRegisterId && !sesion.closedAt,
        );
        if (abierta) alias.set(op.clientOperationId, abierta.id);
        else porId.set(op.clientOperationId, sesionLocal(op));
        continue;
      }
      const sesion = porId.get(real(op.sessionId)!);
      if (!sesion || sesion.closedAt) continue;
      if (op.tipo === "MOVIMIENTO") {
        const monto = BigInt(op.amountMinor ?? 0);
        sesion.movements.push({
          id: op.clientOperationId,
          type: op.type!,
          amountMinor: monto.toString(),
          reason: op.reason ?? "",
          createdAt: op.occurredAt,
          actorName: item.actorName ?? item.alcance,
        });
        if (op.type === "IN") {
          sesion.manualInMinor = sumar(sesion.manualInMinor, monto);
          sesion.expectedAmountMinor = sumar(sesion.expectedAmountMinor, monto);
        } else {
          sesion.manualOutMinor = sumar(sesion.manualOutMinor, monto);
          sesion.expectedAmountMinor = sumar(
            sesion.expectedAmountMinor,
            -monto,
          );
        }
      } else {
        sesion.closedAt = op.occurredAt;
        sesion.closingAmountMinor = String(op.closingAmountMinor ?? 0);
      }
      continue;
    }
    // Cobro de cuenta corriente (SISTEMA-70): el efectivo entra a la caja como
    // un ingreso, igual que en el servidor.
    if (item.operacion === "CUENTA") {
      const op = item.cuerpo as {
        tipo: string;
        cuerpo: {
          amountMinor: number;
          method: string;
          cashSessionId?: string;
          payments?: { method: string; amountMinor: number }[];
        };
      };
      if (op.tipo !== "COBRO") continue;
      const sesion = porId.get(real(op.cuerpo.cashSessionId) ?? "");
      const efectivo = BigInt(
        op.cuerpo.payments
          ? (op.cuerpo.payments.find((p) => p.method === "CASH")?.amountMinor ??
              0)
          : op.cuerpo.method === "CASH"
            ? op.cuerpo.amountMinor
            : 0,
      );
      if (!sesion || sesion.closedAt || efectivo <= 0n) continue;
      sesion.movements.push({
        id: item.id,
        type: "IN",
        amountMinor: efectivo.toString(),
        reason: "Cobro cuenta corriente · sin conexión",
        createdAt: item.occurredAt,
        actorName: item.actorName ?? item.alcance,
      });
      sesion.manualInMinor = sumar(sesion.manualInMinor, efectivo);
      sesion.expectedAmountMinor = sumar(sesion.expectedAmountMinor, efectivo);
      continue;
    }
    // Las compras y las altas de clientes no tocan la caja.
    if (item.operacion) continue;
    // Venta sin enviar: suma sus cobros a la caja donde se cobró.
    const pagos = (item.cuerpo as CuerpoVenta).payments ?? [];
    const sesion = porId.get(
      real(pagos.find((pago) => pago.cashSessionId)?.cashSessionId) ?? "",
    );
    if (!sesion || sesion.closedAt) continue;
    const total = BigInt(item.totalMinor);
    const de = (metodo: string) =>
      pagos
        .filter((pago) => pago.method === metodo)
        .reduce((suma, pago) => suma + BigInt(pago.amountMinor), 0n);
    const pagado = pagos.reduce(
      (suma, pago) => suma + BigInt(pago.amountMinor),
      0n,
    );
    const efectivo = de("CASH");
    const vuelto = pagado > total ? pagado - total : 0n;
    // Para "Últimos movimientos": la venta en efectivo, neta de vuelto.
    if (efectivo > 0n)
      (sesion.cashPayments ??= []).push({
        id: item.id,
        saleId: item.id,
        amountMinor: (efectivo - vuelto).toString(),
        createdAt: item.occurredAt,
        actorName: item.actorName ?? item.alcance,
      });
    sesion.cashSalesMinor = sumar(sesion.cashSalesMinor, efectivo);
    sesion.saleChangeMinor = sumar(sesion.saleChangeMinor, vuelto);
    sesion.cardMinor = sumar(sesion.cardMinor, de("CARD"));
    sesion.transferMinor = sumar(sesion.transferMinor, de("TRANSFER"));
    sesion.expectedAmountMinor = sumar(
      sesion.expectedAmountMinor,
      efectivo - vuelto,
    );
  }
  return [...porId.values()].filter((sesion) => !sesion.closedAt);
}

/** ¿Hay que guardar la operación en la PC en lugar de mandarla? */
export function cajaSinConexion(token: string, enLinea: boolean) {
  return !enLinea || token === TOKEN_SIN_CONEXION;
}

/**
 * Guarda en la bandeja de la PC una apertura, movimiento o cierre hecho sin
 * conexión, firmado por quien lo hace: se manda solo al volver internet, en
 * orden con las ventas, aunque para entonces haya otra persona en la PC.
 */
export async function guardarOperacionCaja(
  organizationId: string,
  branchId: string,
  datos: Omit<OperacionCaja, "clientOperationId" | "occurredAt" | "deviceId">,
): Promise<OperacionCaja> {
  const sesion = await leerSesion();
  if (!sesion) throw new Error("No hay una sesión abierta en esta PC.");
  const op: OperacionCaja = {
    ...datos,
    clientOperationId: crypto.randomUUID(),
    occurredAt: ahoraSegunServidor().toISOString(),
    deviceId: idDeEstaPc(),
  };
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
    totalMinor: String(
      op.amountMinor ?? op.closingAmountMinor ?? op.openingAmountMinor ?? 0,
    ),
    documentType: "INTERNAL",
    cuerpo: op,
    unidades: [],
    estado: "PENDIENTE",
    intentos: 0,
    operacion: "CAJA",
    actorName:
      sesion.perfil.organizations.find(
        (membresia) => membresia.organizationId === organizationId,
      )?.displayName || sesion.perfil.email,
    ...(vendedorId && firma ? { vendedorId, payload, firma } : {}),
  });
  return op;
}

/**
 * Último cierre hecho en la PC y todavía no enviado, de esa caja: la tarjeta
 * "Último cierre" lo muestra hasta que llegue al servidor (SISTEMA-67).
 */
/** La caja de un cierre; si no la trae, la de la apertura de esa sesión. */
function cajaDelCierre(bandeja: readonly VentaPendiente[], op: OperacionCaja) {
  if (op.cashRegisterId) return op.cashRegisterId;
  const apertura = bandeja.find(
    (item) =>
      item.operacion === "CAJA" &&
      (item.cuerpo as OperacionCaja).tipo === "APERTURA" &&
      item.id === op.sessionId,
  );
  return (apertura?.cuerpo as OperacionCaja | undefined)?.cashRegisterId;
}

export function ultimoCierreLocal(
  bandeja: readonly VentaPendiente[],
  organizationId: string,
  branchId: string,
  cashRegisterId: string,
): CashClosure | undefined {
  const cierre = bandeja
    .filter(
      (item) =>
        item.operacion === "CAJA" &&
        item.estado === "PENDIENTE" &&
        item.organizationId === organizationId &&
        item.branchId === branchId &&
        (item.cuerpo as OperacionCaja).tipo === "CIERRE" &&
        cajaDelCierre(bandeja, item.cuerpo as OperacionCaja) === cashRegisterId,
    )
    .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))[0];
  if (!cierre) return undefined;
  const op = cierre.cuerpo as OperacionCaja;
  const contado = BigInt(op.closingAmountMinor ?? 0);
  const esperado = BigInt(op.expectedAmountMinor ?? 0);
  return {
    id: op.sessionId!,
    cashRegisterId,
    cashRegisterName: "",
    openedAt: op.occurredAt,
    closedAt: op.occurredAt,
    openingAmountMinor: "0",
    closingAmountMinor: contado.toString(),
    cashSalesMinor: "0",
    saleChangeMinor: "0",
    cardMinor: "0",
    transferMinor: "0",
    manualInMinor: "0",
    manualOutMinor: "0",
    expectedAmountMinor: esperado.toString(),
    differenceMinor: (contado - esperado).toString(),
    movements: [],
    closedBy: cierre.actorName ?? cierre.alcance,
    sinEnviar: true,
  };
}
