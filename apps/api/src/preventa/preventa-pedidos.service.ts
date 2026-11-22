import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma, type PaymentMethod } from "@prisma/client";

import { repartirEntrega } from "../catalogo-online/catalogo-reglas";
import { PrismaService } from "../prisma/prisma.service";
import { SalesService } from "../sales/sales.service";
import { armarCarrito, guardarOfertasDelPedido } from "./preventa-carrito";
import {
  accesoPreventa,
  ajustesPreventa,
  exigir,
  incluirPedido,
  listasDelCliente,
  nombresDeUsuarios,
  precioEnListas,
  serializarPedido,
  type AccesoPreventa,
  type PedidoCompleto,
} from "./preventa-comun";
import {
  accionPermitida,
  descuentoParaLaVenta,
  huellaPreventa,
  precioParaLaVenta,
  repartoDelCobro,
  unirRenglonesPreventa,
  type AccionPreventa,
  type EstadoPreventa,
  type RenglonPreventa,
} from "./preventa-reglas";

export type PedidoPreventaNuevo = {
  requestId: string;
  customerId: string;
  items: RenglonPreventa[];
  notes?: string | null;
};

export type FiltroPedidos = {
  estado?: EstadoPreventa;
  /** Varios estados juntos (pantalla Pedidos, SISTEMA-119). */
  estados?: readonly EstadoPreventa[];
  vendedorId?: string;
  repartidorId?: string;
  clienteId?: string;
  desde?: string;
  hasta?: string;
  /** Sólo los míos: los que tomé (preventista) o los que reparto. */
  mios?: boolean;
  /** Para el repartidor: pendientes sin asignar más los suyos en reparto. */
  paraRepartir?: boolean;
};

export type EntregaPreventa = {
  expectedStatus: EstadoPreventa;
  requestId: string;
  /** Lo que pagó el cliente al recibirlo (0 si nada). */
  collectedMinor: string;
  method?: "CASH" | "TRANSFER" | "CARD";
};

const MEDIOS: readonly PaymentMethod[] = ["CASH", "TRANSFER", "CARD"];
const CAMBIO_EN_CURSO =
  "El pedido cambió mientras lo mirabas. Actualizá y volvé a intentarlo.";

/** Fecha civil (AAAA-MM-DD) de Argentina al instante UTC de su inicio. */
function inicioDelDia(fecha: string): Date {
  return new Date(`${fecha}T03:00:00.000Z`);
}

/**
 * Pedidos de preventa (SISTEMA-108). El servidor pone precios, ofertas y
 * totales; la entrega hace lo que diga la configuración: nada, descontar
 * stock o registrar la venta con las reglas de Ventas.
 */
@Injectable()
export class PreventaPedidosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sales: SalesService,
  ) {}

  async crear(
    actorId: string,
    organizationId: string,
    datos: PedidoPreventaNuevo,
  ) {
    const acceso = await accesoPreventa(this.prisma, actorId, organizationId);
    exigir(acceso, "vender");
    const renglones = unirRenglonesPreventa(datos.items);
    if (!renglones.length)
      throw new BadRequestException("Agregá al menos un producto al pedido.");
    const notes = datos.notes?.trim().slice(0, 500) || null;
    const requestHash = huellaPreventa({
      customerId: datos.customerId,
      items: renglones,
      notes,
    });
    const repetido = await this.porRequestId(organizationId, datos.requestId);
    if (repetido) {
      if (repetido.requestHash !== requestHash)
        throw new ConflictException(
          "Este pedido ya se envió con otro contenido. Revisalo en Pedidos.",
        );
      return this.serializar(organizationId, repetido);
    }
    const cliente = await this.clienteVendible(
      acceso,
      organizationId,
      datos.customerId,
    );
    try {
      const creado = await this.prisma.$transaction(async (tx) => {
        const ajustes = await this.ajustesBloqueados(tx, organizationId);
        const listas = await listasDelCliente(
          tx,
          organizationId,
          cliente.priceListId,
        );
        const carrito = await armarCarrito(tx, {
          organizationId,
          ajustes,
          listas,
          renglones,
          puedeBajarPrecio: ajustes.sellerCanChangePrice || acceso.administrar,
          estricto: true,
          bloquear: true,
        });
        const { lastOrderNumber } = await tx.preventaSettings.update({
          where: { organizationId },
          data: { lastOrderNumber: { increment: 1 } },
          select: { lastOrderNumber: true },
        });
        const pedido = await tx.preventaOrder.create({
          data: {
            organizationId,
            branchId: ajustes.branchId,
            number: lastOrderNumber,
            customerId: cliente.id,
            sellerId: actorId,
            priceListId: listas.elegida,
            notes,
            deliveryAddress: cliente.direccion,
            totalMinor: carrito.totalMinor,
            requestId: datos.requestId,
            requestHash,
            items: { create: this.renglonesParaGuardar(carrito.items) },
          },
        });
        await guardarOfertasDelPedido(tx, organizationId, pedido.id, carrito);
        await tx.auditLog.create({
          data: {
            organizationId,
            branchId: ajustes.branchId,
            actorId,
            entityType: "PreventaOrder",
            entityId: pedido.id,
            action: "PREVENTA_ORDER_CREATED",
            after: {
              number: pedido.number,
              customerId: cliente.id,
              totalMinor: carrito.totalMinor.toString(),
              items: carrito.items.length,
            },
          },
        });
        return tx.preventaOrder.findUniqueOrThrow({
          where: { id: pedido.id },
          include: incluirPedido,
        });
      });
      return this.serializar(organizationId, creado);
    } catch (error) {
      // Dos envíos del mismo pedido a la vez (reintento sin señal).
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        const original = await this.porRequestId(
          organizationId,
          datos.requestId,
        );
        if (original?.requestHash === requestHash)
          return this.serializar(organizationId, original);
      }
      throw error;
    }
  }

  async listar(actorId: string, organizationId: string, filtro: FiltroPedidos) {
    const acceso = await accesoPreventa(this.prisma, actorId, organizationId);
    const where: Prisma.PreventaOrderWhereInput = {
      organizationId,
      ...(filtro.estado ? { status: filtro.estado } : {}),
      ...(filtro.estados ? { status: { in: [...filtro.estados] } } : {}),
      ...(filtro.clienteId ? { customerId: filtro.clienteId } : {}),
      ...(filtro.vendedorId ? { sellerId: filtro.vendedorId } : {}),
      ...(filtro.repartidorId ? { delivererId: filtro.repartidorId } : {}),
      ...(filtro.desde || filtro.hasta
        ? {
            createdAt: {
              ...(filtro.desde ? { gte: inicioDelDia(filtro.desde) } : {}),
              ...(filtro.hasta
                ? {
                    lt: new Date(
                      inicioDelDia(filtro.hasta).getTime() + 86_400_000,
                    ),
                  }
                : {}),
            },
          }
        : {}),
    };
    const alcance = this.alcance(acceso, filtro);
    const pedidos = await this.prisma.preventaOrder.findMany({
      where: { AND: [where, alcance] },
      orderBy: { createdAt: "desc" },
      take: 300,
      include: incluirPedido,
    });
    const nombres = await this.nombres(organizationId, pedidos);
    const vivos = pedidos.filter((p) => p.status !== "CANCELLED");
    return {
      items: pedidos.map((p) => serializarPedido(p, nombres)),
      resumen: {
        cantidad: vivos.length,
        totalMinor: vivos.reduce((s, p) => s + p.totalMinor, 0n).toString(),
        cobradoMinor: vivos.reduce((s, p) => s + p.paidMinor, 0n).toString(),
        pendientes: pedidos.filter((p) => p.status === "PENDING").length,
        enReparto: pedidos.filter((p) => p.status === "IN_DELIVERY").length,
      },
    };
  }

  /** Pedidos pendientes que el usuario ve, sin filtros (pantalla Pedidos). */
  async pendientes(actorId: string, organizationId: string) {
    const acceso = await accesoPreventa(this.prisma, actorId, organizationId);
    return this.prisma.preventaOrder.count({
      where: {
        AND: [{ organizationId, status: "PENDING" }, this.alcance(acceso, {})],
      },
    });
  }

  /** Lo que cada uno puede ver: quien administra todo; el resto, lo suyo. */
  private alcance(
    acceso: AccesoPreventa,
    filtro: FiltroPedidos,
  ): Prisma.PreventaOrderWhereInput {
    if (acceso.administrar && !filtro.mios && !filtro.paraRepartir) return {};
    const propios: Prisma.PreventaOrderWhereInput[] = [];
    if (acceso.vender && !filtro.paraRepartir)
      propios.push({ sellerId: acceso.actorId });
    if (acceso.repartir || (acceso.administrar && filtro.paraRepartir)) {
      propios.push({ delivererId: acceso.actorId });
      // Lo que todavía no tiene repartidor lo puede tomar cualquiera.
      if (!filtro.mios) propios.push({ status: "PENDING", delivererId: null });
    }
    return { OR: propios.length ? propios : [{ id: { in: [] } }] };
  }

  async detalle(actorId: string, organizationId: string, orderId: string) {
    const acceso = await accesoPreventa(this.prisma, actorId, organizationId);
    const pedido = await this.buscar(organizationId, orderId);
    this.exigirVer(acceso, pedido);
    return this.serializar(organizationId, pedido);
  }

  /** Editar un pedido pendiente: productos, cantidades, precios y nota. */
  async editar(
    actorId: string,
    organizationId: string,
    orderId: string,
    datos: {
      expectedUpdatedAt: string;
      items: RenglonPreventa[];
      notes?: string | null;
    },
  ) {
    const acceso = await accesoPreventa(this.prisma, actorId, organizationId);
    exigir(acceso, "vender");
    const renglones = unirRenglonesPreventa(datos.items);
    if (!renglones.length)
      throw new BadRequestException(
        "El pedido necesita al menos un producto. Si no va más, cancelalo.",
      );
    const actualizado = await this.prisma.$transaction(async (tx) => {
      const pedido = await this.bloquear(tx, organizationId, orderId);
      if (pedido.updatedAt.toISOString() !== datos.expectedUpdatedAt)
        throw new ConflictException(CAMBIO_EN_CURSO);
      if (!acceso.administrar && pedido.sellerId !== actorId)
        throw new ForbiddenException("Sólo podés editar tus pedidos.");
      this.exigirAccion(pedido.status, "editar");
      const ajustes = await ajustesPreventa(tx, organizationId);
      const listas = await listasDelCliente(
        tx,
        organizationId,
        pedido.priceListId,
      );
      const carrito = await armarCarrito(tx, {
        organizationId,
        ajustes: { ...ajustes, branchId: pedido.branchId },
        listas,
        renglones,
        puedeBajarPrecio: ajustes.sellerCanChangePrice || acceso.administrar,
        estricto: true,
        bloquear: true,
      });
      const antes = await tx.preventaOrderItem.findMany({
        where: { orderId },
      });
      // Un pedido pendiente es un borrador del cliente: sus renglones y la
      // foto de ofertas se reemplazan; el antes queda en la auditoría.
      const ofertasViejas = await tx.preventaOrderOffer.findMany({
        where: { orderId },
        select: { id: true },
      });
      await tx.preventaOrderOfferItem.deleteMany({
        where: { orderOfferId: { in: ofertasViejas.map((o) => o.id) } },
      });
      await tx.preventaOrderOffer.deleteMany({ where: { orderId } });
      await tx.preventaOrderItem.deleteMany({ where: { orderId } });
      await tx.preventaOrder.update({
        where: { id: orderId },
        data: {
          totalMinor: carrito.totalMinor,
          notes: datos.notes?.trim().slice(0, 500) || null,
          items: { create: this.renglonesParaGuardar(carrito.items) },
        },
      });
      await guardarOfertasDelPedido(tx, organizationId, orderId, carrito);
      await tx.auditLog.create({
        data: {
          organizationId,
          branchId: pedido.branchId,
          actorId,
          entityType: "PreventaOrder",
          entityId: orderId,
          action: "PREVENTA_ORDER_UPDATED",
          before: {
            totalMinor: pedido.totalMinor.toString(),
            items: antes.map((i) => ({
              productId: i.productId,
              quantity: i.quantity,
              unitPriceMinor: i.unitPriceMinor.toString(),
            })),
          },
          after: {
            totalMinor: carrito.totalMinor.toString(),
            items: carrito.items.map((i) => ({
              productId: i.productId,
              quantity: i.quantity,
              unitPriceMinor: i.unitPriceMinor.toString(),
            })),
          },
        },
      });
      return tx.preventaOrder.findUniqueOrThrow({
        where: { id: orderId },
        include: incluirPedido,
      });
    });
    return this.serializar(organizationId, actualizado);
  }

  async cancelar(
    actorId: string,
    organizationId: string,
    orderId: string,
    datos: { expectedStatus: EstadoPreventa; reason: string },
  ) {
    const acceso = await accesoPreventa(this.prisma, actorId, organizationId);
    const reason = datos.reason.trim().slice(0, 300);
    if (!reason) throw new BadRequestException("Contá por qué se cancela.");
    return this.cambiar(
      acceso,
      orderId,
      datos.expectedStatus,
      "cancelar",
      (pedido) => {
        // El preventista cancela lo suyo mientras no salió a reparto.
        if (
          !acceso.administrar &&
          !(pedido.sellerId === acceso.actorId && pedido.status === "PENDING")
        )
          throw new ForbiddenException(
            "Sólo podés cancelar tus pedidos que todavía no salieron a reparto.",
          );
        return {
          data: {
            status: "CANCELLED",
            cancelledAt: new Date(),
            cancelledById: acceso.actorId,
            cancelReason: reason,
          },
          accion: "PREVENTA_ORDER_CANCELLED",
          detalle: { reason },
        };
      },
    );
  }

  /**
   * Pasar pedidos a reparto con un repartidor. Quien administra asigna a
   * cualquiera; un repartidor sólo se los toma a sí mismo.
   */
  async asignar(
    actorId: string,
    organizationId: string,
    datos: { orderIds: string[]; delivererId: string },
  ) {
    const acceso = await accesoPreventa(this.prisma, actorId, organizationId);
    exigir(acceso, "repartir");
    if (!acceso.administrar && datos.delivererId !== actorId)
      throw new ForbiddenException("Sólo podés tomar pedidos para vos.");
    const ids = [...new Set(datos.orderIds)].sort();
    if (!ids.length) throw new BadRequestException("Elegí al menos un pedido.");
    const repartidor = await accesoPreventa(
      this.prisma,
      datos.delivererId,
      organizationId,
    ).catch(() => null);
    if (!repartidor?.repartir && !repartidor?.administrar)
      throw new BadRequestException(
        "Elegí a alguien con el rol de repartidor.",
      );
    return this.prisma.$transaction(async (tx) => {
      const ahora = new Date();
      for (const id of ids) {
        const pedido = await this.bloquear(tx, organizationId, id);
        this.exigirAccion(pedido.status, "asignar");
        if (
          !acceso.administrar &&
          pedido.delivererId &&
          pedido.delivererId !== actorId
        )
          throw new ConflictException(
            `El pedido ${pedido.number} ya lo tiene otro repartidor.`,
          );
        await tx.preventaOrder.update({
          where: { id },
          data: {
            status: "IN_DELIVERY",
            delivererId: datos.delivererId,
            assignedAt: ahora,
          },
        });
        await tx.auditLog.create({
          data: {
            organizationId,
            branchId: pedido.branchId,
            actorId,
            entityType: "PreventaOrder",
            entityId: id,
            action: "PREVENTA_ORDER_ASSIGNED",
            before: { status: pedido.status, delivererId: pedido.delivererId },
            after: { status: "IN_DELIVERY", delivererId: datos.delivererId },
          },
        });
      }
      return { asignados: ids.length };
    });
  }

  /** Vuelve a pendiente: lo saca del reparto o no se pudo entregar. */
  async devolverAPendiente(
    actorId: string,
    organizationId: string,
    orderId: string,
    datos: { expectedStatus: EstadoPreventa; note?: string | null },
    motivo: "quitarDelReparto" | "noEntregado",
  ) {
    const acceso = await accesoPreventa(this.prisma, actorId, organizationId);
    exigir(acceso, "repartir");
    const note = datos.note?.trim().slice(0, 300) || null;
    if (motivo === "noEntregado" && !note)
      throw new BadRequestException("Contá por qué no se pudo entregar.");
    return this.cambiar(
      acceso,
      orderId,
      datos.expectedStatus,
      motivo,
      (pedido) => {
        if (!acceso.administrar && pedido.delivererId !== actorId)
          throw new ForbiddenException("Ese pedido lo tiene otro repartidor.");
        return {
          data: {
            status: "PENDING",
            delivererId: null,
            assignedAt: null,
            ...(motivo === "noEntregado" ? { deliveryNote: note } : {}),
          },
          accion:
            motivo === "noEntregado"
              ? "PREVENTA_ORDER_NOT_DELIVERED"
              : "PREVENTA_ORDER_UNASSIGNED",
          detalle: { note },
        };
      },
    );
  }

  /**
   * Entregar el pedido y registrar lo que pagó el cliente. Según la
   * configuración de ese momento:
   * - NONE: sólo queda entregado.
   * - STOCK: descuenta el stock de la sucursal (lotes por vencimiento).
   * - SALE: registra la venta con las reglas de Ventas (stock, precios). Lo
   *   cobrado queda en Cobros pendientes de Caja hasta que la cajera lo
   *   incorpora; lo que falta va a la cuenta corriente del cliente.
   */
  async entregar(
    actorId: string,
    organizationId: string,
    orderId: string,
    datos: EntregaPreventa,
  ) {
    const acceso = await accesoPreventa(this.prisma, actorId, organizationId);
    exigir(acceso, "repartir");
    if (!/^\d{1,15}$/.test(datos.collectedMinor))
      throw new BadRequestException("Revisá el importe cobrado.");
    const cobradoPedido = BigInt(datos.collectedMinor);
    const method: PaymentMethod = datos.method ?? "CASH";
    if (!MEDIOS.includes(method))
      throw new BadRequestException("Elegí efectivo, transferencia o tarjeta.");
    const previo = await this.buscar(organizationId, orderId);
    // Reintento de una entrega que ya se registró.
    if (previo.status === "DELIVERED") {
      const mismo =
        previo.payments.some((p) => p.requestId === datos.requestId) ||
        (cobradoPedido === 0n && previo.deliveredById === actorId);
      if (mismo) return this.serializar(organizationId, previo);
      throw new ConflictException("Este pedido ya se entregó.");
    }
    if (previo.status !== datos.expectedStatus)
      throw new ConflictException(CAMBIO_EN_CURSO);
    this.exigirAccion(previo.status, "entregar");
    if (
      !acceso.administrar &&
      previo.delivererId &&
      previo.delivererId !== actorId
    )
      throw new ForbiddenException("Ese pedido lo tiene otro repartidor.");
    const ajustes = await ajustesPreventa(this.prisma, organizationId);
    const efecto = ajustes.deliveryEffect;
    let saleId: string | null = null;
    let renglonesVenta: Map<string, { unit: bigint; discount: bigint }> | null =
      null;
    let total = previo.totalMinor;
    if (efecto === "SALE") {
      const venta = await this.registrarVenta(
        actorId,
        previo,
        cobradoPedido,
        method,
      );
      saleId = venta.saleId;
      renglonesVenta = venta.renglones;
      total = venta.totalMinor;
    }
    const { cobradoMinor } = repartoDelCobro(total, cobradoPedido);
    const entregado = await this.prisma.$transaction(async (tx) => {
      const pedido = await this.bloquear(tx, organizationId, orderId);
      if (pedido.status !== datos.expectedStatus)
        throw new ConflictException(
          saleId
            ? `${CAMBIO_EN_CURSO} La venta ya quedó registrada: revisala en Ventas.`
            : CAMBIO_EN_CURSO,
        );
      const ahora = new Date();
      if (efecto === "STOCK")
        await this.descontarStock(tx, pedido, actorId, ahora);
      // Si la lista bajó, la venta cobró menos: el pedido queda igual a la venta.
      if (renglonesVenta)
        for (const item of await tx.preventaOrderItem.findMany({
          where: { orderId },
        })) {
          const venta = renglonesVenta.get(item.productId);
          if (
            venta &&
            (venta.unit !== item.unitPriceMinor ||
              venta.discount !== item.discountMinor)
          )
            await tx.preventaOrderItem.update({
              where: { id: item.id },
              data: {
                unitPriceMinor: venta.unit,
                listUnitPriceMinor:
                  venta.unit > item.listUnitPriceMinor
                    ? venta.unit
                    : item.listUnitPriceMinor,
                discountMinor: venta.discount,
                totalMinor: venta.unit * BigInt(item.quantity) - venta.discount,
              },
            });
        }
      if (cobradoMinor > 0n)
        await tx.preventaPayment.create({
          data: {
            organizationId,
            orderId,
            method,
            amountMinor: cobradoMinor,
            actorId,
            requestId: datos.requestId,
          },
        });
      await tx.preventaOrder.update({
        where: { id: orderId },
        data: {
          status: "DELIVERED",
          deliveredAt: ahora,
          deliveredById: actorId,
          delivererId: pedido.delivererId ?? actorId,
          deliveryEffect: efecto,
          saleId,
          totalMinor: total,
          paidMinor: { increment: cobradoMinor },
          ...(efecto === "STOCK" ? { stockDeductedAt: ahora } : {}),
          ...(efecto === "SALE" ? { stockDeductedAt: ahora } : {}),
        },
      });
      await tx.auditLog.create({
        data: {
          organizationId,
          branchId: pedido.branchId,
          actorId,
          entityType: "PreventaOrder",
          entityId: orderId,
          action: "PREVENTA_ORDER_DELIVERED",
          before: {
            status: pedido.status,
            totalMinor: pedido.totalMinor.toString(),
          },
          after: {
            status: "DELIVERED",
            effect: efecto,
            saleId,
            totalMinor: total.toString(),
            collectedMinor: cobradoMinor.toString(),
            method,
          },
        },
      });
      return tx.preventaOrder.findUniqueOrThrow({
        where: { id: orderId },
        include: incluirPedido,
      });
    });
    return this.serializar(organizationId, entregado);
  }

  /**
   * La venta del pedido, con Ventas como autoridad. El id del pedido es la
   * clave de reintento: entregar dos veces no registra dos ventas.
   */
  private async registrarVenta(
    actorId: string,
    pedido: PedidoCompleto,
    cobradoPedido: bigint,
    method: PaymentMethod,
  ) {
    const listas = await listasDelCliente(
      this.prisma,
      pedido.organizationId,
      pedido.priceListId,
    );
    const precios = await this.prisma.productPrice.findMany({
      where: {
        productId: { in: pedido.items.map((i) => i.productId) },
        priceListId: {
          in: [listas.elegida, listas.respaldo, listas.general].filter(
            (id): id is string => Boolean(id),
          ),
        },
      },
      select: { productId: true, priceListId: true, amountMinor: true },
    });
    const renglones = new Map<string, { unit: bigint; discount: bigint }>();
    const items = pedido.items.map((item) => {
      const hoy = precioEnListas(
        precios.filter((p) => p.productId === item.productId),
        listas,
      );
      if (hoy === null)
        throw new BadRequestException(
          `${item.productName} ya no tiene precio. Cargalo para entregar el pedido.`,
        );
      const especial = precioParaLaVenta(item.unitPriceMinor, hoy);
      const unit = especial ?? hoy;
      const discount = descuentoParaLaVenta(
        item.discountMinor,
        unit,
        item.quantity,
      );
      renglones.set(item.productId, { unit, discount });
      return {
        productId: item.productId,
        quantity: item.quantity,
        expectedUnitPriceMinor: hoy.toString(),
        ...(especial !== undefined
          ? { requestedUnitPriceMinor: Number(especial) }
          : {}),
        discountMinor: Number(discount),
        // La oferta ya está en el descuento del pedido: no se aplica dos veces.
        skipOffers: true,
      };
    });
    const totalMinor = [...renglones.entries()].reduce((suma, [id, r]) => {
      const cantidad = pedido.items.find((i) => i.productId === id)!.quantity;
      return suma + r.unit * BigInt(cantidad) - r.discount;
    }, 0n);
    const { cobradoMinor, debeMinor } = repartoDelCobro(
      totalMinor,
      cobradoPedido,
    );
    const payments = [
      ...(cobradoMinor > 0n
        ? [{ method, amountMinor: Number(cobradoMinor) }]
        : []),
      ...(debeMinor > 0n
        ? [{ method: "ACCOUNT" as const, amountMinor: Number(debeMinor) }]
        : []),
    ];
    if (!payments.length) payments.push({ method, amountMinor: 0 });
    if (debeMinor > 0n && !pedido.customer.creditEnabled)
      throw new BadRequestException(
        `${pedido.customer.name} no tiene cuenta corriente: cobrá el total o habilitásela en Clientes.`,
      );
    const venta = await this.sales.completeFromModule(
      actorId,
      pedido.organizationId,
      pedido.branchId,
      {
        clientOperationId: pedido.id,
        customerId: pedido.customerId,
        priceListId: pedido.priceListId,
        items,
        payments,
      },
    );
    return { saleId: venta.id, renglones, totalMinor };
  }

  /** Cobro posterior de un pedido entregado que no se registró como venta. */
  async cobrar(
    actorId: string,
    organizationId: string,
    orderId: string,
    datos: {
      requestId: string;
      amountMinor: string;
      method: "CASH" | "TRANSFER" | "CARD";
    },
  ) {
    const acceso = await accesoPreventa(this.prisma, actorId, organizationId);
    exigir(acceso, "repartir");
    if (!/^\d{1,15}$/.test(datos.amountMinor) || BigInt(datos.amountMinor) < 1n)
      throw new BadRequestException("Revisá el importe cobrado.");
    if (!MEDIOS.includes(datos.method))
      throw new BadRequestException("Elegí efectivo, transferencia o tarjeta.");
    const importe = BigInt(datos.amountMinor);
    const resultado = await this.prisma.$transaction(async (tx) => {
      const repetido = await tx.preventaPayment.findUnique({
        where: {
          organizationId_requestId: {
            organizationId,
            requestId: datos.requestId,
          },
        },
      });
      if (repetido) {
        if (repetido.orderId !== orderId || repetido.amountMinor !== importe)
          throw new ConflictException(
            "Ese cobro ya se registró con otros datos.",
          );
      } else {
        const pedido = await this.bloquear(tx, organizationId, orderId);
        this.exigirAccion(pedido.status, "cobrar");
        if (pedido.deliveryEffect === "SALE")
          throw new BadRequestException(
            "Este pedido se registró como venta: el saldo se cobra en Cuentas corrientes.",
          );
        if (pedido.paidMinor + importe > pedido.totalMinor)
          throw new BadRequestException(
            "El cobro supera lo que falta pagar del pedido.",
          );
        await tx.preventaPayment.create({
          data: {
            organizationId,
            orderId,
            method: datos.method,
            amountMinor: importe,
            actorId,
            requestId: datos.requestId,
          },
        });
        await tx.preventaOrder.update({
          where: { id: orderId },
          data: { paidMinor: { increment: importe } },
        });
        await tx.auditLog.create({
          data: {
            organizationId,
            branchId: pedido.branchId,
            actorId,
            entityType: "PreventaOrder",
            entityId: orderId,
            action: "PREVENTA_ORDER_PAYMENT",
            after: { amountMinor: importe.toString(), method: datos.method },
          },
        });
      }
      return tx.preventaOrder.findUniqueOrThrow({
        where: { id: orderId },
        include: incluirPedido,
      });
    });
    return this.serializar(organizationId, resultado);
  }

  /**
   * Descuenta el stock del pedido (efecto STOCK). Mismas reglas que Ventas:
   * primero lo que vence antes, nunca un lote vencido ni stock negativo. Si
   * falta algo, no se entrega nada.
   */
  private async descontarStock(
    tx: Prisma.TransactionClient,
    pedido: { id: string; organizationId: string; branchId: string },
    actorId: string,
    ahora: Date,
  ) {
    const renglones = await tx.preventaOrderItem.findMany({
      where: { orderId: pedido.id },
      orderBy: { productId: "asc" },
    });
    for (const renglon of renglones) {
      await tx.$queryRaw`SELECT id FROM "ProductLot" WHERE "organizationId" = ${pedido.organizationId}::uuid AND "branchId" = ${pedido.branchId}::uuid AND "productId" = ${renglon.productId}::uuid FOR UPDATE`;
      const lotes = await tx.productLot.findMany({
        where: {
          organizationId: pedido.organizationId,
          branchId: pedido.branchId,
          productId: renglon.productId,
          quantity: { gt: 0 },
        },
        select: { id: true, quantity: true, expiresAt: true },
      });
      const { salidas, faltante } = repartirEntrega(
        lotes,
        renglon.quantity,
        ahora,
      );
      if (faltante > 0)
        throw new ConflictException(
          `No hay stock suficiente de ${renglon.productName} para entregarlo: faltan ${faltante}.`,
        );
      for (const salida of salidas) {
        await tx.productLot.update({
          where: { id: salida.lotId },
          data: { quantity: { decrement: salida.quantity } },
        });
        await tx.inventoryMovement.create({
          data: {
            organizationId: pedido.organizationId,
            branchId: pedido.branchId,
            productId: renglon.productId,
            lotId: salida.lotId,
            type: "ADJUSTMENT_OUT",
            quantity: -salida.quantity,
            actorId,
            occurredAt: ahora,
            referenceType: "PREVENTA_ORDER",
            referenceId: pedido.id,
          },
        });
      }
    }
  }

  /** Cambio de estado simple con bloqueo, estado esperado y auditoría. */
  private async cambiar(
    acceso: AccesoPreventa,
    orderId: string,
    esperado: EstadoPreventa,
    accion: AccionPreventa,
    decidir: (pedido: Prisma.PreventaOrderGetPayload<object>) => {
      data: Prisma.PreventaOrderUncheckedUpdateInput;
      accion: string;
      detalle: Prisma.InputJsonObject;
    },
  ) {
    const resultado = await this.prisma.$transaction(async (tx) => {
      const pedido = await this.bloquear(tx, acceso.organizationId, orderId);
      if (pedido.status !== esperado)
        throw new ConflictException(CAMBIO_EN_CURSO);
      this.exigirAccion(pedido.status, accion);
      const cambio = decidir(pedido);
      await tx.preventaOrder.update({
        where: { id: orderId },
        data: cambio.data,
      });
      await tx.auditLog.create({
        data: {
          organizationId: acceso.organizationId,
          branchId: pedido.branchId,
          actorId: acceso.actorId,
          entityType: "PreventaOrder",
          entityId: orderId,
          action: cambio.accion,
          before: { status: pedido.status, delivererId: pedido.delivererId },
          after: { ...cambio.detalle },
        },
      });
      return tx.preventaOrder.findUniqueOrThrow({
        where: { id: orderId },
        include: incluirPedido,
      });
    });
    return this.serializar(acceso.organizationId, resultado);
  }

  private exigirAccion(estado: EstadoPreventa, accion: AccionPreventa) {
    if (!accionPermitida(estado, accion))
      throw new ConflictException("Este pedido ya no admite ese cambio.");
  }

  private exigirVer(acceso: AccesoPreventa, pedido: PedidoCompleto) {
    if (acceso.administrar) return;
    if (acceso.vender && pedido.sellerId === acceso.actorId) return;
    if (
      acceso.repartir &&
      (pedido.delivererId === acceso.actorId ||
        (pedido.status === "PENDING" && !pedido.delivererId))
    )
      return;
    throw new NotFoundException("No encontramos ese pedido.");
  }

  private async bloquear(
    tx: Prisma.TransactionClient,
    organizationId: string,
    orderId: string,
  ) {
    await tx.$queryRaw`SELECT id FROM "PreventaOrder" WHERE id = ${orderId}::uuid FOR UPDATE`;
    const pedido = await tx.preventaOrder.findFirst({
      where: { id: orderId, organizationId },
    });
    if (!pedido) throw new NotFoundException("No encontramos ese pedido.");
    return pedido;
  }

  /** Configuración bloqueada para numerar (la crea si nunca se guardó). */
  private async ajustesBloqueados(
    tx: Prisma.TransactionClient,
    organizationId: string,
  ) {
    const ajustes = await ajustesPreventa(tx, organizationId);
    if (!ajustes.exists)
      await tx.preventaSettings.upsert({
        where: { organizationId },
        create: { organizationId, branchId: ajustes.branchId },
        update: {},
      });
    await tx.$queryRaw`SELECT "organizationId" FROM "PreventaSettings" WHERE "organizationId" = ${organizationId}::uuid FOR UPDATE`;
    return ajustesPreventa(tx, organizationId);
  }

  private async clienteVendible(
    acceso: AccesoPreventa,
    organizationId: string,
    customerId: string,
  ) {
    const cliente = await this.prisma.customer.findFirst({
      where: { id: customerId, organizationId, active: true },
      select: {
        id: true,
        priceListId: true,
        billingAddress: true,
        preventaProfile: { select: { sellerId: true, address: true } },
      },
    });
    if (!cliente)
      throw new BadRequestException("Elegí un cliente activo de la farmacia.");
    if (!acceso.administrar) {
      const ajustes = await ajustesPreventa(this.prisma, organizationId);
      if (
        !ajustes.sellerSeesAllCustomers &&
        cliente.preventaProfile?.sellerId !== acceso.actorId
      )
        throw new ForbiddenException("Ese cliente no está en tu cartera.");
    }
    return {
      id: cliente.id,
      priceListId: cliente.priceListId,
      direccion:
        cliente.preventaProfile?.address ?? cliente.billingAddress ?? null,
    };
  }

  private renglonesParaGuardar(
    items: readonly {
      productId: string;
      productName: string;
      quantity: number;
      listUnitPriceMinor: bigint;
      unitPriceMinor: bigint;
      discountMinor: bigint;
      totalMinor: bigint;
    }[],
  ) {
    return items.map((item) => ({
      productId: item.productId,
      productName: item.productName,
      quantity: item.quantity,
      listUnitPriceMinor: item.listUnitPriceMinor,
      unitPriceMinor: item.unitPriceMinor,
      discountMinor: item.discountMinor,
      totalMinor: item.totalMinor,
    }));
  }

  private async buscar(organizationId: string, orderId: string) {
    const pedido = await this.prisma.preventaOrder.findFirst({
      where: { id: orderId, organizationId },
      include: incluirPedido,
    });
    if (!pedido) throw new NotFoundException("No encontramos ese pedido.");
    return pedido;
  }

  private porRequestId(organizationId: string, requestId: string) {
    return this.prisma.preventaOrder.findUnique({
      where: { organizationId_requestId: { organizationId, requestId } },
      include: incluirPedido,
    });
  }

  private nombres(organizationId: string, pedidos: readonly PedidoCompleto[]) {
    return nombresDeUsuarios(
      this.prisma,
      organizationId,
      pedidos.flatMap((p) => [p.sellerId, p.delivererId]),
    );
  }

  private async serializar(organizationId: string, pedido: PedidoCompleto) {
    return serializarPedido(
      pedido,
      await this.nombres(organizationId, [pedido]),
    );
  }
}
