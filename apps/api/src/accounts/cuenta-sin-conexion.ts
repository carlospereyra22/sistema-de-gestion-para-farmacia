import type { AvisoSinConexion } from "../common/offline/registro-sin-conexion";
import type { ItemAllocation } from "./item-allocations";
import { priceIncrease } from "./price-adjustment";

// Cuenta corriente sin conexión (SISTEMA-70). Lo que se le cobró al cliente es
// definitivo: al sincronizar se registra con el importe cobrado aunque el saldo
// haya cambiado mientras tanto, y lo que no encaja queda como aviso.

export type TipoOperacionCuenta =
  | "COBRO"
  | "ASIGNACION"
  | "AUMENTO_DEUDA"
  | "AUMENTO_DEUDA_TOTAL"
  | "ACTUALIZAR_PRECIOS"
  | "CONFIGURAR";

export const KIND_CUENTA: Record<TipoOperacionCuenta, string> = {
  COBRO: "ACCOUNT_RECEIPT",
  ASIGNACION: "ACCOUNT_ASSIGN",
  AUMENTO_DEUDA: "ACCOUNT_DEBT_INCREASE",
  AUMENTO_DEUDA_TOTAL: "ACCOUNT_TOTAL_DEBT_INCREASE",
  ACTUALIZAR_PRECIOS: "ACCOUNT_PRICE_UPDATE",
  CONFIGURAR: "ACCOUNT_CONFIGURE",
};

/**
 * Renglón de una venta hecha sin conexión: la PC no conoce los ids de sus
 * renglones (el servidor los parte por lote), así que lo nombra por la venta y
 * el producto (o la descripción de un concepto).
 */
export type LineaSinConexion = {
  saleId: string;
  productId?: string;
  description?: string;
};

/** Destino de un importe: un renglón conocido o un renglón de venta sin conexión. */
export type DestinoSinConexion = {
  saleItemId?: string;
  linea?: LineaSinConexion;
};

export type ImputacionSinConexion = DestinoSinConexion & {
  amountMinor: number;
  expectedPendingMinor?: number;
  nextPendingMinor?: number;
};

type Base = {
  /** Id de la operación en la PC; también es el del movimiento que crea. */
  clientOperationId: string;
  occurredAt: string;
  deviceId: string;
  customerId: string;
};

/** Operación de cuenta corriente hecha sin conexión, con el cuerpo de su tipo. */
export type OperacionCuentaSinConexion = Base &
  (
    | {
        tipo: "COBRO";
        cuerpo: {
          amountMinor: number;
          method: "CASH" | "CARD" | "TRANSFER" | "OTHER";
          payments?: {
            method: "CASH" | "CARD" | "TRANSFER";
            amountMinor: number;
          }[];
          note?: string;
          cashSessionId?: string;
          imputaciones?: ImputacionSinConexion[];
        };
      }
    | {
        tipo: "ASIGNACION";
        /** El cobro: su id o, si se hizo sin conexión, su clave de operación. */
        cuerpo: { movementId: string; imputaciones: ImputacionSinConexion[] };
      }
    | {
        tipo: "AUMENTO_DEUDA";
        cuerpo: {
          destino: DestinoSinConexion;
          expectedPendingMinor: number;
          nextPendingMinor: number;
          reason: string;
        };
      }
    | {
        tipo: "AUMENTO_DEUDA_TOTAL";
        cuerpo: {
          expectedPendingMinor: number;
          nextPendingMinor: number;
          reason: string;
        };
      }
    | {
        tipo: "ACTUALIZAR_PRECIOS";
        /** El precio de referencia que vio la PC para cada producto. */
        cuerpo: {
          saleId: string;
          referencias: { productId: string; referencePriceMinor: number }[];
        };
      }
    | {
        tipo: "CONFIGURAR";
        cuerpo: {
          enabled: boolean;
          creditLimitMinor: number | null;
          accountTermDays?: number | null;
        };
      }
  );

export type RenglonCuenta = {
  saleItemId: string;
  saleId: string;
  productId: string | null;
  description: string | null;
  name: string;
  pendingMinor: string;
};

export type AjusteSinConexion = {
  saleItemId: string;
  before: bigint;
  after: bigint;
  delta: bigint;
};

/** Renglones a los que apunta un destino, en orden estable. */
export function renglonesDe<T extends RenglonCuenta>(
  destino: DestinoSinConexion,
  renglones: readonly T[],
): T[] {
  if (destino.saleItemId)
    return renglones.filter((r) => r.saleItemId === destino.saleItemId);
  const linea = destino.linea;
  if (!linea) return [];
  return renglones.filter(
    (r) =>
      r.saleId === linea.saleId &&
      (linea.productId
        ? r.productId === linea.productId
        : r.productId === null &&
          r.description === (linea.description ?? null)),
  );
}

/**
 * Reparte `total` en proporción a `pesos` (el último absorbe el redondeo). Si
 * todos los pesos son cero, va entero al primero.
 */
export function repartir(total: bigint, pesos: readonly bigint[]): bigint[] {
  if (!pesos.length) return [];
  const suma = pesos.reduce((a, b) => a + b, 0n);
  if (suma === 0n) return pesos.map((_, i) => (i === 0 ? total : 0n));
  let asignado = 0n;
  let acumulado = 0n;
  return pesos.map((peso) => {
    acumulado += peso;
    const objetivo = (total * acumulado + suma / 2n) / suma;
    const parte = objetivo - asignado;
    asignado = objetivo;
    return parte;
  });
}

const etiqueta = (renglones: readonly RenglonCuenta[]) =>
  renglones[0]?.name ?? "Artículo";

/**
 * Cobro sin conexión imputado a artículos. Para cada artículo:
 * - si debe lo mismo que vio la PC, se imputa y se ajusta como con conexión;
 * - si subió después (aumento, actualización de precios), el ajuste respeta el
 *   importe cobrado: el artículo queda en lo que acordó la PC;
 * - si ya se cobró una parte en otro lado, se imputa hasta lo que debe y no se
 *   ajusta. Lo que no entra queda como sobrante (saldo a favor) con aviso.
 */
export function resolverImputaciones(
  entradas: readonly ImputacionSinConexion[],
  renglones: readonly RenglonCuenta[],
) {
  const pendiente = new Map(
    renglones.map((r) => [r.saleItemId, BigInt(r.pendingMinor)]),
  );
  const imputado = new Map<string, bigint>();
  const ajustes: AjusteSinConexion[] = [];
  const avisos: AvisoSinConexion[] = [];
  let sobrante = 0n;
  for (const entrada of entradas) {
    const destino = renglonesDe(entrada, renglones);
    const importe = BigInt(entrada.amountMinor);
    const actual = destino.map((r) => pendiente.get(r.saleItemId) ?? 0n);
    const total = actual.reduce((a, b) => a + b, 0n);
    if (!destino.length || total === 0n) {
      sobrante += importe;
      avisos.push({
        kind: "SALDO_DISTINTO",
        detail: {
          articulo: etiqueta(destino),
          motivo: "El artículo ya no tenía saldo: el importe quedó a favor.",
          cobradoMinor: importe.toString(),
        },
      });
      continue;
    }
    let disponibles = actual;
    if (entrada.expectedPendingMinor !== undefined) {
      const esperado = BigInt(entrada.expectedPendingMinor);
      const acordado = BigInt(entrada.nextPendingMinor ?? entrada.amountMinor);
      if (total >= esperado) {
        // El saldo que acordó la PC manda: un aumento posterior no se suma a
        // lo que ya se cobró.
        disponibles = repartir(acordado, actual);
        destino.forEach((r, i) => {
          if (disponibles[i] !== actual[i])
            ajustes.push({
              saleItemId: r.saleItemId,
              before: actual[i]!,
              after: disponibles[i]!,
              delta: disponibles[i]! - actual[i]!,
            });
        });
        if (total !== esperado)
          avisos.push({
            kind: "SALDO_DISTINTO",
            detail: {
              articulo: etiqueta(destino),
              motivo:
                "El saldo subió después del cobro: se respetó el importe cobrado.",
              esperadoMinor: esperado.toString(),
              encontradoMinor: total.toString(),
              acordadoMinor: acordado.toString(),
            },
          });
      } else
        avisos.push({
          kind: "SALDO_DISTINTO",
          detail: {
            articulo: etiqueta(destino),
            motivo:
              "Ya se había cobrado una parte en otro lado: no se aplicó el ajuste.",
            esperadoMinor: esperado.toString(),
            encontradoMinor: total.toString(),
          },
        });
    }
    let resto = importe;
    destino.forEach((r, i) => {
      const parte = resto < disponibles[i]! ? resto : disponibles[i]!;
      if (parte > 0n)
        imputado.set(r.saleItemId, (imputado.get(r.saleItemId) ?? 0n) + parte);
      pendiente.set(r.saleItemId, disponibles[i]! - parte);
      resto -= parte;
    });
    if (resto > 0n) {
      sobrante += resto;
      if (entrada.expectedPendingMinor === undefined)
        avisos.push({
          kind: "SALDO_DISTINTO",
          detail: {
            articulo: etiqueta(destino),
            motivo:
              "El artículo debía menos de lo cobrado: el resto quedó a favor.",
            cobradoMinor: importe.toString(),
            encontradoMinor: total.toString(),
          },
        });
    }
  }
  const allocations: ItemAllocation[] = [...imputado].map(
    ([saleItemId, amount]) => ({ saleItemId, amountMinor: Number(amount) }),
  );
  return { allocations, ajustes, avisos, sobrante };
}

/**
 * Aumento de deuda hecho sin conexión: se suma lo que la PC quiso aumentar
 * (la diferencia), sobre lo que el artículo debe hoy. Si el saldo cambió,
 * queda aviso.
 */
export function aumentoSinConexion(
  esperado: bigint,
  pedido: bigint,
  actual: bigint,
) {
  const delta = pedido - esperado;
  return { delta, siguiente: actual + delta, cambio: actual !== esperado };
}

/**
 * Actualización de precios hecha sin conexión: el aumento se calcula con el
 * precio de referencia que vio la PC, pero sobre lo que el cliente debe hoy.
 * Lo ya cobrado nunca se toca.
 */
export function aumentoPorPrecio(
  pendienteActual: bigint,
  precioAnterior: bigint,
  referenciaVista: bigint,
) {
  return priceIncrease(pendienteActual, precioAnterior, referenciaVista);
}
