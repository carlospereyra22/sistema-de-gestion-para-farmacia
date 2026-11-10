import type {
  CustomerAccountMovement,
  AccountItems,
  AccountReceipt,
  AccountSaleDetail,
  CustomerAccount,
  CustomerBilling,
  ItemAllocation,
  Party,
} from "./api";
import type { AccountDueDates, AccountDueRow } from "./account-due-dates";
import type { AccountStatementCustomer } from "./account-statement";
import { guardarVentaPendiente, type VentaPendiente } from "./bandeja-ventas";
import { leerSesion } from "./cache-local";
import { firmarVenta } from "./firma-ventas";
import { ahoraSegunServidor, idDeEstaPc } from "./venta-sin-conexion";

// Cuenta corriente sin conexión (SISTEMA-70). Cobros, asignaciones, aumentos
// de deuda, actualización de precios, configuración de la cuenta y alta de
// clientes hechos sin internet quedan en la bandeja de la PC y se mandan solos
// al volver, en orden con las ventas y la caja. Mientras tanto, las consultas
// de cuenta corriente parten de la copia del servidor y les suman lo pendiente
// de la PC: se ve lo mismo que vería el servidor si ya lo hubiera recibido.

export type TipoOperacionCuenta =
  | "COBRO"
  | "ASIGNACION"
  | "AUMENTO_DEUDA"
  | "AUMENTO_DEUDA_TOTAL"
  | "ACTUALIZAR_PRECIOS"
  | "CONFIGURAR";

/** Renglón de una venta hecha sin conexión: la PC no conoce sus ids reales. */
export type LineaSinConexion = {
  saleId: string;
  productId?: string;
  description?: string;
};

export type ImputacionSinConexion = {
  saleItemId?: string;
  linea?: LineaSinConexion;
  amountMinor: number;
  expectedPendingMinor?: number;
  nextPendingMinor?: number;
};

export type CuerpoCobro = {
  amountMinor: number;
  method: "CASH" | "CARD" | "TRANSFER" | "OTHER";
  payments?: { method: "CASH" | "CARD" | "TRANSFER"; amountMinor: number }[];
  note?: string;
  cashSessionId?: string;
  imputaciones?: ImputacionSinConexion[];
};

export type OperacionCuenta = {
  tipo: TipoOperacionCuenta;
  clientOperationId: string;
  occurredAt: string;
  deviceId: string;
  customerId: string;
  cuerpo: Record<string, unknown>;
};

export type CuerpoCliente = {
  name: string;
  document?: string;
  priceListId?: string;
  billing?: CustomerBilling;
};

export type OperacionCliente = {
  clientOperationId: string;
  occurredAt: string;
  deviceId: string;
  cuerpo: CuerpoCliente;
};

/** Edición de un cliente hecha sin conexión: sólo los campos que cambiaron. */
export type CuerpoEdicionCliente = CustomerBilling & {
  name?: string;
  priceListId?: string | null;
};

export type EdicionCliente = {
  tipo: "EDICION";
  customerId: string;
  clientOperationId: string;
  occurredAt: string;
  deviceId: string;
  cuerpo: CuerpoEdicionCliente;
};

/** Lo que la PC sabe de la operación y el servidor no necesita. */
export type DetalleLocal = {
  /** Cuánto cambia lo que debe cada venta (para Vencimientos). */
  ventas?: { saleId: string; deltaMinor: string }[];
  /** Comprobante provisorio del cobro. */
  recibo?: AccountReceipt;
};

// --- Renglones de ventas hechas sin conexión ---

const PREFIJO_LINEA = "linea|";

/** Id con el que la PC nombra el renglón de una venta que todavía no llegó. */
export function idDeLinea(linea: LineaSinConexion) {
  return `${PREFIJO_LINEA}${linea.saleId}|${
    linea.productId ? `p:${linea.productId}` : `d:${linea.description ?? ""}`
  }`;
}

export function lineaDeId(id: string): LineaSinConexion | undefined {
  if (!id.startsWith(PREFIJO_LINEA)) return undefined;
  const [saleId, resto = ""] = id.slice(PREFIJO_LINEA.length).split(/\|(.*)/s);
  if (!saleId) return undefined;
  return resto.startsWith("p:")
    ? { saleId, productId: resto.slice(2) }
    : { saleId, description: resto.slice(2) };
}

/** Las imputaciones de la pantalla, en el formato de la operación sin conexión. */
export function aImputaciones(
  allocations: readonly ItemAllocation[],
): ImputacionSinConexion[] {
  return allocations.map((item) => {
    const linea = lineaDeId(item.saleItemId);
    const { saleItemId, ...resto } = item;
    return linea ? { ...resto, linea } : { ...resto, saleItemId };
  });
}

const idDeImputacion = (imp: ImputacionSinConexion) =>
  imp.saleItemId ?? (imp.linea ? idDeLinea(imp.linea) : "");

type LineaVenta = {
  productId?: string;
  productName?: string;
  description?: string;
  quantity: number;
  unitPriceMinor?: number | string;
  expectedUnitPriceMinor?: number | string;
  requestedUnitPriceMinor?: number | string;
  discountMinor?: number | string;
};
type CuerpoVenta = {
  customerId?: string;
  items?: LineaVenta[];
  payments?: { method: string; amountMinor: number | string }[];
};

type VentaACuenta = {
  saleId: string;
  customerId: string;
  branchId: string;
  occurredAt: string;
  totalMinor: bigint;
  aCuentaMinor: bigint;
  lineas: {
    saleItemId: string;
    productId: string | null;
    description: string | null;
    name: string;
    quantity: number;
    unitMinor: bigint;
    subtotalMinor: bigint;
  }[];
};

/** Venta sin enviar con una parte a cuenta corriente, o undefined. */
export function ventaACuenta(item: VentaPendiente): VentaACuenta | undefined {
  if (item.operacion) return undefined;
  const cuerpo = item.cuerpo as CuerpoVenta;
  const aCuenta = (cuerpo.payments ?? [])
    .filter((pago) => pago.method === "ACCOUNT")
    .reduce((suma, pago) => suma + BigInt(pago.amountMinor), 0n);
  if (!cuerpo.customerId || aCuenta <= 0n) return undefined;
  const lineas = new Map<string, VentaACuenta["lineas"][number]>();
  for (const linea of cuerpo.items ?? []) {
    const unit = BigInt(
      linea.requestedUnitPriceMinor ??
        linea.expectedUnitPriceMinor ??
        linea.unitPriceMinor ??
        0,
    );
    const subtotal =
      unit * BigInt(linea.quantity) - BigInt(linea.discountMinor ?? 0);
    const ref: LineaSinConexion = linea.productId
      ? { saleId: item.id, productId: linea.productId }
      : { saleId: item.id, description: linea.description ?? "" };
    const id = idDeLinea(ref);
    const previa = lineas.get(id);
    lineas.set(id, {
      saleItemId: id,
      productId: linea.productId ?? null,
      description: linea.productId ? null : (linea.description ?? ""),
      name: linea.productName ?? linea.description ?? "Producto",
      quantity: (previa?.quantity ?? 0) + linea.quantity,
      unitMinor: unit,
      subtotalMinor: (previa?.subtotalMinor ?? 0n) + subtotal,
    });
  }
  return {
    saleId: item.id,
    customerId: cuerpo.customerId,
    branchId: item.branchId,
    occurredAt: item.occurredAt,
    totalMinor: BigInt(item.totalMinor),
    aCuentaMinor: aCuenta,
    lineas: [...lineas.values()],
  };
}

/** Lo pendiente de la PC para la farmacia, de lo más viejo a lo más nuevo. */
function pendientesDe(bandeja: readonly VentaPendiente[], org: string) {
  return bandeja
    .filter(
      (item) => item.estado === "PENDIENTE" && item.organizationId === org,
    )
    .sort(
      (a, b) =>
        a.occurredAt.localeCompare(b.occurredAt) || a.id.localeCompare(b.id),
    );
}

const opDe = (item: VentaPendiente) =>
  item.operacion === "CUENTA" ? (item.cuerpo as OperacionCuenta) : undefined;
const clienteDe = (item: VentaPendiente) =>
  item.operacion === "CLIENTE" &&
  (item.cuerpo as { tipo?: string }).tipo !== "EDICION"
    ? (item.cuerpo as OperacionCliente)
    : undefined;
const edicionDe = (item: VentaPendiente) =>
  item.operacion === "CLIENTE" &&
  (item.cuerpo as { tipo?: string }).tipo === "EDICION"
    ? (item.cuerpo as EdicionCliente)
    : undefined;

/** Los campos de la ficha que cambia una edición, como los guarda el servidor. */
function camposEditados(edicion: EdicionCliente) {
  const { name, priceListId, ...billing } = edicion.cuerpo;
  const campos: Partial<Party> = {};
  for (const [clave, valor] of Object.entries(billing))
    if (valor !== undefined)
      (campos as Record<string, unknown>)[clave] =
        typeof valor === "string" ? valor.trim() || null : valor;
  if (name !== undefined) campos.name = name.trim();
  if (priceListId !== undefined) campos.priceListId = priceListId || null;
  return campos;
}

/**
 * ¿Lo que se haga con este cliente tiene que esperar en la PC? Sí, si ya tiene
 * algo sin enviar: así llega en orden (un cobro no puede llegar antes que la
 * venta que cobra, ni la cuenta de un cliente antes que su alta).
 */
export function clienteConPendientes(
  bandeja: readonly VentaPendiente[],
  org: string,
  customerId: string,
) {
  return pendientesDe(bandeja, org).some(
    (item) =>
      clienteDe(item)?.clientOperationId === customerId ||
      edicionDe(item)?.customerId === customerId ||
      opDe(item)?.customerId === customerId ||
      ventaACuenta(item)?.customerId === customerId,
  );
}

// --- Fórmulas iguales a las del servidor ---

/** Aumento por precio sólo sobre lo pendiente (accounts/price-adjustment.ts). */
export function aumentoPorPrecio(
  pendiente: bigint,
  anterior: bigint,
  nuevo: bigint,
) {
  return pendiente > 0n && anterior > 0n && nuevo > anterior
    ? (pendiente * (nuevo - anterior) + anterior / 2n) / anterior
    : 0n;
}

/** Reparte un aumento total como el servidor (total-debt-increase.ts). */
export function repartirAumento(
  renglones: readonly { saleItemId: string; pendingMinor: string }[],
  aumento: bigint,
) {
  const ordenados = [...renglones]
    .filter((r) => BigInt(r.pendingMinor) > 0n)
    .sort((a, b) => a.saleItemId.localeCompare(b.saleItemId));
  const suma = ordenados.reduce((s, r) => s + BigInt(r.pendingMinor), 0n);
  if (suma === 0n) return [];
  let acumulado = 0n;
  let asignado = 0n;
  return ordenados.map((r) => {
    acumulado += BigInt(r.pendingMinor);
    const objetivo = (aumento * acumulado + suma / 2n) / suma;
    const parte = objetivo - asignado;
    asignado = objetivo;
    return { saleItemId: r.saleItemId, amountMinor: parte };
  });
}

const DIA_MS = 86_400_000;
function fechaArgentina(instante: Date) {
  const partes = new Intl.DateTimeFormat("en", {
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(instante);
  const parte = (tipo: string) => partes.find((p) => p.type === tipo)!.value;
  return `${parte("year")}-${parte("month")}-${parte("day")}`;
}

// --- Artículos pendientes de un cliente ---

type Renglon = AccountItems["items"][number];

const vacio = (): AccountItems => ({
  balanceMinor: "0",
  items: [],
  unassignedReceipts: [],
  mixedSales: [],
});

/** Los artículos de un cliente, con lo hecho en la PC que todavía no llegó. */
export function itemsConPendientes(
  base: AccountItems | undefined,
  bandeja: readonly VentaPendiente[],
  org: string,
  customerId: string,
): AccountItems {
  const r: AccountItems = structuredClone(base ?? vacio());
  let saldo = BigInt(r.balanceMinor);
  const renglon = (id: string) => r.items.find((i) => i.saleItemId === id);
  const sumar = (fila: Renglon, campo: keyof Renglon, delta: bigint) => {
    (fila[campo] as string) = (
      BigInt(fila[campo] as string) + delta
    ).toString();
  };
  const cobrar = (imputaciones: readonly ImputacionSinConexion[]) => {
    for (const imp of imputaciones) {
      const fila = renglon(idDeImputacion(imp));
      if (!fila) continue;
      if (imp.expectedPendingMinor !== undefined) {
        const delta =
          BigInt(imp.nextPendingMinor ?? imp.amountMinor) -
          BigInt(fila.pendingMinor);
        sumar(fila, "financedMinor", delta);
        sumar(fila, "pendingMinor", delta);
        saldo += delta;
      }
      const pendiente = BigInt(fila.pendingMinor);
      const parte =
        BigInt(imp.amountMinor) < pendiente
          ? BigInt(imp.amountMinor)
          : pendiente;
      sumar(fila, "pendingMinor", -parte);
      sumar(fila, "paidMinor", parte);
    }
  };
  for (const item of pendientesDe(bandeja, org)) {
    const venta = ventaACuenta(item);
    if (venta) {
      if (venta.customerId !== customerId) continue;
      if (
        r.items.some((i) => i.saleId === venta.saleId) ||
        r.mixedSales.some((m) => m.saleId === venta.saleId)
      )
        continue;
      saldo += venta.aCuentaMinor;
      if (venta.aCuentaMinor === venta.totalMinor)
        for (const linea of venta.lineas)
          r.items.push({
            saleItemId: linea.saleItemId,
            saleId: venta.saleId,
            productId: linea.productId,
            description: linea.description,
            comparable: false,
            name: linea.name,
            quantity: linea.quantity,
            financedMinor: linea.subtotalMinor.toString(),
            paidMinor: "0",
            pendingMinor: linea.subtotalMinor.toString(),
            createdAt: venta.occurredAt,
            previousPriceMinor: linea.unitMinor.toString(),
            referencePriceMinor: null,
            referenceCheckedAt: null,
            increaseMinor: "0",
            porEnviar: true,
          });
      else
        r.mixedSales.push({
          saleId: venta.saleId,
          movementId: venta.saleId,
          financedMinor: venta.aCuentaMinor.toString(),
          items: venta.lineas.map((linea) => ({
            saleItemId: linea.saleItemId,
            name: linea.name,
            quantity: linea.quantity,
            subtotalMinor: linea.subtotalMinor.toString(),
          })),
        });
      continue;
    }
    const op = opDe(item);
    if (!op || op.customerId !== customerId) continue;
    if (op.tipo === "COBRO") {
      const c = op.cuerpo as CuerpoCobro;
      saldo -= BigInt(c.amountMinor);
      if (c.imputaciones?.length) cobrar(c.imputaciones);
      else
        r.unassignedReceipts.push({
          id: op.clientOperationId,
          amountMinor: String(c.amountMinor),
          createdAt: op.occurredAt,
        });
    } else if (op.tipo === "ASIGNACION") {
      const c = op.cuerpo as {
        movementId: string;
        imputaciones: ImputacionSinConexion[];
      };
      const suelto = r.unassignedReceipts.findIndex(
        (u) => u.id === c.movementId,
      );
      const mixta = r.mixedSales.findIndex(
        (m) => m.saleId === c.movementId || m.movementId === c.movementId,
      );
      if (suelto >= 0) {
        r.unassignedReceipts.splice(suelto, 1);
        cobrar(c.imputaciones);
      } else if (mixta >= 0) {
        // Asignación inicial de una venta mixta: cada artículo queda con lo
        // que se financió de él.
        const [venta] = r.mixedSales.splice(mixta, 1);
        for (const imp of c.imputaciones) {
          const id = idDeImputacion(imp);
          const original = venta!.items.find((i) => i.saleItemId === id);
          if (!original) continue;
          r.items.push({
            saleItemId: id,
            saleId: venta!.saleId,
            productId: imp.linea?.productId ?? null,
            description: imp.linea?.description ?? null,
            comparable: false,
            name: original.name,
            quantity: original.quantity,
            financedMinor: String(imp.amountMinor),
            paidMinor: "0",
            pendingMinor: String(imp.amountMinor),
            createdAt: op.occurredAt,
            previousPriceMinor: "0",
            referencePriceMinor: null,
            referenceCheckedAt: null,
            increaseMinor: "0",
            porEnviar: true,
          });
        }
      }
    } else if (op.tipo === "AUMENTO_DEUDA") {
      const c = op.cuerpo as {
        destino: { saleItemId?: string; linea?: LineaSinConexion };
        expectedPendingMinor: number;
        nextPendingMinor: number;
      };
      const fila = renglon(
        c.destino.saleItemId ??
          (c.destino.linea ? idDeLinea(c.destino.linea) : ""),
      );
      const delta = BigInt(c.nextPendingMinor - c.expectedPendingMinor);
      if (fila) {
        sumar(fila, "financedMinor", delta);
        sumar(fila, "pendingMinor", delta);
      }
      saldo += delta;
    } else if (op.tipo === "AUMENTO_DEUDA_TOTAL") {
      const c = op.cuerpo as {
        expectedPendingMinor: number;
        nextPendingMinor: number;
      };
      const delta = BigInt(c.nextPendingMinor - c.expectedPendingMinor);
      for (const parte of repartirAumento(r.items, delta)) {
        const fila = renglon(parte.saleItemId)!;
        sumar(fila, "financedMinor", parte.amountMinor);
        sumar(fila, "pendingMinor", parte.amountMinor);
      }
      saldo += delta;
    } else if (op.tipo === "ACTUALIZAR_PRECIOS") {
      const c = op.cuerpo as {
        saleId: string;
        referencias: { productId: string; referencePriceMinor: number }[];
      };
      for (const fila of r.items) {
        const ref = c.referencias.find((x) => x.productId === fila.productId);
        if (
          !ref ||
          !fila.comparable ||
          (c.saleId !== "all" && fila.saleId !== c.saleId)
        )
          continue;
        const aumento = aumentoPorPrecio(
          BigInt(fila.pendingMinor),
          BigInt(fila.previousPriceMinor),
          BigInt(ref.referencePriceMinor),
        );
        if (aumento <= 0n) continue;
        sumar(fila, "financedMinor", aumento);
        sumar(fila, "pendingMinor", aumento);
        fila.previousPriceMinor = String(ref.referencePriceMinor);
        saldo += aumento;
      }
    }
  }
  // El aumento sugerido se recalcula con lo que debe hoy cada artículo.
  for (const fila of r.items)
    fila.increaseMinor =
      fila.comparable &&
      fila.referencePriceMinor &&
      !r.unassignedReceipts.length
        ? aumentoPorPrecio(
            BigInt(fila.pendingMinor),
            BigInt(fila.previousPriceMinor),
            BigInt(fila.referencePriceMinor),
          ).toString()
        : "0";
  r.balanceMinor = saldo.toString();
  return r;
}

// --- Movimientos y saldos de las cuentas ---

type Movimiento = CustomerAccountMovement;

/** Movimientos que tendría cada cliente con lo que todavía no llegó. */
function movimientosPendientes(
  bandeja: readonly VentaPendiente[],
  org: string,
) {
  const porCliente = new Map<string, (Movimiento & { branchId: string })[]>();
  const agregar = (customerId: string, m: Movimiento & { branchId: string }) =>
    porCliente.set(customerId, [...(porCliente.get(customerId) ?? []), m]);
  for (const item of pendientesDe(bandeja, org)) {
    const base = { porEnviar: true, branchId: item.branchId };
    const venta = ventaACuenta(item);
    if (venta) {
      agregar(venta.customerId, {
        ...base,
        id: `venta|${venta.saleId}`,
        type: "DEBIT",
        amountMinor: venta.aCuentaMinor.toString(),
        note: "Venta sin conexión",
        createdAt: venta.occurredAt,
        saleId: venta.saleId,
      });
      continue;
    }
    const op = opDe(item);
    if (!op) continue;
    const con = {
      ...base,
      createdAt: op.occurredAt,
      clientOperationId: op.clientOperationId,
    };
    if (op.tipo === "COBRO") {
      const c = op.cuerpo as CuerpoCobro;
      (c.imputaciones ?? []).forEach((imp, i) => {
        if (imp.expectedPendingMinor === undefined) return;
        const delta =
          (imp.nextPendingMinor ?? imp.amountMinor) - imp.expectedPendingMinor;
        if (!delta) return;
        agregar(op.customerId, {
          ...con,
          clientOperationId: undefined,
          id: `${op.clientOperationId}|ajuste|${i}`,
          type: delta > 0 ? "DEBIT" : "CREDIT",
          amountMinor: String(Math.abs(delta)),
          note: "Ajuste del importe final al cobrar",
          isDebtAdjustment: true,
          saleId: imp.linea?.saleId ?? null,
        });
      });
      agregar(op.customerId, {
        ...con,
        id: op.clientOperationId,
        type: "CREDIT",
        amountMinor: String(c.amountMinor),
        note: c.note?.trim() || "Cobro de cuenta corriente",
        paymentMethod: c.method,
        saleId: null,
      });
    } else if (
      op.tipo === "AUMENTO_DEUDA" ||
      op.tipo === "AUMENTO_DEUDA_TOTAL"
    ) {
      const c = op.cuerpo as {
        expectedPendingMinor: number;
        nextPendingMinor: number;
        reason: string;
      };
      agregar(op.customerId, {
        ...con,
        id: op.clientOperationId,
        type: "DEBIT",
        amountMinor: String(c.nextPendingMinor - c.expectedPendingMinor),
        note: `${op.tipo === "AUMENTO_DEUDA" ? "Aumento manual de deuda" : "Aumento total de deuda"} · ${c.reason}`,
        isDebtAdjustment: true,
        saleId: null,
      });
    } else if (op.tipo === "ACTUALIZAR_PRECIOS" && BigInt(item.totalMinor) > 0n)
      agregar(op.customerId, {
        ...con,
        id: op.clientOperationId,
        type: "DEBIT",
        amountMinor: item.totalMinor,
        note: "Ajuste por aumento de precios · Solo saldo pendiente",
        isPriceAdjustment: true,
        saleId: null,
      });
  }
  return porCliente;
}

const yaLlego = (movimientos: readonly Movimiento[], m: Movimiento) =>
  movimientos.some(
    (previo) =>
      (m.clientOperationId &&
        previo.clientOperationId === m.clientOperationId) ||
      (m.id.startsWith("venta|") &&
        previo.type === "DEBIT" &&
        previo.saleId === m.saleId),
  );

const delta = (m: Movimiento) =>
  m.type === "DEBIT" ? BigInt(m.amountMinor) : -BigInt(m.amountMinor);

/** Clientes con movimientos hechos en la PC que todavía no llegaron. */
export function clientesConMovimientosPendientes(
  bandeja: readonly VentaPendiente[],
  org: string,
) {
  return [...movimientosPendientes(bandeja, org).keys()];
}

/** Lo que la PC tiene por enviar de un cliente: su alta y sus movimientos. */
export function pendientesDelCliente(
  bandeja: readonly VentaPendiente[],
  org: string,
  customerId: string,
) {
  return pendientesDe(bandeja, org).filter(
    (item) =>
      clienteDe(item)?.clientOperationId === customerId ||
      opDe(item)?.customerId === customerId ||
      ventaACuenta(item)?.customerId === customerId,
  );
}

const sinSucursal = (m: Movimiento & { branchId: string }): Movimiento => {
  const movimiento: Movimiento & { branchId?: string } = { ...m };
  delete movimiento.branchId;
  return movimiento;
};

/** Los movimientos de un cliente con lo hecho en la PC que todavía no llegó. */
export function movimientosConPendientes(
  movimientos: readonly Movimiento[],
  bandeja: readonly VentaPendiente[],
  org: string,
  customerId: string,
): Movimiento[] {
  const r = [...movimientos];
  for (const m of movimientosPendientes(bandeja, org).get(customerId) ?? [])
    if (!yaLlego(r, m)) r.push(sinSucursal(m));
  return r;
}

/** Las cuentas corrientes con lo hecho en la PC que todavía no llegó. */
export function cuentasConPendientes(
  cuentas: readonly CustomerAccount[],
  bandeja: readonly VentaPendiente[],
  org: string,
): CustomerAccount[] {
  const r: CustomerAccount[] = structuredClone([...cuentas]);
  for (const item of pendientesDe(bandeja, org)) {
    const alta = clienteDe(item);
    if (alta && !r.some((c) => c.id === alta.clientOperationId))
      r.push({
        id: alta.clientOperationId,
        name: alta.cuerpo.name.trim(),
        document: alta.cuerpo.document?.trim() || null,
        billingTaxId: alta.cuerpo.billing?.billingTaxId || null,
        billingPhone: alta.cuerpo.billing?.billingPhone || null,
        creditEnabled: false,
        creditLimitMinor: "0",
        accountTermDays: null,
        active: true,
        balanceMinor: "0",
        movements: [],
        porEnviar: true,
      });
    const edicion = edicionDe(item);
    const editada = edicion && r.find((c) => c.id === edicion.customerId);
    if (edicion && editada) {
      const campos = camposEditados(edicion);
      if (campos.name !== undefined) editada.name = campos.name;
      if (campos.billingTaxId !== undefined)
        editada.billingTaxId = campos.billingTaxId;
      if (campos.billingPhone !== undefined)
        editada.billingPhone = campos.billingPhone;
    }
    const op = opDe(item);
    if (op?.tipo === "CONFIGURAR") {
      const cuenta = r.find((c) => c.id === op.customerId);
      const c = op.cuerpo as {
        enabled: boolean;
        creditLimitMinor: number | null;
        accountTermDays?: number | null;
      };
      if (cuenta) {
        cuenta.creditEnabled = c.enabled;
        cuenta.creditLimitMinor =
          c.creditLimitMinor === null ? null : String(c.creditLimitMinor);
        if (c.accountTermDays !== undefined)
          cuenta.accountTermDays = c.accountTermDays;
      }
    }
  }
  for (const [customerId, movimientos] of movimientosPendientes(bandeja, org)) {
    const cuenta = r.find((c) => c.id === customerId);
    if (!cuenta) continue;
    let saldo = BigInt(cuenta.balanceMinor);
    for (const m of movimientos) {
      // Sin los movimientos del servidor (SISTEMA-75) se cuenta lo pendiente.
      if (cuenta.movements && yaLlego(cuenta.movements, m)) continue;
      cuenta.movements?.push(sinSucursal(m));
      saldo += delta(m);
      cuenta.movementCount = (cuenta.movementCount ?? 0) + 1;
      if (
        m.type === "CREDIT" &&
        !m.saleId &&
        (!cuenta.lastPayment || m.createdAt >= cuenta.lastPayment.createdAt)
      )
        cuenta.lastPayment = {
          amountMinor: m.amountMinor,
          createdAt: m.createdAt,
        };
    }
    cuenta.balanceMinor = saldo.toString();
  }
  return r.sort((a, b) => a.name.localeCompare(b.name, "es"));
}

/** Clientes con los dados de alta en la PC que todavía no llegaron. */
export function clientesConPendientes(
  clientes: readonly Party[],
  bandeja: readonly VentaPendiente[],
  org: string,
): Party[] {
  const r = [...clientes];
  for (const item of pendientesDe(bandeja, org)) {
    const edicion = edicionDe(item);
    if (edicion) {
      const i = r.findIndex((c) => c.id === edicion.customerId);
      if (i >= 0)
        r[i] = { ...r[i]!, ...camposEditados(edicion), porEnviar: true };
      continue;
    }
    const alta = clienteDe(item);
    if (!alta || r.some((c) => c.id === alta.clientOperationId)) continue;
    r.push({
      ...(alta.cuerpo.billing ?? {}),
      id: alta.clientOperationId,
      name: alta.cuerpo.name.trim(),
      document: alta.cuerpo.document?.trim() || null,
      priceListId: alta.cuerpo.priceListId ?? null,
      active: true,
      porEnviar: true,
    });
  }
  return r.sort((a, b) => a.name.localeCompare(b.name, "es"));
}

/** Estado de cuenta de la sucursal con lo que todavía no llegó. */
export function estadoConPendientes(
  clientes: readonly AccountStatementCustomer[],
  bandeja: readonly VentaPendiente[],
  org: string,
  branchId: string,
  cuentas: readonly CustomerAccount[] = [],
): AccountStatementCustomer[] {
  const r: AccountStatementCustomer[] = structuredClone([...clientes]);
  for (const [customerId, movimientos] of movimientosPendientes(bandeja, org)) {
    const propios = movimientos.filter((m) => m.branchId === branchId);
    if (!propios.length) continue;
    let cliente = r.find((c) => c.id === customerId);
    if (!cliente) {
      const cuenta = cuentas.find((c) => c.id === customerId);
      if (!cuenta) continue;
      cliente = {
        id: customerId,
        name: cuenta.name,
        document: cuenta.document ?? null,
        billingTaxId: cuenta.billingTaxId ?? null,
        billingPhone: cuenta.billingPhone ?? null,
        movements: [],
      };
      r.push(cliente);
    }
    let saldo = BigInt(
      cliente.movements.at(-1)?.balanceMinor ??
        cliente.openingBalanceMinor ??
        "0",
    );
    for (const m of propios) {
      if (
        cliente.movements.some(
          (previo) =>
            previo.id === m.clientOperationId ||
            (m.id.startsWith("venta|") &&
              previo.type === "DEBIT" &&
              previo.saleId === m.saleId),
        )
      )
        continue;
      saldo += delta(m);
      cliente.movements.push({
        id: m.id,
        createdAt: m.createdAt,
        type: m.type,
        amountMinor: m.amountMinor,
        balanceMinor: saldo.toString(),
        note: m.note,
        saleId: m.saleId ?? null,
        showInStatement:
          m.type === "CREDIT"
            ? !m.saleId && !m.isDebtAdjustment
            : Boolean(m.saleId) && !m.isDebtAdjustment && !m.isPriceAdjustment,
      });
    }
  }
  return r;
}

/** Vencimientos de la sucursal con lo que todavía no llegó. */
export function vencimientosConPendientes(
  base: AccountDueDates,
  bandeja: readonly VentaPendiente[],
  org: string,
  branchId: string,
  cuentas: readonly CustomerAccount[] = [],
): AccountDueDates {
  const filas: AccountDueRow[] = structuredClone(base.rows);
  for (const item of pendientesDe(bandeja, org)) {
    const venta = ventaACuenta(item);
    if (venta) {
      if (
        venta.branchId !== branchId ||
        filas.some((f) => f.saleId === venta.saleId)
      )
        continue;
      const cuenta = cuentas.find((c) => c.id === venta.customerId);
      const dias = cuenta?.accountTermDays;
      const vence =
        dias == null
          ? null
          : new Date(
              Date.parse(
                `${fechaArgentina(new Date(venta.occurredAt))}T00:00:00Z`,
              ) +
                dias * DIA_MS,
            );
      const diferencia = vence
        ? Math.round(
            (Date.parse(`${base.today}T00:00:00Z`) - vence.getTime()) / DIA_MS,
          )
        : 0;
      const mixta = venta.aCuentaMinor !== venta.totalMinor;
      filas.push({
        saleId: venta.saleId,
        customerId: venta.customerId,
        customerName: cuenta?.name ?? "Cliente",
        saleDate: venta.occurredAt,
        dueDate: vence ? vence.toISOString().slice(0, 10) : null,
        pendingMinor: mixta ? null : venta.aCuentaMinor.toString(),
        daysOverdue: Math.max(0, diferencia),
        status: mixta
          ? "REVIEW"
          : !vence
            ? "UNDATED"
            : diferencia > 0
              ? "OVERDUE"
              : diferencia === 0
                ? "TODAY"
                : "UPCOMING",
        reviewReason: mixta
          ? "Venta con pago mixto: asigná los artículos financiados."
          : null,
      });
      continue;
    }
    for (const cambio of item.local?.ventas ?? []) {
      if (
        item.branchId !== branchId &&
        !filas.some((f) => f.saleId === cambio.saleId)
      )
        continue;
      const fila = filas.find((f) => f.saleId === cambio.saleId);
      if (!fila || fila.pendingMinor === null) continue;
      fila.pendingMinor = (
        BigInt(fila.pendingMinor) + BigInt(cambio.deltaMinor)
      ).toString();
    }
  }
  return {
    ...base,
    rows: filas.filter(
      (f) => f.pendingMinor === null || BigInt(f.pendingMinor) > 0n,
    ),
  };
}

/** Detalle de una venta a cuenta que todavía no llegó. */
export function detalleDeVentaLocal(
  bandeja: readonly VentaPendiente[],
  movementId: string,
): AccountSaleDetail | undefined {
  if (!movementId.startsWith("venta|")) return undefined;
  const saleId = movementId.slice("venta|".length);
  const item = bandeja.find((v) => v.id === saleId && !v.operacion);
  const venta = item ? ventaACuenta(item) : undefined;
  if (!venta) return undefined;
  const cuerpo = item!.cuerpo as CuerpoVenta;
  return {
    id: venta.saleId,
    status: "COMPLETED",
    completedAt: venta.occurredAt,
    totalMinor: venta.totalMinor.toString(),
    accountAmountMinor: venta.aCuentaMinor.toString(),
    items: (cuerpo.items ?? []).map((linea, i) => {
      const unit = BigInt(
        linea.requestedUnitPriceMinor ??
          linea.expectedUnitPriceMinor ??
          linea.unitPriceMinor ??
          0,
      );
      const descuento = BigInt(linea.discountMinor ?? 0);
      return {
        id: `${saleId}|${i}`,
        name: linea.productName ?? linea.description ?? "Producto",
        quantity: linea.quantity,
        unitPriceMinor: unit.toString(),
        discountMinor: descuento.toString(),
        subtotalMinor: (unit * BigInt(linea.quantity) - descuento).toString(),
      };
    }),
  };
}

/** Comprobante provisorio de un cobro que todavía no llegó. */
export function reciboLocal(
  bandeja: readonly VentaPendiente[],
  receiptId: string,
): AccountReceipt | undefined {
  return bandeja.find(
    (item) => item.operacion === "CUENTA" && item.id === receiptId,
  )?.local?.recibo;
}

// --- Guardar en la bandeja ---

async function guardar(
  organizationId: string,
  branchId: string,
  operacion: "CUENTA" | "CLIENTE",
  op: OperacionCuenta | OperacionCliente | EdicionCliente,
  totalMinor: string,
  local?: DetalleLocal,
) {
  const sesion = await leerSesion();
  if (!sesion) throw new Error("No hay una sesión abierta en esta PC.");
  const payload = JSON.stringify(op);
  const vendedorId = sesion.perfil.id;
  const firma = vendedorId
    ? await firmarVenta(sesion.alcance, payload).catch(() => undefined)
    : undefined;
  const actorName =
    sesion.perfil.organizations.find(
      (membresia) => membresia.organizationId === organizationId,
    )?.displayName || sesion.perfil.email;
  // El comprobante provisorio lleva quién cobró, como el del servidor.
  if (local?.recibo && !local.recibo.cashier) local.recibo.cashier = actorName;
  await guardarVentaPendiente({
    version: 1,
    id: op.clientOperationId,
    alcance: sesion.alcance,
    organizationId,
    branchId,
    occurredAt: op.occurredAt,
    totalMinor,
    documentType: "INTERNAL",
    cuerpo: op,
    unidades: [],
    estado: "PENDIENTE",
    intentos: 0,
    operacion,
    actorName,
    ...(local ? { local } : {}),
    ...(vendedorId && firma ? { vendedorId, payload, firma } : {}),
  });
  return { actorName };
}

/**
 * Guarda una operación de cuenta corriente hecha sin conexión, firmada por
 * quien la hace, con la hora del servidor.
 */
export async function guardarOperacionCuenta(
  organizationId: string,
  branchId: string,
  datos: {
    tipo: TipoOperacionCuenta;
    customerId: string;
    cuerpo: Record<string, unknown>;
    clientOperationId?: string;
    totalMinor?: string;
    local?: DetalleLocal;
  },
) {
  const op: OperacionCuenta = {
    tipo: datos.tipo,
    clientOperationId: datos.clientOperationId ?? crypto.randomUUID(),
    occurredAt: ahoraSegunServidor().toISOString(),
    deviceId: idDeEstaPc(),
    customerId: datos.customerId,
    cuerpo: datos.cuerpo,
  };
  const { actorName } = await guardar(
    organizationId,
    branchId,
    "CUENTA",
    op,
    datos.totalMinor ?? "0",
    datos.local,
  );
  return { op, actorName };
}

/** Guarda el alta de un cliente hecha sin conexión: su id es el de la PC. */
export async function guardarAltaCliente(
  organizationId: string,
  branchId: string,
  cuerpo: CuerpoCliente,
) {
  const op: OperacionCliente = {
    clientOperationId: crypto.randomUUID(),
    occurredAt: ahoraSegunServidor().toISOString(),
    deviceId: idDeEstaPc(),
    cuerpo,
  };
  await guardar(organizationId, branchId, "CLIENTE", op, "0");
  return op;
}

/** Guarda la edición de un cliente hecha sin conexión (lista, facturación, contacto). */
export async function guardarEdicionCliente(
  organizationId: string,
  branchId: string,
  customerId: string,
  cuerpo: CuerpoEdicionCliente,
) {
  const op: EdicionCliente = {
    tipo: "EDICION",
    customerId,
    clientOperationId: crypto.randomUUID(),
    occurredAt: ahoraSegunServidor().toISOString(),
    deviceId: idDeEstaPc(),
    cuerpo,
  };
  await guardar(organizationId, branchId, "CLIENTE", op, "0");
  return op;
}

/** Nombre de la operación para mostrar en el panel de sincronización. */
export function operacionCuentaTexto(item: VentaPendiente) {
  const edicion = edicionDe(item);
  if (edicion) return "Edición de cliente";
  if (item.operacion === "CLIENTE")
    return `Alta de cliente · ${(item.cuerpo as OperacionCliente).cuerpo.name}`;
  const op = item.cuerpo as OperacionCuenta;
  return {
    COBRO: "Cobro de cuenta corriente",
    ASIGNACION: "Asignación de cobro",
    AUMENTO_DEUDA: "Aumento de deuda",
    AUMENTO_DEUDA_TOTAL: "Aumento total de deuda",
    ACTUALIZAR_PRECIOS: "Actualización de precios",
    CONFIGURAR: "Configuración de la cuenta",
  }[op.tipo];
}
