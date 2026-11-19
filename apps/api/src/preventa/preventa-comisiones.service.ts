import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { Prisma } from "@prisma/client";

import { PrismaService } from "../prisma/prisma.service";
import { accesoPreventa, exigir, nombresDeUsuarios } from "./preventa-comun";
import { comisionMinor, porcentajeDelPedido } from "./preventa-reglas";

/** Fecha civil (AAAA-MM-DD) de Argentina al instante UTC de su inicio. */
const inicioDelDia = (fecha: string) => new Date(`${fecha}T03:00:00.000Z`);
const finDelDia = (fecha: string) =>
  new Date(inicioDelDia(fecha).getTime() + 86_400_000);

/**
 * Comisiones de los preventistas y resumen de la preventa (SISTEMA-108).
 * La comisión sale de los pedidos entregados: total × porcentaje. El
 * porcentaje es el del pedido (puesto a mano) o el del preventista hasta que
 * se paga; al pagarla queda fijo en el pedido.
 */
@Injectable()
export class PreventaComisionesService {
  constructor(private readonly prisma: PrismaService) {}

  async comisiones(
    actorId: string,
    organizationId: string,
    filtro: { desde?: string; hasta?: string; vendedorId?: string },
  ) {
    const acceso = await accesoPreventa(this.prisma, actorId, organizationId);
    exigir(acceso, "vender");
    const vendedorId = acceso.administrar ? filtro.vendedorId : actorId;
    const pedidos = await this.prisma.preventaOrder.findMany({
      where: {
        organizationId,
        status: "DELIVERED",
        ...(vendedorId ? { sellerId: vendedorId } : {}),
        ...(filtro.desde || filtro.hasta
          ? {
              deliveredAt: {
                ...(filtro.desde ? { gte: inicioDelDia(filtro.desde) } : {}),
                ...(filtro.hasta ? { lt: finDelDia(filtro.hasta) } : {}),
              },
            }
          : {}),
      },
      orderBy: { deliveredAt: "desc" },
      take: 1000,
      include: {
        customer: { select: { name: true } },
        commissionPayment: { select: { createdAt: true } },
      },
    });
    const tasas = await this.prisma.preventaSeller.findMany({
      where: { organizationId },
      select: { userId: true, commissionRateBps: true },
    });
    const tasaDe = new Map(tasas.map((t) => [t.userId, t]));
    const nombres = await nombresDeUsuarios(
      this.prisma,
      organizationId,
      pedidos.map((p) => p.sellerId),
    );
    const grupos = new Map<
      string,
      {
        sellerId: string;
        sellerName: string;
        commissionRateBps: number;
        pendienteMinor: bigint;
        pagadoMinor: bigint;
        sinPorcentaje: number;
        pedidos: ReturnType<typeof filaDePedido>[];
      }
    >();
    for (const pedido of pedidos) {
      const grupo = grupos.get(pedido.sellerId) ?? {
        sellerId: pedido.sellerId,
        sellerName: nombres.get(pedido.sellerId) ?? "Preventista",
        commissionRateBps: tasaDe.get(pedido.sellerId)?.commissionRateBps ?? 0,
        pendienteMinor: 0n,
        pagadoMinor: 0n,
        sinPorcentaje: 0,
        pedidos: [],
      };
      const fila = filaDePedido(pedido, tasaDe.get(pedido.sellerId));
      if (fila.pagada) grupo.pagadoMinor += fila.comision;
      else grupo.pendienteMinor += fila.comision;
      if (fila.origen === "SIN_PORCENTAJE") grupo.sinPorcentaje += 1;
      grupo.pedidos.push(fila);
      grupos.set(pedido.sellerId, grupo);
    }
    const vendedores = [...grupos.values()].sort((a, b) =>
      a.sellerName.localeCompare(b.sellerName, "es"),
    );
    return {
      pendienteMinor: vendedores
        .reduce((s, v) => s + v.pendienteMinor, 0n)
        .toString(),
      pagadoMinor: vendedores
        .reduce((s, v) => s + v.pagadoMinor, 0n)
        .toString(),
      vendedores: vendedores.map((v) => ({
        sellerId: v.sellerId,
        sellerName: v.sellerName,
        commissionRateBps: v.commissionRateBps,
        pendienteMinor: v.pendienteMinor.toString(),
        pagadoMinor: v.pagadoMinor.toString(),
        sinPorcentaje: v.sinPorcentaje,
        pedidos: v.pedidos.map((p) => ({
          ...p,
          comision: undefined,
          commissionMinor: p.comision.toString(),
        })),
      })),
    };
  }

  /** Porcentaje de un pedido puesto a mano (null: vuelve al del preventista). */
  async cambiarComisionDelPedido(
    actorId: string,
    organizationId: string,
    orderId: string,
    commissionRateBps: number | null,
  ) {
    const acceso = await accesoPreventa(this.prisma, actorId, organizationId);
    exigir(acceso, "administrar");
    if (
      commissionRateBps !== null &&
      (!Number.isInteger(commissionRateBps) ||
        commissionRateBps < 0 ||
        commissionRateBps > 10_000)
    )
      throw new BadRequestException("La comisión va de 0 % a 100 %.");
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "PreventaOrder" WHERE id = ${orderId}::uuid FOR UPDATE`;
      const pedido = await tx.preventaOrder.findFirst({
        where: { id: orderId, organizationId },
      });
      if (!pedido) throw new NotFoundException("No encontramos ese pedido.");
      if (pedido.commissionPaymentId)
        throw new ConflictException(
          "La comisión de este pedido ya se pagó: no se cambia.",
        );
      await tx.preventaOrder.update({
        where: { id: orderId },
        data: { commissionRateBps },
      });
      await tx.auditLog.create({
        data: {
          organizationId,
          branchId: pedido.branchId,
          actorId,
          entityType: "PreventaOrder",
          entityId: orderId,
          action: "PREVENTA_ORDER_COMMISSION_UPDATED",
          before: { commissionRateBps: pedido.commissionRateBps },
          after: { commissionRateBps },
        },
      });
      return { orderId, commissionRateBps };
    });
  }

  /**
   * Pagar la comisión de pedidos entregados de un preventista. Fija el
   * porcentaje en cada pedido y los agrupa en un pago. No mueve la caja: el
   * egreso, si sale de la caja, se registra en Caja.
   */
  async pagar(
    actorId: string,
    organizationId: string,
    datos: {
      requestId: string;
      sellerId: string;
      orderIds: string[];
      note?: string | null;
    },
  ) {
    const acceso = await accesoPreventa(this.prisma, actorId, organizationId);
    exigir(acceso, "administrar");
    const ids = [...new Set(datos.orderIds)].sort();
    if (!ids.length) throw new BadRequestException("Elegí al menos un pedido.");
    return this.prisma.$transaction(async (tx) => {
      const repetido = await tx.preventaCommissionPayment.findUnique({
        where: {
          organizationId_requestId: {
            organizationId,
            requestId: datos.requestId,
          },
        },
      });
      if (repetido) return this.serializarPago(repetido);
      await tx.$queryRaw`SELECT id FROM "PreventaOrder" WHERE id = ANY(${ids}::uuid[]) ORDER BY id FOR UPDATE`;
      const pedidos = await tx.preventaOrder.findMany({
        where: { id: { in: ids }, organizationId },
      });
      if (pedidos.length !== ids.length)
        throw new NotFoundException("Algún pedido no es de la farmacia.");
      if (
        pedidos.some(
          (p) =>
            p.sellerId !== datos.sellerId ||
            p.status !== "DELIVERED" ||
            p.commissionPaymentId,
        )
      )
        throw new ConflictException(
          "Algún pedido ya se pagó, no está entregado o es de otro preventista. Actualizá y volvé a intentarlo.",
        );
      const vendedor = await tx.preventaSeller.findUnique({
        where: {
          organizationId_userId: { organizationId, userId: datos.sellerId },
        },
      });
      const filas = pedidos.map((p) => {
        const { rateBps } = porcentajeDelPedido(p, vendedor);
        return {
          id: p.id,
          rateBps,
          comision: comisionMinor(p.totalMinor, rateBps),
        };
      });
      const total = filas.reduce((s, f) => s + f.comision, 0n);
      const pago = await tx.preventaCommissionPayment.create({
        data: {
          organizationId,
          sellerId: datos.sellerId,
          amountMinor: total,
          orderCount: filas.length,
          note: datos.note?.trim().slice(0, 300) || null,
          actorId,
          requestId: datos.requestId,
        },
      });
      for (const fila of filas)
        await tx.preventaOrder.update({
          where: { id: fila.id },
          data: {
            commissionRateBps: fila.rateBps,
            commissionPaymentId: pago.id,
          },
        });
      await tx.auditLog.create({
        data: {
          organizationId,
          actorId,
          entityType: "PreventaCommissionPayment",
          entityId: pago.id,
          action: "PREVENTA_COMMISSION_PAID",
          after: {
            sellerId: datos.sellerId,
            amountMinor: total.toString(),
            orders: filas.map((f) => ({
              id: f.id,
              rateBps: f.rateBps,
              commissionMinor: f.comision.toString(),
            })),
          },
        },
      });
      return this.serializarPago(pago);
    });
  }

  private serializarPago(
    pago: Prisma.PreventaCommissionPaymentGetPayload<object>,
  ) {
    return {
      id: pago.id,
      sellerId: pago.sellerId,
      amountMinor: pago.amountMinor.toString(),
      orderCount: pago.orderCount,
      createdAt: pago.createdAt.toISOString(),
    };
  }

  /**
   * Resumen de un período: pedidos, montos, cobro, clientes, por
   * preventista y productos más pedidos. Sin los cancelados. Quien no
   * administra ve sólo lo suyo.
   */
  async resumen(
    actorId: string,
    organizationId: string,
    filtro: { desde: string; hasta: string },
  ) {
    const acceso = await accesoPreventa(this.prisma, actorId, organizationId);
    exigir(acceso, "vender");
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(filtro.desde) ||
      !/^\d{4}-\d{2}-\d{2}$/.test(filtro.hasta)
    )
      throw new BadRequestException("Elegí las fechas del resumen.");
    const where: Prisma.PreventaOrderWhereInput = {
      organizationId,
      status: { not: "CANCELLED" },
      createdAt: {
        gte: inicioDelDia(filtro.desde),
        lt: finDelDia(filtro.hasta),
      },
      ...(acceso.administrar ? {} : { sellerId: actorId }),
    };
    const pedidos = await this.prisma.preventaOrder.findMany({
      where,
      select: {
        id: true,
        sellerId: true,
        customerId: true,
        status: true,
        totalMinor: true,
        paidMinor: true,
        createdAt: true,
      },
    });
    const ids = pedidos.map((p) => p.id);
    const productos = ids.length
      ? await this.prisma.preventaOrderItem.groupBy({
          by: ["productId", "productName"],
          where: { orderId: { in: ids } },
          _sum: { quantity: true, totalMinor: true },
          orderBy: { _sum: { totalMinor: "desc" } },
          take: 10,
        })
      : [];
    const nombres = await nombresDeUsuarios(
      this.prisma,
      organizationId,
      pedidos.map((p) => p.sellerId),
    );
    const total = pedidos.reduce((s, p) => s + p.totalMinor, 0n);
    const entregados = pedidos.filter((p) => p.status === "DELIVERED");
    const porVendedor = new Map<
      string,
      { pedidos: number; totalMinor: bigint; clientes: Set<string> }
    >();
    const porDia = new Map<string, { pedidos: number; totalMinor: bigint }>();
    for (const p of pedidos) {
      const v = porVendedor.get(p.sellerId) ?? {
        pedidos: 0,
        totalMinor: 0n,
        clientes: new Set<string>(),
      };
      v.pedidos += 1;
      v.totalMinor += p.totalMinor;
      v.clientes.add(p.customerId);
      porVendedor.set(p.sellerId, v);
      const dia = new Date(p.createdAt.getTime() - 3 * 3_600_000)
        .toISOString()
        .slice(0, 10);
      const d = porDia.get(dia) ?? { pedidos: 0, totalMinor: 0n };
      d.pedidos += 1;
      d.totalMinor += p.totalMinor;
      porDia.set(dia, d);
    }
    return {
      pedidos: pedidos.length,
      totalMinor: total.toString(),
      promedioMinor: pedidos.length
        ? (total / BigInt(pedidos.length)).toString()
        : "0",
      clientes: new Set(pedidos.map((p) => p.customerId)).size,
      entregados: entregados.length,
      entregadoMinor: entregados
        .reduce((s, p) => s + p.totalMinor, 0n)
        .toString(),
      cobradoMinor: entregados.reduce((s, p) => s + p.paidMinor, 0n).toString(),
      porCobrarMinor: entregados
        .reduce((s, p) => s + (p.totalMinor - p.paidMinor), 0n)
        .toString(),
      pendientes: pedidos.filter((p) => p.status !== "DELIVERED").length,
      porVendedor: [...porVendedor.entries()]
        .map(([sellerId, v]) => ({
          sellerId,
          sellerName: nombres.get(sellerId) ?? "Preventista",
          pedidos: v.pedidos,
          totalMinor: v.totalMinor.toString(),
          clientes: v.clientes.size,
        }))
        .sort((a, b) => (BigInt(b.totalMinor) > BigInt(a.totalMinor) ? 1 : -1)),
      porDia: [...porDia.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([dia, d]) => ({
          dia,
          pedidos: d.pedidos,
          totalMinor: d.totalMinor.toString(),
        })),
      productos: productos.map((p) => ({
        productId: p.productId,
        productName: p.productName,
        cantidad: p._sum.quantity ?? 0,
        totalMinor: (p._sum.totalMinor ?? 0n).toString(),
      })),
    };
  }
}

function filaDePedido(
  pedido: Prisma.PreventaOrderGetPayload<{
    include: {
      customer: { select: { name: true } };
      commissionPayment: { select: { createdAt: true } };
    };
  }>,
  vendedor: { commissionRateBps: number } | undefined,
) {
  const { rateBps, origen } = porcentajeDelPedido(pedido, vendedor);
  return {
    orderId: pedido.id,
    number: pedido.number,
    customerName: pedido.customer.name,
    deliveredAt: pedido.deliveredAt?.toISOString() ?? null,
    totalMinor: pedido.totalMinor.toString(),
    rateBps,
    origen,
    pagada: Boolean(pedido.commissionPaymentId),
    pagadaEl: pedido.commissionPayment?.createdAt.toISOString() ?? null,
    comision: comisionMinor(pedido.totalMinor, rateBps),
  };
}
