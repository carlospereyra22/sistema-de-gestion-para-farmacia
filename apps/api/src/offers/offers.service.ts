import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";

import { AuditService } from "../audit/audit.service";
import { PrismaService } from "../prisma/prisma.service";
import {
  cargarOfertasMotor,
  incluirOferta,
  ofertaMotor,
  unidadesUsadas,
  type OfertaConRelaciones,
} from "./ofertas-carga";
import {
  estadoOferta,
  etiquetaOferta,
  ofertaAJson,
  type EstadoOferta,
  type TipoOferta,
} from "./ofertas-motor";
import {
  validarOferta,
  type OfertaEntrada,
  type OfertaNormalizada,
} from "./oferta-validacion";

export type FiltrosOfertas = {
  estado?: EstadoOferta;
  tipo?: TipoOferta;
  branchId?: string;
  q?: string;
  desde?: string;
  hasta?: string;
};

export type AccionOferta =
  "publicar" | "pausar" | "reanudar" | "finalizar" | "archivar";

type Estadisticas = {
  ventas: number;
  unidades: number;
  descuentoMinor: bigint;
  facturacionMinor: bigint;
};

const SIN_ESTADISTICAS: Estadisticas = {
  ventas: 0,
  unidades: 0,
  descuentoMinor: 0n,
  facturacionMinor: 0n,
};

const ACCIONES: Record<
  AccionOferta,
  {
    desde: readonly OfertaConRelaciones["status"][];
    hacia: OfertaConRelaciones["status"];
    auditoria: string;
    rechazo: string;
  }
> = {
  publicar: {
    desde: ["DRAFT"],
    hacia: "PUBLISHED",
    auditoria: "OFFER_PUBLISHED",
    rechazo: "Sólo se publica una oferta en borrador.",
  },
  pausar: {
    desde: ["PUBLISHED"],
    hacia: "PAUSED",
    auditoria: "OFFER_PAUSED",
    rechazo: "Sólo se pausa una oferta publicada.",
  },
  reanudar: {
    desde: ["PAUSED"],
    hacia: "PUBLISHED",
    auditoria: "OFFER_RESUMED",
    rechazo: "Sólo se reanuda una oferta pausada.",
  },
  finalizar: {
    desde: ["PUBLISHED", "PAUSED"],
    hacia: "FINISHED",
    auditoria: "OFFER_FINISHED",
    rechazo: "Sólo se finaliza una oferta publicada o pausada.",
  },
  archivar: {
    desde: ["DRAFT", "PUBLISHED", "PAUSED", "FINISHED"],
    hacia: "ARCHIVED",
    auditoria: "OFFER_ARCHIVED",
    rechazo: "La oferta ya está archivada.",
  },
};

@Injectable()
export class OffersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async listar(
    actorId: string,
    organizationId: string,
    filtros: FiltrosOfertas,
  ) {
    await this.exigir(actorId, organizationId, ["OFFER_READ"]);
    const ofertas = await this.prisma.offer.findMany({
      where: {
        organizationId,
        ...(filtros.tipo ? { type: filtros.tipo } : {}),
      },
      include: incluirOferta,
      orderBy: [{ createdAt: "desc" }],
    });
    const ahora = new Date();
    const nombres = await this.nombresDestinos(organizationId, ofertas);
    const estadisticas = await this.estadisticas(organizationId, {
      branchId: filtros.branchId,
      desde: filtros.desde,
      hasta: filtros.hasta,
    });
    const usadas = await unidadesUsadas(
      this.prisma,
      organizationId,
      ofertas
        .filter((oferta) => oferta.maxUnitsTotal !== null)
        .map((oferta) => oferta.id),
    );
    const texto = normalizar(filtros.q ?? "");
    return ofertas
      .map((oferta) =>
        this.serializar(
          oferta,
          ahora,
          nombres,
          estadisticas.get(oferta.id) ?? SIN_ESTADISTICAS,
          usadas.get(oferta.id) ?? 0,
        ),
      )
      .filter(
        (oferta) =>
          (!filtros.estado || oferta.estado === filtros.estado) &&
          (!filtros.branchId ||
            oferta.allBranches ||
            oferta.branchIds.includes(filtros.branchId)) &&
          (!texto ||
            normalizar(oferta.name).includes(texto) ||
            oferta.targets.some((target) =>
              normalizar(target.name).includes(texto),
            )),
      );
  }

  async detalle(actorId: string, organizationId: string, offerId: string) {
    await this.exigir(actorId, organizationId, ["OFFER_READ"]);
    const oferta = await this.buscar(this.prisma, organizationId, offerId);
    const [nombres, estadisticas, usadas, historial, ventas] =
      await Promise.all([
        this.nombresDestinos(organizationId, [oferta]),
        this.estadisticas(organizationId, { offerId }),
        unidadesUsadas(this.prisma, organizationId, [offerId]),
        this.prisma.auditLog.findMany({
          where: { organizationId, entityType: "OFFER", entityId: offerId },
          orderBy: { createdAt: "desc" },
          take: 100,
        }),
        this.prisma.saleOffer.findMany({
          where: { organizationId, offerId },
          orderBy: { createdAt: "desc" },
          take: 50,
          include: {
            sale: {
              select: {
                id: true,
                branchId: true,
                completedAt: true,
                totalMinor: true,
                status: true,
              },
            },
          },
        }),
      ]);
    const actores = await this.prisma.userOrganization.findMany({
      where: {
        organizationId,
        userId: {
          in: [
            ...new Set(
              historial.flatMap((item) => (item.actorId ? [item.actorId] : [])),
            ),
          ],
        },
      },
      select: {
        userId: true,
        displayName: true,
        user: { select: { email: true } },
      },
    });
    const sucursales = await this.prisma.branch.findMany({
      where: {
        organizationId,
        id: { in: [...new Set(ventas.map((venta) => venta.sale.branchId))] },
      },
      select: { id: true, name: true },
    });
    return {
      ...this.serializar(
        oferta,
        new Date(),
        nombres,
        estadisticas.get(offerId) ?? SIN_ESTADISTICAS,
        usadas.get(offerId) ?? 0,
      ),
      historial: historial.map((item) => {
        const actor = actores.find((fila) => fila.userId === item.actorId);
        return {
          id: item.id,
          action: item.action,
          createdAt: item.createdAt.toISOString(),
          actor: actor?.displayName || actor?.user.email || null,
          before: item.before,
          after: item.after,
        };
      }),
      ventas: ventas.map((venta) => ({
        saleId: venta.saleId,
        number: venta.saleId.slice(0, 8).toUpperCase(),
        branchName:
          sucursales.find((sucursal) => sucursal.id === venta.sale.branchId)
            ?.name ?? "",
        completedAt: venta.sale.completedAt?.toISOString() ?? null,
        status: venta.sale.status,
        totalMinor: venta.sale.totalMinor.toString(),
        units: venta.units,
        discountMinor: venta.discountMinor.toString(),
        offerVersion: venta.offerVersion,
      })),
    };
  }

  /**
   * Ofertas publicadas que todavía pueden aplicar (activas o programadas),
   * listas para el motor. Las usan Ventas (también sin conexión: la PC guarda
   * la respuesta) y Productos.
   */
  async vigentes(actorId: string, organizationId: string) {
    await this.exigir(actorId, organizationId, [
      "SALE_READ",
      "CATALOG_READ",
      "OFFER_READ",
    ]);
    const ofertas = await cargarOfertasMotor(this.prisma, organizationId, {
      desde: new Date(),
    });
    return ofertas.map((oferta) => ({
      ...ofertaAJson(oferta),
      label: etiquetaOferta(oferta),
    }));
  }

  async crear(
    actorId: string,
    organizationId: string,
    entrada: OfertaEntrada & { publicar?: boolean },
  ) {
    await this.exigir(actorId, organizationId, ["OFFER_MANAGE"]);
    const normalizada = validarOferta(entrada);
    const id = await this.prisma.$transaction(async (tx) => {
      await this.validarReferencias(tx, organizationId, normalizada);
      const creada = await tx.offer.create({
        data: {
          ...normalizada.datos,
          organizationId,
          createdById: actorId,
          status: entrada.publicar ? "PUBLISHED" : "DRAFT",
        },
      });
      await this.guardarRelaciones(tx, organizationId, creada.id, normalizada);
      const completa = await this.buscar(tx, organizationId, creada.id);
      await this.audit.recordInTransaction(tx, {
        organizationId,
        actorId,
        entityType: "OFFER",
        entityId: creada.id,
        action: "OFFER_CREATED",
        after: foto(completa),
      });
      return creada.id;
    });
    return this.detalle(actorId, organizationId, id);
  }

  async editar(
    actorId: string,
    organizationId: string,
    offerId: string,
    entrada: OfertaEntrada & { expectedUpdatedAt: string },
  ) {
    await this.exigir(actorId, organizationId, ["OFFER_MANAGE"]);
    const normalizada = validarOferta(entrada);
    await this.prisma.$transaction(async (tx) => {
      await this.bloquear(tx, offerId);
      const anterior = await this.buscar(tx, organizationId, offerId);
      if (anterior.updatedAt.toISOString() !== entrada.expectedUpdatedAt)
        throw new ConflictException(
          "Otra persona cambió esta oferta. Actualizá y volvé a intentarlo.",
        );
      if (anterior.status === "FINISHED" || anterior.status === "ARCHIVED")
        throw new BadRequestException(
          "Una oferta finalizada o archivada no se edita: duplicala para usarla de nuevo.",
        );
      if (
        anterior.type !== normalizada.datos.type &&
        (await this.usada(tx, offerId))
      )
        throw new BadRequestException(
          "Esta oferta ya se usó en ventas: no se le cambia el tipo. Duplicala y finalizá esta.",
        );
      await this.validarReferencias(tx, organizationId, normalizada);
      await tx.offerTier.deleteMany({ where: { offerId } });
      await tx.offerTarget.deleteMany({ where: { offerId } });
      await tx.offerBranch.deleteMany({ where: { offerId } });
      await tx.offerPriceList.deleteMany({ where: { offerId } });
      await tx.offer.update({
        where: { id: offerId },
        data: { ...normalizada.datos, version: { increment: 1 } },
      });
      await this.guardarRelaciones(tx, organizationId, offerId, normalizada);
      const nueva = await this.buscar(tx, organizationId, offerId);
      await this.audit.recordInTransaction(tx, {
        organizationId,
        actorId,
        entityType: "OFFER",
        entityId: offerId,
        action: "OFFER_UPDATED",
        before: foto(anterior),
        after: foto(nueva),
      });
    });
    return this.detalle(actorId, organizationId, offerId);
  }

  async cambiarEstado(
    actorId: string,
    organizationId: string,
    offerId: string,
    accion: AccionOferta,
  ) {
    await this.exigir(actorId, organizationId, ["OFFER_MANAGE"]);
    const regla = ACCIONES[accion];
    await this.prisma.$transaction(async (tx) => {
      await this.bloquear(tx, offerId);
      const anterior = await this.buscar(tx, organizationId, offerId);
      if (!regla.desde.includes(anterior.status))
        throw new BadRequestException(regla.rechazo);
      const ahora = new Date();
      await tx.offer.update({
        where: { id: offerId },
        data: {
          status: regla.hacia,
          ...(accion === "pausar" ? { pausedAt: ahora } : {}),
          ...(accion === "reanudar" ? { pausedAt: null } : {}),
          ...(accion === "finalizar" ? { finishedAt: ahora } : {}),
          ...(accion === "archivar" ? { archivedAt: ahora } : {}),
        },
      });
      await this.audit.recordInTransaction(tx, {
        organizationId,
        actorId,
        entityType: "OFFER",
        entityId: offerId,
        action: regla.auditoria,
        before: { status: anterior.status },
        after: { status: regla.hacia },
      });
    });
    return this.detalle(actorId, organizationId, offerId);
  }

  async duplicar(actorId: string, organizationId: string, offerId: string) {
    await this.exigir(actorId, organizationId, ["OFFER_MANAGE"]);
    const id = await this.prisma.$transaction(async (tx) => {
      const original = await this.buscar(tx, organizationId, offerId);
      const copia = await tx.offer.create({
        data: {
          organizationId,
          createdById: actorId,
          status: "DRAFT",
          name: `Copia de ${original.name}`.slice(0, 120),
          type: original.type,
          priority: original.priority,
          combinable: original.combinable,
          startsAt: new Date(Math.max(original.startsAt.getTime(), Date.now())),
          endsAt:
            original.endsAt && original.endsAt.getTime() > Date.now()
              ? original.endsAt
              : null,
          weekdays: original.weekdays,
          dayStartMinute: original.dayStartMinute,
          dayEndMinute: original.dayEndMinute,
          allBranches: original.allBranches,
          allPriceLists: original.allPriceLists,
          productKind: original.productKind,
          maxUnitsPerSale: original.maxUnitsPerSale,
          maxUnitsTotal: original.maxUnitsTotal,
          percentBps: original.percentBps,
          amountMinor: original.amountMinor,
          fixedPriceMinor: original.fixedPriceMinor,
          buyQuantity: original.buyQuantity,
          payQuantity: original.payQuantity,
          nthUnit: original.nthUnit,
          bundlePriceMinor: original.bundlePriceMinor,
        },
      });
      await this.guardarRelaciones(tx, organizationId, copia.id, {
        tiers: original.tiers,
        targets: original.targets.map((target) => ({
          kind: target.kind,
          id:
            target.productId ?? target.categoryId ?? target.laboratoryId ?? "",
          exclude: target.exclude,
          quantity: target.quantity,
        })),
        branchIds: original.allBranches
          ? []
          : original.branches.map((item) => item.branchId),
        priceListIds: original.allPriceLists
          ? []
          : original.priceLists.map((item) => item.priceListId),
      });
      const completa = await this.buscar(tx, organizationId, copia.id);
      await this.audit.recordInTransaction(tx, {
        organizationId,
        actorId,
        entityType: "OFFER",
        entityId: copia.id,
        action: "OFFER_DUPLICATED",
        after: { ...foto(completa), duplicadaDe: offerId },
      });
      return copia.id;
    });
    return this.detalle(actorId, organizationId, id);
  }

  /** Reporte mínimo por oferta: ventas, unidades, descuento y facturación. */
  async reporte(
    actorId: string,
    organizationId: string,
    filtros: { desde?: string; hasta?: string; branchId?: string },
  ) {
    await this.exigir(actorId, organizationId, ["OFFER_READ", "REPORT_READ"]);
    const estadisticas = await this.estadisticas(organizationId, filtros);
    const ofertas = await this.prisma.offer.findMany({
      where: { organizationId, id: { in: [...estadisticas.keys()] } },
      select: { id: true, name: true, type: true },
    });
    return ofertas
      .map((oferta) => {
        const fila = estadisticas.get(oferta.id) ?? SIN_ESTADISTICAS;
        return {
          offerId: oferta.id,
          name: oferta.name,
          type: oferta.type,
          ventas: fila.ventas,
          unidades: fila.unidades,
          descuentoMinor: fila.descuentoMinor.toString(),
          facturacionMinor: fila.facturacionMinor.toString(),
        };
      })
      .sort((a, b) =>
        BigInt(b.descuentoMinor) > BigInt(a.descuentoMinor) ? 1 : -1,
      );
  }

  private serializar(
    oferta: OfertaConRelaciones,
    ahora: Date,
    nombres: Map<string, string>,
    estadisticas: Estadisticas,
    usadas: number,
  ) {
    const motor = ofertaMotor(oferta, (id) => [id], usadas);
    const targets = oferta.targets.map((target) => {
      const id =
        target.productId ?? target.categoryId ?? target.laboratoryId ?? "";
      return {
        kind: target.kind,
        id,
        name: nombres.get(id) ?? "",
        exclude: target.exclude,
        quantity: target.quantity,
      };
    });
    const incluidos = targets.filter((target) => !target.exclude);
    return {
      id: oferta.id,
      name: oferta.name,
      type: oferta.type,
      label: etiquetaOferta(motor),
      status: oferta.status,
      estado: estadoOferta(motor, ahora),
      version: oferta.version,
      priority: oferta.priority,
      combinable: oferta.combinable,
      startsAt: oferta.startsAt.toISOString(),
      endsAt: oferta.endsAt?.toISOString() ?? null,
      weekdays: oferta.weekdays,
      dayStartMinute: oferta.dayStartMinute,
      dayEndMinute: oferta.dayEndMinute,
      allBranches: oferta.allBranches,
      branchIds: oferta.branches.map((item) => item.branchId),
      allPriceLists: oferta.allPriceLists,
      priceListIds: oferta.priceLists.map((item) => item.priceListId),
      productKind: oferta.productKind,
      maxUnitsPerSale: oferta.maxUnitsPerSale,
      maxUnitsTotal: oferta.maxUnitsTotal,
      unitsUsed: usadas,
      percentBps: oferta.percentBps,
      amountMinor: oferta.amountMinor?.toString() ?? null,
      fixedPriceMinor: oferta.fixedPriceMinor?.toString() ?? null,
      buyQuantity: oferta.buyQuantity,
      payQuantity: oferta.payQuantity,
      nthUnit: oferta.nthUnit,
      bundlePriceMinor: oferta.bundlePriceMinor?.toString() ?? null,
      tiers: motor.tiers.map((tier) => ({
        minQuantity: tier.minQuantity,
        percentBps: tier.percentBps,
        amountMinor: tier.amountMinor?.toString() ?? null,
      })),
      targets,
      alcance:
        incluidos.length === 1
          ? incluidos[0]!.name
          : `${incluidos.length} ${oferta.type === "BUNDLE" ? "productos" : "elementos"}`,
      createdAt: oferta.createdAt.toISOString(),
      updatedAt: oferta.updatedAt.toISOString(),
      stats: {
        ventas: estadisticas.ventas,
        unidades: estadisticas.unidades,
        descuentoMinor: estadisticas.descuentoMinor.toString(),
        facturacionMinor: estadisticas.facturacionMinor.toString(),
      },
    };
  }

  private async estadisticas(
    organizationId: string,
    filtros: {
      offerId?: string;
      branchId?: string;
      desde?: string;
      hasta?: string;
    },
  ): Promise<Map<string, Estadisticas>> {
    const condiciones = [
      Prisma.sql`so."organizationId" = ${organizationId}::uuid`,
      Prisma.sql`s."status" = 'COMPLETED'`,
    ];
    if (filtros.offerId)
      condiciones.push(Prisma.sql`so."offerId" = ${filtros.offerId}::uuid`);
    if (filtros.branchId)
      condiciones.push(Prisma.sql`s."branchId" = ${filtros.branchId}::uuid`);
    const desde = filtros.desde ? new Date(filtros.desde) : null;
    const hasta = filtros.hasta ? new Date(filtros.hasta) : null;
    if (desde && Number.isFinite(desde.getTime()))
      condiciones.push(Prisma.sql`s."completedAt" >= ${desde}`);
    if (hasta && Number.isFinite(hasta.getTime()))
      condiciones.push(Prisma.sql`s."completedAt" < ${hasta}`);
    const filas = await this.prisma.$queryRaw<
      {
        offerId: string;
        ventas: number;
        unidades: number;
        descuento: bigint;
        facturacion: bigint;
      }[]
    >`
      WITH items AS (
        SELECT "saleOfferId", SUM("grossMinor" - "discountMinor") AS neto
        FROM "SaleOfferItem" GROUP BY "saleOfferId"
      )
      SELECT so."offerId" AS "offerId",
        COUNT(DISTINCT so."saleId")::int AS ventas,
        COALESCE(SUM(so."units"), 0)::int AS unidades,
        COALESCE(SUM(so."discountMinor"), 0)::bigint AS descuento,
        COALESCE(SUM(items.neto), 0)::bigint AS facturacion
      FROM "SaleOffer" so
      JOIN "Sale" s ON s."id" = so."saleId"
      LEFT JOIN items ON items."saleOfferId" = so."id"
      WHERE ${Prisma.join(condiciones, " AND ")}
      GROUP BY so."offerId"`;
    return new Map(
      filas.map((fila) => [
        fila.offerId,
        {
          ventas: fila.ventas,
          unidades: fila.unidades,
          descuentoMinor: BigInt(fila.descuento),
          facturacionMinor: BigInt(fila.facturacion),
        },
      ]),
    );
  }

  private async nombresDestinos(
    organizationId: string,
    ofertas: OfertaConRelaciones[],
  ) {
    const targets = ofertas.flatMap((oferta) => oferta.targets);
    const ids = (clave: "productId" | "categoryId" | "laboratoryId") => [
      ...new Set(
        targets.flatMap((target) => (target[clave] ? [target[clave]] : [])),
      ),
    ];
    const [productos, categorias, laboratorios] = await Promise.all([
      this.prisma.product.findMany({
        where: { organizationId, id: { in: ids("productId") } },
        select: { id: true, name: true, presentation: true },
      }),
      this.prisma.category.findMany({
        where: { organizationId, id: { in: ids("categoryId") } },
        select: { id: true, name: true },
      }),
      this.prisma.laboratory.findMany({
        where: { organizationId, id: { in: ids("laboratoryId") } },
        select: { id: true, name: true },
      }),
    ]);
    return new Map<string, string>([
      ...productos.map(
        (producto) =>
          [
            producto.id,
            [producto.name, producto.presentation].filter(Boolean).join(" · "),
          ] as const,
      ),
      ...categorias.map((item) => [item.id, item.name] as const),
      ...laboratorios.map((item) => [item.id, item.name] as const),
    ]);
  }

  private async validarReferencias(
    tx: Prisma.TransactionClient,
    organizationId: string,
    oferta: OfertaNormalizada,
  ) {
    const de = (kind: "PRODUCT" | "CATEGORY" | "LABORATORY") => [
      ...new Set(
        oferta.targets
          .filter((target) => target.kind === kind)
          .map((target) => target.id),
      ),
    ];
    const [productos, categorias, laboratorios, sucursales, listas] =
      await Promise.all([
        tx.product.count({
          where: { organizationId, id: { in: de("PRODUCT") } },
        }),
        tx.category.count({
          where: { organizationId, id: { in: de("CATEGORY") } },
        }),
        tx.laboratory.count({
          where: { organizationId, id: { in: de("LABORATORY") } },
        }),
        tx.branch.count({
          where: { organizationId, id: { in: oferta.branchIds }, active: true },
        }),
        tx.priceList.count({
          where: {
            organizationId,
            id: { in: oferta.priceListIds },
            active: true,
          },
        }),
      ]);
    if (
      productos !== de("PRODUCT").length ||
      categorias !== de("CATEGORY").length ||
      laboratorios !== de("LABORATORY").length
    )
      throw new BadRequestException(
        "Un producto, categoría o laboratorio de la oferta ya no está disponible. Revisá la selección.",
      );
    if (sucursales !== oferta.branchIds.length)
      throw new BadRequestException("Una sucursal elegida no está disponible.");
    if (listas !== oferta.priceListIds.length)
      throw new BadRequestException(
        "Una lista de precios elegida no está disponible.",
      );
  }

  private async guardarRelaciones(
    tx: Prisma.TransactionClient,
    organizationId: string,
    offerId: string,
    oferta: Pick<
      OfertaNormalizada,
      "tiers" | "targets" | "branchIds" | "priceListIds"
    >,
  ) {
    if (oferta.tiers.length)
      await tx.offerTier.createMany({
        data: oferta.tiers.map((tier) => ({
          offerId,
          organizationId,
          minQuantity: tier.minQuantity,
          percentBps: tier.percentBps,
          amountMinor: tier.amountMinor,
        })),
      });
    await tx.offerTarget.createMany({
      data: oferta.targets.map((target) => ({
        offerId,
        organizationId,
        kind: target.kind,
        productId: target.kind === "PRODUCT" ? target.id : null,
        categoryId: target.kind === "CATEGORY" ? target.id : null,
        laboratoryId: target.kind === "LABORATORY" ? target.id : null,
        exclude: target.exclude,
        quantity: target.quantity,
      })),
    });
    if (oferta.branchIds.length)
      await tx.offerBranch.createMany({
        data: oferta.branchIds.map((branchId) => ({
          offerId,
          organizationId,
          branchId,
        })),
      });
    if (oferta.priceListIds.length)
      await tx.offerPriceList.createMany({
        data: oferta.priceListIds.map((priceListId) => ({
          offerId,
          organizationId,
          priceListId,
        })),
      });
  }

  private async buscar(
    cliente: Prisma.TransactionClient,
    organizationId: string,
    offerId: string,
  ) {
    const oferta = await cliente.offer.findFirst({
      where: { id: offerId, organizationId },
      include: incluirOferta,
    });
    if (!oferta) throw new NotFoundException("La oferta no existe.");
    return oferta;
  }

  private async bloquear(tx: Prisma.TransactionClient, offerId: string) {
    await tx.$queryRaw`SELECT id FROM "Offer" WHERE id = ${offerId}::uuid FOR UPDATE`;
  }

  private async usada(tx: Prisma.TransactionClient, offerId: string) {
    return Boolean(
      await tx.saleOffer.findFirst({
        where: { offerId },
        select: { id: true },
      }),
    );
  }

  private async exigir(
    actorId: string,
    organizationId: string,
    alguno: readonly string[],
  ) {
    const membership = await this.prisma.userOrganization.findUnique({
      where: { userId_organizationId: { userId: actorId, organizationId } },
      include: {
        roles: {
          include: {
            role: {
              include: { permissions: { include: { permission: true } } },
            },
          },
        },
      },
    });
    if (
      !membership?.active ||
      !membership.roles.some(({ role }) =>
        role.permissions.some(({ permission }) =>
          alguno.includes(permission.code),
        ),
      )
    )
      throw new ForbiddenException(
        "No tenés permiso para esta operación. Pedíselo al dueño de la farmacia.",
      );
  }
}

/** Foto de la oferta para la auditoría (antes y después). */
function foto(oferta: OfertaConRelaciones): Prisma.InputJsonObject {
  return {
    name: oferta.name,
    type: oferta.type,
    status: oferta.status,
    version: oferta.version,
    priority: oferta.priority,
    combinable: oferta.combinable,
    startsAt: oferta.startsAt.toISOString(),
    endsAt: oferta.endsAt?.toISOString() ?? null,
    weekdays: oferta.weekdays,
    dayStartMinute: oferta.dayStartMinute,
    dayEndMinute: oferta.dayEndMinute,
    branchIds: oferta.allBranches
      ? null
      : oferta.branches.map((item) => item.branchId),
    priceListIds: oferta.allPriceLists
      ? null
      : oferta.priceLists.map((item) => item.priceListId),
    productKind: oferta.productKind,
    maxUnitsPerSale: oferta.maxUnitsPerSale,
    maxUnitsTotal: oferta.maxUnitsTotal,
    percentBps: oferta.percentBps,
    amountMinor: oferta.amountMinor?.toString() ?? null,
    fixedPriceMinor: oferta.fixedPriceMinor?.toString() ?? null,
    buyQuantity: oferta.buyQuantity,
    payQuantity: oferta.payQuantity,
    nthUnit: oferta.nthUnit,
    bundlePriceMinor: oferta.bundlePriceMinor?.toString() ?? null,
    tiers: oferta.tiers.map((tier) => ({
      minQuantity: tier.minQuantity,
      percentBps: tier.percentBps,
      amountMinor: tier.amountMinor?.toString() ?? null,
    })),
    targets: oferta.targets.map((target) => ({
      kind: target.kind,
      id: target.productId ?? target.categoryId ?? target.laboratoryId,
      exclude: target.exclude,
      quantity: target.quantity,
    })),
  };
}

function normalizar(texto: string) {
  return texto.normalize("NFD").replace(/[̀-ͯ]/g, "").toLocaleLowerCase().trim();
}
