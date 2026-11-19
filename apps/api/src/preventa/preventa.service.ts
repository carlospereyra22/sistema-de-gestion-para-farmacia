import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";

import {
  detalleOferta,
  etiquetaCatalogo,
  ofertasDelProducto,
} from "../catalogo-online/catalogo-ofertas";
import { cargarOfertasMotor } from "../offers/ofertas-carga";
import { aplicaEn } from "../offers/ofertas-motor";
import { PrismaService } from "../prisma/prisma.service";
import { armarCarrito, serializarCarrito } from "./preventa-carrito";
import {
  accesoPreventa,
  ajustesPreventa,
  exigir,
  filtroProductos,
  idsDeListas,
  listasDelCliente,
  nombresDeUsuarios,
  precioEnListas,
  saldosDeClientes,
  stockPorProducto,
  type AccesoPreventa,
  type AjustesPreventa,
} from "./preventa-comun";
import {
  diaEnArgentina,
  diasValidos,
  seVisitaEl,
  ubicacionValida,
  unirRenglonesPreventa,
  type EfectoEntrega,
  type RenglonPreventa,
} from "./preventa-reglas";

export type ConfiguracionPreventa = {
  branchId: string;
  deliveryEffect: EfectoEntrega;
  sellerCanChangePrice: boolean;
  sellerSeesAllCustomers: boolean;
  showStock: boolean;
  allowOutOfStock: boolean;
  applyOffers: boolean;
  receiptNote?: string | null;
};

export type DatosClientePreventa = {
  address?: string | null;
  reference?: string | null;
  phone?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  visitDays?: number;
  /** Sólo quien administra la preventa cambia la cartera. */
  sellerId?: string | null;
};

export type ClienteNuevoPreventa = DatosClientePreventa & {
  name: string;
  document?: string | null;
};

const PRODUCTOS_POR_PAGINA = 30;
const CON_TILDE = "áéíóúüñàèìòùâêîôûäëïö";
const SIN_TILDE = "aeiouunaeiouaeiouaeio";
const sinTildes = (texto: string) =>
  texto.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

/**
 * Preventa (SISTEMA-108): configuración, equipo, cartera de clientes,
 * productos con precio para el cliente y cotización del pedido. Los pedidos
 * están en PreventaPedidosService.
 */
@Injectable()
export class PreventaService {
  constructor(private readonly prisma: PrismaService) {}

  /** Lo que la app necesita al abrir: permisos, ajustes y datos para el comprobante. */
  async contexto(actorId: string, organizationId: string) {
    const acceso = await accesoPreventa(this.prisma, actorId, organizationId);
    const ajustes = await ajustesPreventa(this.prisma, organizationId);
    const [organizacion, sucursal, nombres, vendedor] = await Promise.all([
      this.prisma.organization.findUniqueOrThrow({
        where: { id: organizationId },
        select: { name: true, ticketHeader: true },
      }),
      this.prisma.branch.findUnique({
        where: { id: ajustes.branchId },
        select: { name: true, address: true, city: true, phone: true },
      }),
      nombresDeUsuarios(this.prisma, organizationId, [actorId]),
      this.prisma.preventaSeller.findUnique({
        where: { organizationId_userId: { organizationId, userId: actorId } },
        select: { commissionRateBps: true },
      }),
    ]);
    const encabezado =
      organizacion.ticketHeader &&
      typeof organizacion.ticketHeader === "object" &&
      !Array.isArray(organizacion.ticketHeader)
        ? (organizacion.ticketHeader as Record<string, unknown>)
        : {};
    return {
      configured: ajustes.exists,
      permisos: {
        vender: acceso.vender,
        repartir: acceso.repartir,
        administrar: acceso.administrar,
        verSaldos: acceso.verSaldos,
      },
      usuario: {
        id: actorId,
        nombre: nombres.get(actorId) ?? "",
        commissionRateBps: vendedor?.commissionRateBps ?? 0,
      },
      ajustes: {
        deliveryEffect: ajustes.deliveryEffect,
        sellerCanChangePrice:
          ajustes.sellerCanChangePrice || acceso.administrar,
        showStock: ajustes.showStock || acceso.administrar,
        allowOutOfStock: ajustes.allowOutOfStock,
        applyOffers: ajustes.applyOffers,
        receiptNote: ajustes.receiptNote,
      },
      comprobante: {
        farmacia:
          (typeof encabezado.name === "string" && encabezado.name.trim()) ||
          organizacion.name,
        sucursal: sucursal?.name ?? "",
        direccion: [sucursal?.address, sucursal?.city]
          .filter(Boolean)
          .join(", "),
        telefono: sucursal?.phone ?? "",
      },
    };
  }

  async configuracion(actorId: string, organizationId: string) {
    const acceso = await accesoPreventa(this.prisma, actorId, organizationId);
    exigir(acceso, "administrar");
    return ajustesPreventa(this.prisma, organizationId);
  }

  async guardarConfiguracion(
    actorId: string,
    organizationId: string,
    datos: ConfiguracionPreventa,
  ) {
    const acceso = await accesoPreventa(this.prisma, actorId, organizationId);
    exigir(acceso, "administrar");
    const sucursal = await this.prisma.branch.findFirst({
      where: {
        id: datos.branchId,
        organizationId,
        active: true,
        deletedAt: null,
      },
      select: { id: true },
    });
    if (!sucursal)
      throw new BadRequestException(
        "Elegí una sucursal activa de la farmacia.",
      );
    const valores = {
      branchId: datos.branchId,
      deliveryEffect: datos.deliveryEffect,
      sellerCanChangePrice: datos.sellerCanChangePrice,
      sellerSeesAllCustomers: datos.sellerSeesAllCustomers,
      showStock: datos.showStock,
      allowOutOfStock: datos.allowOutOfStock,
      applyOffers: datos.applyOffers,
      receiptNote: datos.receiptNote?.trim().slice(0, 300) || null,
    };
    return this.prisma.$transaction(async (tx) => {
      const antes = await ajustesPreventa(tx, organizationId);
      await tx.preventaSettings.upsert({
        where: { organizationId },
        create: { organizationId, ...valores },
        update: valores,
      });
      const despues = await ajustesPreventa(tx, organizationId);
      await tx.auditLog.create({
        data: {
          organizationId,
          actorId,
          entityType: "PreventaSettings",
          entityId: organizationId,
          action: antes.exists
            ? "PREVENTA_SETTINGS_UPDATED"
            : "PREVENTA_SETTINGS_CREATED",
          before: antes.exists ? { ...antes } : Prisma.DbNull,
          after: { ...despues },
        },
      });
      return despues;
    });
  }

  /**
   * Preventistas y repartidores de la farmacia: quienes tienen esos permisos
   * por alguno de sus roles. La comisión sólo la ve quien administra.
   */
  async equipo(actorId: string, organizationId: string) {
    const acceso = await accesoPreventa(this.prisma, actorId, organizationId);
    const miembros = await this.prisma.userOrganization.findMany({
      where: {
        organizationId,
        active: true,
        user: { active: true },
        roles: {
          some: {
            role: {
              permissions: {
                some: {
                  permission: {
                    code: { in: ["PREVENTA_SELL", "PREVENTA_DELIVER"] },
                  },
                },
              },
            },
          },
        },
      },
      include: {
        user: { select: { email: true } },
        roles: {
          include: {
            role: {
              include: { permissions: { include: { permission: true } } },
            },
          },
        },
      },
    });
    const tasas = await this.prisma.preventaSeller.findMany({
      where: { organizationId },
      select: { userId: true, commissionRateBps: true },
    });
    const tasaDe = new Map(tasas.map((t) => [t.userId, t.commissionRateBps]));
    return miembros
      .map((m) => {
        const codigos = new Set(
          m.roles.flatMap(({ role }) =>
            role.permissions.map(({ permission }) => permission.code),
          ),
        );
        return {
          userId: m.userId,
          name: m.displayName?.trim() || m.user.email,
          email: m.user.email,
          vende: codigos.has("PREVENTA_SELL"),
          reparte: codigos.has("PREVENTA_DELIVER"),
          commissionRateBps: acceso.administrar
            ? (tasaDe.get(m.userId) ?? 0)
            : null,
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name, "es"));
  }

  async cambiarComisionDelVendedor(
    actorId: string,
    organizationId: string,
    userId: string,
    commissionRateBps: number,
  ) {
    const acceso = await accesoPreventa(this.prisma, actorId, organizationId);
    exigir(acceso, "administrar");
    if (
      !Number.isInteger(commissionRateBps) ||
      commissionRateBps < 0 ||
      commissionRateBps > 10_000
    )
      throw new BadRequestException("La comisión va de 0 % a 100 %.");
    const miembro = await this.prisma.userOrganization.findUnique({
      where: { userId_organizationId: { userId, organizationId } },
      select: { active: true },
    });
    if (!miembro)
      throw new NotFoundException("Ese usuario no es de la farmacia.");
    return this.prisma.$transaction(async (tx) => {
      const antes = await tx.preventaSeller.findUnique({
        where: { organizationId_userId: { organizationId, userId } },
      });
      const guardado = await tx.preventaSeller.upsert({
        where: { organizationId_userId: { organizationId, userId } },
        create: { organizationId, userId, commissionRateBps },
        update: { commissionRateBps },
      });
      await tx.auditLog.create({
        data: {
          organizationId,
          actorId,
          entityType: "PreventaSeller",
          entityId: guardado.id,
          action: "PREVENTA_SELLER_COMMISSION_UPDATED",
          before: { userId, commissionRateBps: antes?.commissionRateBps ?? 0 },
          after: { userId, commissionRateBps },
        },
      });
      return { userId, commissionRateBps };
    });
  }

  /**
   * Clientes para la preventa, con su dirección de entrega, ubicación, días
   * de visita, cartera y saldo. Un preventista sin "ver todos" sólo ve su
   * cartera.
   */
  async clientes(
    actorId: string,
    organizationId: string,
    filtro: { q?: string; hoy?: boolean; vendedorId?: string },
  ) {
    const acceso = await accesoPreventa(this.prisma, actorId, organizationId);
    const ajustes = await ajustesPreventa(this.prisma, organizationId);
    const soloCartera =
      !acceso.administrar &&
      !acceso.repartir &&
      !ajustes.sellerSeesAllCustomers;
    const q = filtro.q?.trim();
    const vendedor = soloCartera ? actorId : filtro.vendedorId;
    const clientes = await this.prisma.customer.findMany({
      where: {
        organizationId,
        active: true,
        ...(vendedor ? { preventaProfile: { sellerId: vendedor } } : {}),
        ...(q
          ? {
              OR: [
                { name: { contains: q, mode: "insensitive" } },
                { document: { contains: q } },
                { billingTaxId: { contains: q } },
                {
                  preventaProfile: {
                    address: { contains: q, mode: "insensitive" },
                  },
                },
              ],
            }
          : {}),
      },
      orderBy: { name: "asc" },
      take: q ? 100 : 500,
      include: {
        preventaProfile: true,
        priceList: { select: { name: true } },
      },
    });
    const dia = diaEnArgentina(new Date());
    const visibles = filtro.hoy
      ? clientes.filter((c) =>
          seVisitaEl(c.preventaProfile?.visitDays ?? 0, dia),
        )
      : clientes;
    const ids = visibles.map((c) => c.id);
    const [saldos, ultimos, nombres] = await Promise.all([
      acceso.verSaldos || acceso.administrar
        ? saldosDeClientes(this.prisma, organizationId, ids)
        : Promise.resolve(new Map<string, bigint>()),
      this.prisma.preventaOrder.groupBy({
        by: ["customerId"],
        where: {
          organizationId,
          customerId: { in: ids },
          status: { not: "CANCELLED" },
        },
        _max: { createdAt: true },
      }),
      nombresDeUsuarios(
        this.prisma,
        organizationId,
        visibles.map((c) => c.preventaProfile?.sellerId),
      ),
    ]);
    const ultimoDe = new Map(
      ultimos.map((u) => [u.customerId, u._max.createdAt]),
    );
    return visibles.map((c) => ({
      id: c.id,
      name: c.name,
      document: c.document ?? c.billingTaxId ?? null,
      address: c.preventaProfile?.address ?? c.billingAddress ?? null,
      reference: c.preventaProfile?.reference ?? null,
      phone: c.preventaProfile?.phone ?? c.billingPhone ?? null,
      latitude: c.preventaProfile?.latitude?.toNumber() ?? null,
      longitude: c.preventaProfile?.longitude?.toNumber() ?? null,
      visitDays: c.preventaProfile?.visitDays ?? 0,
      sellerId: c.preventaProfile?.sellerId ?? null,
      sellerName: c.preventaProfile?.sellerId
        ? (nombres.get(c.preventaProfile.sellerId) ?? null)
        : null,
      priceListName: c.priceList?.name ?? null,
      creditEnabled: c.creditEnabled,
      balanceMinor:
        acceso.verSaldos || acceso.administrar
          ? (saldos.get(c.id) ?? 0n).toString()
          : null,
      lastOrderAt: ultimoDe.get(c.id)?.toISOString() ?? null,
    }));
  }

  async guardarCliente(
    actorId: string,
    organizationId: string,
    customerId: string,
    datos: DatosClientePreventa,
  ) {
    const acceso = await accesoPreventa(this.prisma, actorId, organizationId);
    exigir(acceso, "vender", "repartir");
    const cliente = await this.prisma.customer.findFirst({
      where: { id: customerId, organizationId },
      select: { id: true },
    });
    if (!cliente) throw new NotFoundException("No encontramos ese cliente.");
    await this.validarDatosCliente(acceso, organizationId, datos);
    return this.prisma.$transaction(async (tx) => {
      const antes = await tx.preventaCustomer.findUnique({
        where: { customerId },
      });
      if (
        antes?.sellerId &&
        antes.sellerId !== actorId &&
        !acceso.administrar &&
        !acceso.repartir &&
        !(await ajustesPreventa(tx, organizationId)).sellerSeesAllCustomers
      )
        throw new ForbiddenException("Ese cliente es de otra cartera.");
      const valores = this.valoresCliente(acceso, datos);
      const guardado = await tx.preventaCustomer.upsert({
        where: { customerId },
        create: { customerId, organizationId, ...valores },
        update: valores,
      });
      await tx.auditLog.create({
        data: {
          organizationId,
          actorId,
          entityType: "PreventaCustomer",
          entityId: customerId,
          action: "PREVENTA_CUSTOMER_UPDATED",
          before: antes ? this.auditoriaCliente(antes) : Prisma.DbNull,
          after: this.auditoriaCliente(guardado),
        },
      });
      return { customerId };
    });
  }

  /**
   * Alta rápida de un cliente desde la calle (un kiosco nuevo). Escribe en
   * Clientes (decisión SISTEMA-108): sólo nombre, documento y contacto; la
   * cuenta corriente y la lista de precios se habilitan desde Clientes.
   */
  async crearCliente(
    actorId: string,
    organizationId: string,
    datos: ClienteNuevoPreventa,
  ) {
    const acceso = await accesoPreventa(this.prisma, actorId, organizationId);
    exigir(acceso, "vender");
    const name = datos.name.trim();
    if (!name) throw new BadRequestException("Escribí el nombre del cliente.");
    await this.validarDatosCliente(acceso, organizationId, datos);
    const valores = this.valoresCliente(acceso, datos);
    return this.prisma.$transaction(async (tx) => {
      const creado = await tx.customer.create({
        data: {
          organizationId,
          name: name.slice(0, 160),
          document: datos.document?.trim() || null,
          billingPhone: datos.phone?.trim().slice(0, 40) || null,
          billingAddress: datos.address?.trim().slice(0, 200) || null,
        },
      });
      await tx.preventaCustomer.create({
        data: {
          customerId: creado.id,
          organizationId,
          ...valores,
          // Lo que da de alta un preventista queda en su cartera.
          sellerId:
            valores.sellerId !== undefined
              ? valores.sellerId
              : acceso.vender
                ? actorId
                : null,
        },
      });
      await tx.auditLog.create({
        data: {
          organizationId,
          actorId,
          entityType: "Customer",
          entityId: creado.id,
          action: "CUSTOMER_CREATED",
          after: { name: creado.name, origen: "PREVENTA" },
        },
      });
      return { id: creado.id, name: creado.name };
    });
  }

  private async validarDatosCliente(
    acceso: AccesoPreventa,
    organizationId: string,
    datos: DatosClientePreventa,
  ) {
    if (!ubicacionValida(datos.latitude, datos.longitude))
      throw new BadRequestException("La ubicación del mapa no es válida.");
    if (datos.visitDays !== undefined && !diasValidos(datos.visitDays))
      throw new BadRequestException("Revisá los días de visita.");
    if (datos.sellerId !== undefined) {
      if (!acceso.administrar)
        throw new ForbiddenException(
          "Sólo quien administra la preventa cambia la cartera.",
        );
      if (datos.sellerId) {
        const miembro = await this.prisma.userOrganization.findUnique({
          where: {
            userId_organizationId: { userId: datos.sellerId, organizationId },
          },
          select: { active: true },
        });
        if (!miembro?.active)
          throw new BadRequestException("Elegí un preventista de la farmacia.");
      }
    }
  }

  private valoresCliente(acceso: AccesoPreventa, datos: DatosClientePreventa) {
    const texto = (valor: string | null | undefined, largo: number) =>
      valor === undefined ? undefined : valor?.trim().slice(0, largo) || null;
    return {
      ...(datos.address !== undefined
        ? { address: texto(datos.address, 200) }
        : {}),
      ...(datos.reference !== undefined
        ? { reference: texto(datos.reference, 300) }
        : {}),
      ...(datos.phone !== undefined ? { phone: texto(datos.phone, 40) } : {}),
      ...(datos.latitude !== undefined
        ? {
            latitude:
              datos.latitude === null
                ? null
                : new Prisma.Decimal(datos.latitude.toFixed(6)),
            longitude:
              datos.longitude == null
                ? null
                : new Prisma.Decimal(datos.longitude.toFixed(6)),
          }
        : {}),
      ...(datos.visitDays !== undefined ? { visitDays: datos.visitDays } : {}),
      ...(datos.sellerId !== undefined && acceso.administrar
        ? { sellerId: datos.sellerId }
        : {}),
    };
  }

  private auditoriaCliente(perfil: Prisma.PreventaCustomerGetPayload<object>) {
    return {
      address: perfil.address,
      reference: perfil.reference,
      phone: perfil.phone,
      latitude: perfil.latitude?.toString() ?? null,
      longitude: perfil.longitude?.toString() ?? null,
      visitDays: perfil.visitDays,
      sellerId: perfil.sellerId,
    };
  }

  /** Lista de precios del cliente (o Precio general) para cotizar. */
  private async listasPara(organizationId: string, customerId?: string) {
    const cliente = customerId
      ? await this.prisma.customer.findFirst({
          where: { id: customerId, organizationId },
          select: { priceListId: true },
        })
      : null;
    if (customerId && !cliente)
      throw new NotFoundException("No encontramos ese cliente.");
    return listasDelCliente(
      this.prisma,
      organizationId,
      cliente?.priceListId ?? null,
    );
  }

  /**
   * Productos para armar el pedido, con el precio del cliente, el stock (si
   * se muestra) y las ofertas vigentes con su detalle.
   */
  async productos(
    actorId: string,
    organizationId: string,
    filtro: {
      q?: string;
      clienteId?: string;
      pagina?: number;
      soloOfertas?: boolean;
      soloConStock?: boolean;
      ids?: string[];
    },
  ) {
    const acceso = await accesoPreventa(this.prisma, actorId, organizationId);
    exigir(acceso, "vender");
    const ajustes = await ajustesPreventa(this.prisma, organizationId);
    const listas = await this.listasPara(organizationId, filtro.clienteId);
    const verStock = ajustes.showStock || acceso.administrar;
    const q = filtro.q?.trim();
    const conStock =
      filtro.soloConStock || !ajustes.allowOutOfStock
        ? await this.idsConStock(organizationId, ajustes)
        : null;
    const porTexto = q ? await this.idsPorTexto(organizationId, q) : null;
    const base: Prisma.ProductWhereInput = {
      AND: [
        filtroProductos(organizationId, ajustes.branchId),
        { prices: { some: { priceListId: { in: idsDeListas(listas) } } } },
        ...(filtro.ids ? [{ id: { in: filtro.ids } }] : []),
        ...(conStock && !filtro.ids ? [{ id: { in: conStock } }] : []),
        ...(q && porTexto
          ? [
              {
                OR: [
                  { id: { in: porTexto } },
                  { barcodes: { some: { code: q } } },
                ],
              },
            ]
          : []),
      ],
    };
    const ofertas = ajustes.applyOffers
      ? await cargarOfertasMotor(this.prisma, organizationId, {
          desde: new Date(),
          canal: "POS",
        })
      : [];
    const contexto = {
      ahora: new Date(),
      branchId: ajustes.branchId,
      priceListId: listas.elegida,
    };
    const where: Prisma.ProductWhereInput = filtro.soloOfertas
      ? {
          AND: [
            base,
            {
              id: {
                in: (
                  await this.prisma.product.findMany({
                    where: base,
                    select: {
                      id: true,
                      categoryId: true,
                      laboratoryId: true,
                      isMedication: true,
                    },
                  })
                )
                  .filter(
                    (p) =>
                      ofertasDelProducto(
                        ofertas,
                        {
                          productId: p.id,
                          categoryId: p.categoryId,
                          laboratoryId: p.laboratoryId,
                          isMedication: p.isMedication,
                        },
                        contexto,
                      ).length > 0,
                  )
                  .map((p) => p.id),
              },
            },
          ],
        }
      : base;
    const pagina = Math.max(1, filtro.pagina ?? 1);
    const [total, productos] = await this.prisma.$transaction([
      this.prisma.product.count({ where }),
      this.prisma.product.findMany({
        where,
        orderBy: [{ name: "asc" }, { id: "asc" }],
        skip: filtro.ids ? 0 : (pagina - 1) * PRODUCTOS_POR_PAGINA,
        take: filtro.ids ? 200 : PRODUCTOS_POR_PAGINA,
        select: {
          id: true,
          name: true,
          brand: true,
          presentation: true,
          categoryId: true,
          laboratoryId: true,
          isMedication: true,
          laboratory: { select: { name: true } },
          image: { select: { updatedAt: true } },
          prices: {
            where: { priceListId: { in: idsDeListas(listas) } },
            select: { priceListId: true, amountMinor: true },
          },
        },
      }),
    ]);
    const stock = await stockPorProducto(
      this.prisma,
      organizationId,
      ajustes.branchId,
      productos.map((p) => p.id),
    );
    return {
      total,
      pagina,
      porPagina: PRODUCTOS_POR_PAGINA,
      items: productos.map((producto) => {
        const precio = precioEnListas(producto.prices, listas);
        const unidades = stock.get(producto.id) ?? 0;
        return {
          id: producto.id,
          name: producto.name,
          brand: producto.brand ?? producto.laboratory?.name ?? null,
          presentation: producto.presentation,
          hasImage: Boolean(producto.image),
          imageVersion: producto.image
            ? producto.image.updatedAt.getTime().toString(36)
            : null,
          priceMinor: precio?.toString() ?? null,
          stock: verStock ? unidades : null,
          inStock: unidades > 0,
          ofertas: ofertasDelProducto(
            ofertas,
            {
              productId: producto.id,
              categoryId: producto.categoryId,
              laboratoryId: producto.laboratoryId,
              isMedication: producto.isMedication,
            },
            contexto,
            precio,
          ),
        };
      }),
    };
  }

  /**
   * Productos cuyo nombre, marca o laboratorio contienen todas las palabras
   * buscadas, sin importar tildes ni mayúsculas ("jabon" encuentra "Jabón"),
   * como el buscador de la app de preventistas anterior.
   */
  private async idsPorTexto(organizationId: string, texto: string) {
    const palabras = sinTildes(texto)
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 6)
      // %, _ y \ se buscan tal cual, no como comodines de LIKE.
      .map((palabra) => `%${palabra.replace(/[\\%_]/g, (c) => `\\${c}`)}%`);
    if (!palabras.length) return [];
    const filas = await this.prisma.$queryRaw<{ id: string }[]>`
      SELECT p.id FROM "Product" p
      LEFT JOIN "Laboratory" l ON l.id = p."laboratoryId"
      WHERE p."organizationId" = ${organizationId}::uuid
        AND ${Prisma.join(
          palabras.map(
            (patron) =>
              Prisma.sql`translate(lower(coalesce(p.name, '') || ' ' || coalesce(p.brand, '') || ' ' || coalesce(l.name, '')), ${CON_TILDE}, ${SIN_TILDE}) LIKE ${patron}`,
          ),
          " AND ",
        )}
      LIMIT 5000`;
    return filas.map((f) => f.id);
  }

  private async idsConStock(organizationId: string, ajustes: AjustesPreventa) {
    const grupos = await this.prisma.productLot.groupBy({
      by: ["productId"],
      where: {
        organizationId,
        branchId: ajustes.branchId,
        quantity: { gt: 0 },
      },
    });
    return grupos.map((g) => g.productId);
  }

  /**
   * Ofertas vigentes para mostrar al preventista (apartado Ofertas): qué
   * dice cada una y a qué productos llega. Son las de mostrador.
   */
  async ofertas(actorId: string, organizationId: string) {
    const acceso = await accesoPreventa(this.prisma, actorId, organizationId);
    exigir(acceso, "vender");
    const ajustes = await ajustesPreventa(this.prisma, organizationId);
    if (!ajustes.applyOffers) return [];
    const ahora = new Date();
    const contexto = { ahora, branchId: ajustes.branchId, priceListId: "" };
    const motor = (
      await cargarOfertasMotor(this.prisma, organizationId, {
        desde: ahora,
        canal: "POS",
      })
    ).filter((o) => o.remainingUnits !== 0 && o.type !== "PAYMENT_METHOD");
    if (!motor.length) return [];
    const guardadas = await this.prisma.offer.findMany({
      where: { id: { in: motor.map((o) => o.id) } },
      select: {
        id: true,
        endsAt: true,
        allProducts: true,
        targets: {
          where: { exclude: false },
          select: {
            product: { select: { name: true } },
            category: { select: { name: true } },
            laboratory: { select: { name: true } },
          },
          take: 12,
        },
      },
    });
    const porId = new Map(guardadas.map((g) => [g.id, g]));
    return motor
      .sort((a, b) => b.priority - a.priority)
      .map((o) => {
        const g = porId.get(o.id);
        return {
          id: o.id,
          name: o.name,
          label: etiquetaCatalogo(o),
          detalle: detalleOferta(o),
          vigenteAhora: aplicaEn(o, contexto),
          endsAt: g?.endsAt?.toISOString() ?? null,
          alcance: g?.allProducts
            ? ["Todos los productos"]
            : (g?.targets ?? [])
                .map(
                  (t) =>
                    t.product?.name ??
                    (t.category ? `Categoría ${t.category.name}` : null) ??
                    (t.laboratory ? `Laboratorio ${t.laboratory.name}` : null),
                )
                .filter((n): n is string => Boolean(n)),
          minimoMinor:
            o.type === "SPEND_THRESHOLD"
              ? (o.minPurchaseMinor ?? 0n).toString()
              : null,
        };
      });
  }

  /** Cotización del pedido en armado: precios, ofertas y avisos. No guarda nada. */
  async cotizar(
    actorId: string,
    organizationId: string,
    datos: { customerId?: string; items: RenglonPreventa[] },
  ) {
    const acceso = await accesoPreventa(this.prisma, actorId, organizationId);
    exigir(acceso, "vender");
    const ajustes = await ajustesPreventa(this.prisma, organizationId);
    const listas = await this.listasPara(organizationId, datos.customerId);
    const carrito = await armarCarrito(this.prisma, {
      organizationId,
      ajustes,
      listas,
      renglones: unirRenglonesPreventa(datos.items),
      puedeBajarPrecio: ajustes.sellerCanChangePrice || acceso.administrar,
      estricto: false,
      bloquear: false,
    });
    return serializarCarrito(carrito, ajustes.showStock || acceso.administrar);
  }
}
