import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from "@nestjs/common";

import { CatalogoOnlineService } from "../catalogo-online/catalogo-online.service";
import { PreventaPedidosService } from "../preventa/preventa-pedidos.service";
import { PrismaService } from "../prisma/prisma.service";
import {
  ESTADOS_POR_GRUPO,
  grupoUsaFechas,
  mezclarPedidos,
  resumirPedidos,
  vistaUnificadaDisponible,
  type GrupoPedidos,
  type OrigenPedido,
} from "./pedidos-reglas";

export type FiltroPedidosUnificados = {
  grupo?: GrupoPedidos;
  origen?: OrigenPedido;
  desde?: string;
  hasta?: string;
  /** Preventista: sólo tiene sentido para los pedidos de preventa. */
  vendedorId?: string;
};

/** Tope de la lista unida (cada módulo ya limita la suya). */
const LIMITE = 300;

const SIN_PERMISO =
  "No tenés permiso para esta operación. Pedíselo al dueño de la farmacia.";

const PERMISOS_PREVENTA = [
  "PREVENTA_SELL",
  "PREVENTA_DELIVER",
  "PREVENTA_MANAGE",
] as const;

/**
 * Pantalla Pedidos (SISTEMA-119): los pedidos del catálogo online y los de
 * preventa juntos, si la farmacia lo eligió. Sólo lee: cada pedido se resuelve
 * con los endpoints de su módulo, que siguen siendo la autoridad. Ver
 * docs/PEDIDOS.md.
 */
@Injectable()
export class PedidosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly catalogo: CatalogoOnlineService,
    private readonly preventa: PreventaPedidosService,
  ) {}

  /** La farmacia elige ver los pedidos juntos o cada uno en su módulo. */
  async cambiarVista(actorId: string, organizationId: string, unir: boolean) {
    const codigos = await this.permisos(actorId, organizationId);
    if (!codigos.has("ORGANIZATION_MANAGE"))
      throw new ForbiddenException(SIN_PERMISO);
    return this.prisma.$transaction(async (tx) => {
      const [antes] = await tx.$queryRaw<
        {
          catalogEnabled: boolean;
          preventaEnabled: boolean;
          unifiedOrders: boolean;
        }[]
      >`SELECT "catalogEnabled", "preventaEnabled", "unifiedOrders"
        FROM "Organization" WHERE id = ${organizationId}::uuid FOR UPDATE`;
      if (!antes) throw new ForbiddenException(SIN_PERMISO);
      if (unir && !vistaUnificadaDisponible(antes))
        throw new BadRequestException(
          "Para ver los pedidos juntos la farmacia necesita Catálogo online y Preventa.",
        );
      if (antes.unifiedOrders === unir) return { unifiedOrders: unir };
      await tx.organization.update({
        where: { id: organizationId },
        data: { unifiedOrders: unir },
      });
      await tx.auditLog.create({
        data: {
          organizationId,
          actorId,
          entityType: "Organization",
          entityId: organizationId,
          action: "ORGANIZATION_UNIFIED_ORDERS_CHANGED",
          before: { unifiedOrders: antes.unifiedOrders },
          after: { unifiedOrders: unir },
        },
      });
      return { unifiedOrders: unir };
    });
  }

  async listar(
    actorId: string,
    organizationId: string,
    filtro: FiltroPedidosUnificados,
  ) {
    const organizacion = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: {
        catalogEnabled: true,
        preventaEnabled: true,
        unifiedOrders: true,
      },
    });
    if (!organizacion?.unifiedOrders || !vistaUnificadaDisponible(organizacion))
      throw new ForbiddenException(
        "Esta farmacia ve los pedidos en Catálogo online y en Preventa.",
      );
    const codigos = await this.permisos(actorId, organizationId);
    const verCatalogo = codigos.has("SALE_READ");
    const verPreventa = PERMISOS_PREVENTA.some((c) => codigos.has(c));
    if (!verCatalogo && !verPreventa) throw new ForbiddenException(SIN_PERMISO);

    const estados = filtro.grupo ? ESTADOS_POR_GRUPO[filtro.grupo] : undefined;
    const fechas = grupoUsaFechas(filtro.grupo)
      ? { desde: filtro.desde, hasta: filtro.hasta }
      : {};
    // El filtro de preventista deja afuera los del catálogo (no tienen).
    const traerCatalogo =
      verCatalogo && filtro.origen !== "preventa" && !filtro.vendedorId;
    const traerPreventa = verPreventa && filtro.origen !== "catalogo";

    const [catalogo, preventa, porAtenderPreventa] = await Promise.all([
      traerCatalogo
        ? this.catalogo.pedidos(actorId, organizationId, {
            estados: estados?.catalogo,
            ...fechas,
          })
        : null,
      traerPreventa
        ? this.preventa.listar(actorId, organizationId, {
            estados: estados?.preventa,
            vendedorId: filtro.vendedorId,
            ...fechas,
          })
        : null,
      verPreventa ? this.preventa.pendientes(actorId, organizationId) : 0,
    ]);
    const porAtenderCatalogo = verCatalogo
      ? (catalogo?.recibidos ??
        (await this.prisma.catalogOrder.count({
          where: { organizationId, status: "RECEIVED" },
        })))
      : 0;
    const items = mezclarPedidos(
      catalogo?.items ?? [],
      preventa?.items ?? [],
      LIMITE,
    );
    return {
      origenes: { catalogo: verCatalogo, preventa: verPreventa },
      porAtender: {
        catalogo: porAtenderCatalogo,
        preventa: porAtenderPreventa,
      },
      descuentaStock: catalogo?.descuentaStock ?? false,
      resumen: resumirPedidos(items),
      items,
    };
  }

  private async permisos(actorId: string, organizationId: string) {
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
    return new Set(
      membership?.active
        ? membership.roles.flatMap(({ role }) =>
            role.permissions.map(({ permission }) => permission.code),
          )
        : [],
    );
  }
}
