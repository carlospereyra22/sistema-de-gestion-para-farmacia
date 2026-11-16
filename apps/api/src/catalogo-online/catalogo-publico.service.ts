import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import { hash, verify } from "@node-rs/argon2";
import { Prisma } from "@prisma/client";

import { resolveSubscriptionAccess } from "../platform/subscription-access";
import { cargarOfertasMotor, parametrosOferta } from "../offers/ofertas-carga";
import {
  aplicaEn,
  calcularOfertas,
  etiquetaOferta,
  type ContextoOfertas,
  type OfertaMotor,
} from "../offers/ofertas-motor";
import { PrismaService } from "../prisma/prisma.service";
import {
  etiquetaCatalogo,
  mensajeSugerencia,
  ofertasDeLaCompra,
  ofertasDelProducto,
} from "./catalogo-ofertas";
import {
  categoriasConRuta,
  correoNormalizado,
  huellaDelPedido,
  precioDeCatalogo,
  siguienteEstado,
  totalDelPedido,
  unirRenglones,
  type RenglonPedido,
} from "./catalogo-reglas";
import {
  DURACION_SESION_PORTAL_MS,
  leerCookiePortal,
  nuevoSecreto,
  secretoCoincide,
} from "./portal-sesion";

/** Productos por página del catálogo público. */
export const PRODUCTOS_POR_PAGINA = 40;
/** Renovar la sesión si le queda menos que esto (evita escribir en cada pedido). */
const RENOVAR_SI_QUEDA_MS = DURACION_SESION_PORTAL_MS - 24 * 60 * 60 * 1000;

type Catalogo = Prisma.CatalogSettingsGetPayload<{
  include: {
    organization: {
      select: { name: true; active: true; catalogEnabled: true };
    };
  };
}>;

export type SesionPortal = {
  portalUserId: string;
  sessionId: string;
  customerId: string;
  customerPriceListId: string | null;
  name: string;
  email: string;
};

export type PedidoNuevo = {
  requestId: string;
  items: RenglonPedido[];
  delivery: "PICKUP" | "DELIVERY";
  deliveryAddress?: string;
  notes?: string;
  expectedTotalMinor?: string;
};

const pedidoConRenglones = {
  items: { orderBy: { productName: "asc" } },
} as const;
type PedidoConRenglones = Prisma.CatalogOrderGetPayload<{
  include: typeof pedidoConRenglones;
}>;

/**
 * Lo que ve y hace el cliente en el catálogo online (SISTEMA-107). Rutas sin
 * sesión de farmacia: todo se busca por la dirección pública (slug) y nunca se
 * devuelve un dato de otra organización ni de la gestión (costos, stock exacto).
 */
@Injectable()
export class CatalogoPublicoService {
  /** Hash de relleno: un correo inexistente tarda lo mismo que uno real. */
  private hashDeRelleno?: Promise<string>;

  constructor(private readonly prisma: PrismaService) {}

  /** Catálogo publicado de una farmacia activa, o 404. */
  async catalogo(slug: string): Promise<Catalogo> {
    const catalogo = await this.prisma.catalogSettings.findUnique({
      where: { slug },
      // Sin el logo: son bytes y no hacen falta en cada pedido.
      include: {
        organization: {
          select: { name: true, active: true, catalogEnabled: true },
        },
      },
    });
    if (
      !catalogo?.published ||
      !catalogo.organization.active ||
      !catalogo.organization.catalogEnabled
    )
      throw new NotFoundException("Este catálogo no está disponible.");
    // Con el servicio cortado o en solo lectura, el catálogo no se ofrece.
    const suscripcion = await this.prisma.organizationSubscription.findUnique({
      where: { organizationId: catalogo.organizationId },
      select: {
        exempt: true,
        suspendedAt: true,
        cancelledAt: true,
        trialEndsAt: true,
        paidThrough: true,
        extendedUntil: true,
      },
    });
    if (
      suscripcion &&
      resolveSubscriptionAccess(suscripcion, new Date()).access !== "FULL"
    )
      throw new NotFoundException("Este catálogo no está disponible.");
    return catalogo;
  }

  /** Datos de la portada: nombre, opciones y, si hay, quién inició sesión. */
  async portada(slug: string, cookie: unknown) {
    const catalogo = await this.catalogo(slug);
    const sesion = await this.sesion(catalogo, cookie);
    const sucursal = await this.prisma.branch.findUnique({
      where: { id: catalogo.branchId },
      select: { address: true, city: true, phone: true },
    });
    return {
      slug: catalogo.slug,
      name: catalogo.displayName,
      organizationName: catalogo.organization.name,
      hasLogo:
        (await this.prisma.organization.count({
          where: { id: catalogo.organizationId, documentLogo: { not: null } },
        })) > 0,
      requireLogin: catalogo.requireLogin,
      showPrices: catalogo.showPricesPublic || Boolean(sesion),
      pickupEnabled: catalogo.pickupEnabled,
      deliveryEnabled: catalogo.deliveryEnabled,
      address: [sucursal?.address, sucursal?.city].filter(Boolean).join(", "),
      phone: sucursal?.phone ?? "",
      user: sesion ? { name: sesion.name, email: sesion.email } : null,
      // El apartado Ofertas aparece sólo si hay alguna vigente para mostrar.
      hayOfertas: await this.hayOfertas(catalogo, sesion),
    };
  }

  private async hayOfertas(catalogo: Catalogo, sesion: SesionPortal | null) {
    if (!catalogo.showPricesPublic && !sesion) return false;
    const ofertas = await this.ofertas(this.prisma, catalogo);
    if (!ofertas.length) return false;
    const contexto = this.contextoOfertas(
      catalogo,
      await this.listas(catalogo, sesion),
    );
    return ofertas.some(
      (o) =>
        o.type !== "PAYMENT_METHOD" &&
        o.remainingUnits !== 0 &&
        aplicaEn(o, contexto),
    );
  }

  /** Productos que se pueden mostrar: activos, sin receta y vendibles en la sucursal. */
  private filtroBase(catalogo: Catalogo): Prisma.ProductWhereInput {
    return {
      organizationId: catalogo.organizationId,
      active: true,
      // Los medicamentos bajo receta no se publican (normativa; DECISIONS).
      prescriptionRequired: false,
      branchStates: {
        none: { branchId: catalogo.branchId, status: { not: "ACTIVE" } },
      },
    };
  }

  /** Listas que dan el precio: la del cliente o la del catálogo, su respaldo y la general. */
  private async listas(catalogo: Catalogo, sesion: SesionPortal | null) {
    const general = await this.prisma.priceList.findFirst({
      where: {
        organizationId: catalogo.organizationId,
        name: "Precio general",
        active: true,
      },
      select: { id: true },
    });
    const pedida =
      (sesion?.customerPriceListId ?? catalogo.priceListId) || general?.id;
    const elegida = pedida
      ? await this.prisma.priceList.findFirst({
          where: {
            id: pedida,
            organizationId: catalogo.organizationId,
            active: true,
          },
          select: { id: true, fallbackPriceListId: true },
        })
      : null;
    const id = elegida?.id ?? general?.id;
    if (!id)
      throw new NotFoundException("La farmacia todavía no cargó sus precios.");
    const respaldo = elegida?.fallbackPriceListId
      ? await this.prisma.priceList.findFirst({
          where: {
            id: elegida.fallbackPriceListId,
            organizationId: catalogo.organizationId,
            active: true,
          },
          select: { id: true },
        })
      : null;
    return {
      elegida: id,
      respaldo: respaldo?.id ?? null,
      general: general?.id ?? null,
    };
  }

  /** Productos con stock en la sucursal del catálogo. */
  private async conStock(catalogo: Catalogo, productIds?: string[]) {
    const grupos = await this.prisma.productLot.groupBy({
      by: ["productId"],
      where: {
        organizationId: catalogo.organizationId,
        branchId: catalogo.branchId,
        quantity: { gt: 0 },
        ...(productIds ? { productId: { in: productIds } } : {}),
      },
    });
    return new Set(grupos.map(({ productId }) => productId));
  }

  /** Ids de los productos del filtro que tienen alguna oferta vigente. */
  private async conOferta(
    where: Prisma.ProductWhereInput,
    ofertas: readonly OfertaMotor[],
    contexto: ContextoOfertas,
  ): Promise<string[]> {
    if (!ofertas.length) return [];
    const productos = await this.prisma.product.findMany({
      where,
      select: {
        id: true,
        categoryId: true,
        laboratoryId: true,
        isMedication: true,
      },
    });
    return productos
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
      .map((p) => p.id);
  }

  /** Ofertas publicadas para el catálogo (canal catálogo o ambos). */
  private ofertas(
    cliente: Prisma.TransactionClient,
    catalogo: Catalogo,
    bloquear = false,
  ) {
    return cargarOfertasMotor(cliente, catalogo.organizationId, {
      desde: new Date(),
      canal: "CATALOG",
      bloquear,
    });
  }

  private contextoOfertas(
    catalogo: Catalogo,
    listas: { elegida: string },
    ahora = new Date(),
  ): ContextoOfertas {
    return { ahora, branchId: catalogo.branchId, priceListId: listas.elegida };
  }

  async productos(
    slug: string,
    cookie: unknown,
    filtro: {
      q?: string;
      categoria?: string;
      pagina?: number;
      ids?: string[];
      soloOfertas?: boolean;
    },
  ) {
    const catalogo = await this.catalogo(slug);
    const sesion = await this.sesion(catalogo, cookie);
    this.exigirAcceso(catalogo, sesion);
    const listas = await this.listas(catalogo, sesion);
    const idsListas = [listas.elegida, listas.respaldo, listas.general].filter(
      (id): id is string => Boolean(id),
    );
    const stock = await this.conStock(catalogo);
    const q = filtro.q?.trim();
    const verPrecios = catalogo.showPricesPublic || Boolean(sesion);
    // Ofertas del catálogo (SISTEMA-107): sólo si se ven los precios.
    const ofertas = verPrecios ? await this.ofertas(this.prisma, catalogo) : [];
    const contexto = this.contextoOfertas(catalogo, listas);
    const base: Prisma.ProductWhereInput = {
      ...this.filtroBase(catalogo),
      prices: { some: { priceListId: { in: idsListas } } },
      // Los del carrito se piden aunque no tengan stock, para avisarlo.
      ...(filtro.ids
        ? { id: { in: filtro.ids } }
        : catalogo.showOutOfStock
          ? {}
          : { id: { in: [...stock] } }),
      ...(filtro.categoria ? { categoryId: filtro.categoria } : {}),
      ...(q
        ? {
            OR: [
              { name: { contains: q, mode: "insensitive" } },
              { brand: { contains: q, mode: "insensitive" } },
              { laboratory: { name: { contains: q, mode: "insensitive" } } },
            ],
          }
        : {}),
    };
    // Apartado Ofertas: sólo los productos que tienen alguna vigente.
    const where: Prisma.ProductWhereInput = filtro.soloOfertas
      ? {
          AND: [
            base,
            { id: { in: await this.conOferta(base, ofertas, contexto) } },
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
        take: filtro.ids ? 100 : PRODUCTOS_POR_PAGINA,
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
            where: { priceListId: { in: idsListas } },
            select: { priceListId: true, amountMinor: true },
          },
        },
      }),
    ]);
    return {
      total,
      pagina,
      porPagina: PRODUCTOS_POR_PAGINA,
      items: productos.map((producto) => {
        const precio = precioDeCatalogo(
          new Map(producto.prices.map((p) => [p.priceListId, p.amountMinor])),
          listas,
        );
        return {
          id: producto.id,
          name: producto.name,
          brand: producto.brand ?? producto.laboratory?.name ?? null,
          presentation: producto.presentation,
          categoryId: producto.categoryId,
          hasImage: Boolean(producto.image),
          // Va en la dirección de la foto: si cambia, el navegador la pide de nuevo.
          imageVersion: producto.image
            ? producto.image.updatedAt.getTime().toString(36)
            : null,
          priceMinor: verPrecios && precio !== null ? precio.toString() : null,
          inStock: stock.has(producto.id),
          ofertas: ofertasDelProducto(
            ofertas,
            {
              productId: producto.id,
              categoryId: producto.categoryId,
              laboratoryId: producto.laboratoryId,
              isMedication: producto.isMedication,
            },
            contexto,
            verPrecios ? precio : null,
          ),
        };
      }),
    };
  }

  /** Categorías que tienen al menos un producto visible. */
  async categorias(slug: string, cookie: unknown) {
    const catalogo = await this.catalogo(slug);
    const sesion = await this.sesion(catalogo, cookie);
    this.exigirAcceso(catalogo, sesion);
    const stock = catalogo.showOutOfStock
      ? null
      : await this.conStock(catalogo);
    const grupos = await this.prisma.product.groupBy({
      by: ["categoryId"],
      where: {
        ...this.filtroBase(catalogo),
        categoryId: { not: null },
        ...(stock ? { id: { in: [...stock] } } : {}),
      },
    });
    const ids = grupos
      .map(({ categoryId }) => categoryId)
      .filter((id): id is string => Boolean(id));
    // Todas las de la farmacia, para armar la ruta "Padre › Hijo".
    const todas = await this.prisma.category.findMany({
      where: { organizationId: catalogo.organizationId },
      select: { id: true, name: true, parentId: true, active: true },
    });
    return categoriasConRuta(todas, new Set(ids));
  }

  async imagen(slug: string, cookie: unknown, productId: string) {
    const catalogo = await this.catalogo(slug);
    this.exigirAcceso(catalogo, await this.sesion(catalogo, cookie));
    const imagen = await this.prisma.productImage.findFirst({
      where: {
        productId,
        organizationId: catalogo.organizationId,
        product: this.filtroBase(catalogo),
      },
      select: { content: true },
    });
    if (!imagen) throw new NotFoundException("El producto no tiene foto.");
    return Buffer.from(imagen.content);
  }

  async logo(slug: string) {
    const catalogo = await this.catalogo(slug);
    const organizacion = await this.prisma.organization.findUnique({
      where: { id: catalogo.organizationId },
      select: { documentLogo: true },
    });
    if (!organizacion?.documentLogo)
      throw new NotFoundException("La farmacia no tiene logo.");
    return Buffer.from(organizacion.documentLogo);
  }

  /** Ingreso de un usuario del portal. Devuelve el valor de la cookie. */
  async ingresar(slug: string, email: string, password: string) {
    const catalogo = await this.catalogo(slug);
    const usuario = await this.prisma.catalogPortalUser.findUnique({
      where: {
        organizationId_email: {
          organizationId: catalogo.organizationId,
          email: correoNormalizado(email),
        },
      },
      include: { customer: { select: { active: true, organizationId: true } } },
    });
    const valida = usuario
      ? await verify(usuario.passwordHash, password)
      : await verify(await this.relleno(), password).then(() => false);
    if (
      !usuario ||
      !valida ||
      !usuario.active ||
      !usuario.customer.active ||
      usuario.customer.organizationId !== catalogo.organizationId
    )
      throw new UnauthorizedException(
        "El correo o la contraseña no son correctos.",
      );
    const { secreto, hash: tokenHash } = nuevoSecreto();
    const sesion = await this.prisma.$transaction(async (tx) => {
      await tx.catalogPortalUser.update({
        where: { id: usuario.id },
        data: { lastLoginAt: new Date() },
      });
      return tx.catalogPortalSession.create({
        data: {
          portalUserId: usuario.id,
          tokenHash,
          expiresAt: new Date(Date.now() + DURACION_SESION_PORTAL_MS),
        },
      });
    });
    return `${sesion.id}.${secreto}`;
  }

  async salir(cookie: unknown) {
    const partes = leerCookiePortal(cookie);
    if (!partes) return;
    await this.prisma.catalogPortalSession.updateMany({
      where: { id: partes.sessionId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  /** Sesión vigente del portal para este catálogo, o null. */
  async sesion(
    catalogo: Catalogo,
    cookie: unknown,
  ): Promise<SesionPortal | null> {
    const partes = leerCookiePortal(cookie);
    if (!partes) return null;
    const sesion = await this.prisma.catalogPortalSession.findUnique({
      where: { id: partes.sessionId },
      include: {
        portalUser: {
          include: {
            customer: {
              select: { active: true, organizationId: true, priceListId: true },
            },
          },
        },
      },
    });
    const ahora = Date.now();
    if (
      !sesion ||
      sesion.revokedAt ||
      sesion.expiresAt.getTime() <= ahora ||
      !secretoCoincide(sesion.tokenHash, partes.secreto)
    )
      return null;
    const usuario = sesion.portalUser;
    if (
      usuario.organizationId !== catalogo.organizationId ||
      !usuario.active ||
      !usuario.customer.active ||
      usuario.customer.organizationId !== catalogo.organizationId
    )
      return null;
    // Vencimiento deslizante: se renueva como mucho una vez por día.
    if (sesion.expiresAt.getTime() - ahora < RENOVAR_SI_QUEDA_MS)
      await this.prisma.catalogPortalSession.update({
        where: { id: sesion.id },
        data: { expiresAt: new Date(ahora + DURACION_SESION_PORTAL_MS) },
      });
    return {
      portalUserId: usuario.id,
      sessionId: sesion.id,
      customerId: usuario.customerId,
      customerPriceListId: usuario.customer.priceListId,
      name: usuario.name,
      email: usuario.email,
    };
  }

  private exigirAcceso(catalogo: Catalogo, sesion: SesionPortal | null) {
    if (catalogo.requireLogin && !sesion)
      throw new UnauthorizedException("Ingresá para ver el catálogo.");
  }

  private async exigirSesion(slug: string, cookie: unknown) {
    const catalogo = await this.catalogo(slug);
    const sesion = await this.sesion(catalogo, cookie);
    if (!sesion)
      throw new UnauthorizedException("Ingresá para hacer tu pedido.");
    return { catalogo, sesion };
  }

  async crearPedido(slug: string, cookie: unknown, pedido: PedidoNuevo) {
    const { catalogo, sesion } = await this.exigirSesion(slug, cookie);
    const renglones = unirRenglones(pedido.items);
    if (!renglones.length)
      throw new BadRequestException("El carrito está vacío.");
    if (pedido.delivery === "PICKUP" && !catalogo.pickupEnabled)
      throw new BadRequestException(
        "La farmacia no ofrece retiro en el local.",
      );
    if (pedido.delivery === "DELIVERY" && !catalogo.deliveryEnabled)
      throw new BadRequestException("La farmacia no ofrece envío a domicilio.");
    const direccion =
      pedido.delivery === "DELIVERY"
        ? pedido.deliveryAddress?.trim()
        : undefined;
    if (pedido.delivery === "DELIVERY" && !direccion)
      throw new BadRequestException("Escribí la dirección de entrega.");
    const notas = pedido.notes?.trim() || null;
    const requestHash = huellaDelPedido({
      items: renglones,
      delivery: pedido.delivery,
      deliveryAddress: direccion,
      notes: notas,
    });
    const listas = await this.listas(catalogo, sesion);

    try {
      return await this.prisma.$transaction(async (tx) => {
        const previo = await tx.catalogOrder.findUnique({
          where: {
            organizationId_requestId: {
              organizationId: catalogo.organizationId,
              requestId: pedido.requestId,
            },
          },
          include: pedidoConRenglones,
        });
        if (previo) {
          if (
            previo.requestHash !== requestHash ||
            previo.portalUserId !== sesion.portalUserId
          )
            throw new ConflictException(
              "Este pedido ya se envió con otros datos. Revisá Mis pedidos.",
            );
          return serializarPedido(previo);
        }
        // El número de pedido es correlativo: se toma con la fila bloqueada.
        await tx.$queryRaw`SELECT "organizationId" FROM "CatalogSettings" WHERE "organizationId" = ${catalogo.organizationId}::uuid FOR UPDATE`;
        // Precios y ofertas otra vez en el servidor; las ofertas con tope
        // quedan bloqueadas hasta terminar (dos pedidos no lo pasan).
        const carrito = await this.armarCarrito(
          tx,
          catalogo,
          listas,
          renglones,
          { estricto: true, bloquear: true },
        );
        const items = carrito.items.map((item) => ({
          productId: item.productId,
          productName: item.productName,
          quantity: item.quantity,
          unitPriceMinor: item.unitPriceMinor,
          discountMinor: item.discountMinor,
          totalMinor: item.totalMinor,
        }));
        const total = carrito.totalMinor;
        if (
          pedido.expectedTotalMinor !== undefined &&
          pedido.expectedTotalMinor !== total.toString()
        )
          throw new ConflictException(
            "Los precios cambiaron. Revisá el carrito y volvé a confirmar.",
          );
        const { lastOrderNumber } = await tx.catalogSettings.update({
          where: { organizationId: catalogo.organizationId },
          data: { lastOrderNumber: { increment: 1 } },
          select: { lastOrderNumber: true },
        });
        const creado = await tx.catalogOrder.create({
          data: {
            organizationId: catalogo.organizationId,
            branchId: catalogo.branchId,
            number: lastOrderNumber,
            customerId: sesion.customerId,
            portalUserId: sesion.portalUserId,
            delivery: pedido.delivery,
            deliveryAddress: direccion ?? null,
            notes: notas,
            priceListId: listas.elegida,
            totalMinor: total,
            requestId: pedido.requestId,
            requestHash,
            items: { create: items },
          },
          include: pedidoConRenglones,
        });
        await this.guardarOfertas(
          tx,
          catalogo.organizationId,
          creado.id,
          carrito.aplicaciones,
          carrito.ofertas,
        );
        await tx.auditLog.create({
          data: {
            organizationId: catalogo.organizationId,
            branchId: catalogo.branchId,
            actorId: null,
            entityType: "CatalogOrder",
            entityId: creado.id,
            action: "CATALOG_ORDER_CREATED",
            after: {
              number: creado.number,
              portalUserId: sesion.portalUserId,
              customerId: sesion.customerId,
              totalMinor: total.toString(),
              ahorroMinor: carrito.ahorroMinor.toString(),
              items: items.length,
            },
          },
        });
        return serializarPedido(creado);
      });
    } catch (error) {
      // Dos envíos simultáneos del mismo pedido: el segundo devuelve el primero.
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        const previo = await this.prisma.catalogOrder.findUnique({
          where: {
            organizationId_requestId: {
              organizationId: catalogo.organizationId,
              requestId: pedido.requestId,
            },
          },
          include: pedidoConRenglones,
        });
        if (previo?.requestHash === requestHash)
          return serializarPedido(previo);
      }
      throw error;
    }
  }

  /**
   * Carrito con precios y ofertas, calculado en el servidor con el mismo motor
   * que Ventas. Estricto (al confirmar): un producto que no se puede pedir
   * corta con un mensaje. Sin estricto (al cotizar): se informa y se sigue.
   */
  private async armarCarrito(
    cliente: Prisma.TransactionClient,
    catalogo: Catalogo,
    listas: {
      elegida: string;
      respaldo: string | null;
      general: string | null;
    },
    renglones: readonly RenglonPedido[],
    opciones: { estricto: boolean; bloquear: boolean },
  ) {
    const idsListas = [listas.elegida, listas.respaldo, listas.general].filter(
      (id): id is string => Boolean(id),
    );
    const productos = await cliente.product.findMany({
      where: {
        ...this.filtroBase(catalogo),
        id: { in: renglones.map(({ productId }) => productId) },
      },
      select: {
        id: true,
        name: true,
        categoryId: true,
        laboratoryId: true,
        isMedication: true,
        prices: {
          where: { priceListId: { in: idsListas } },
          select: { priceListId: true, amountMinor: true },
        },
      },
    });
    const porId = new Map(productos.map((p) => [p.id, p]));
    const stock = await this.conStock(
      catalogo,
      renglones.map(({ productId }) => productId),
    );
    const noDisponibles: string[] = [];
    const validos: {
      productId: string;
      productName: string;
      quantity: number;
      unitPriceMinor: bigint;
      categoryId: string | null;
      laboratoryId: string | null;
      isMedication: boolean;
    }[] = [];
    for (const { productId, quantity } of renglones) {
      const producto = porId.get(productId);
      const precio = producto
        ? precioDeCatalogo(
            new Map(producto.prices.map((p) => [p.priceListId, p.amountMinor])),
            listas,
          )
        : null;
      const sinStock = !catalogo.showOutOfStock && !stock.has(productId);
      if (opciones.estricto) {
        if (!producto)
          throw new BadRequestException(
            "Algún producto del carrito ya no está disponible. Actualizá el carrito.",
          );
        if (sinStock)
          throw new BadRequestException(
            `${producto.name} ya no tiene stock. Quitalo del carrito para seguir.`,
          );
        if (precio === null)
          throw new BadRequestException(
            `${producto.name} no tiene precio. Quitalo del carrito para seguir.`,
          );
      }
      if (!producto || precio === null || sinStock) {
        noDisponibles.push(productId);
        continue;
      }
      validos.push({
        productId,
        productName: producto.name.slice(0, 200),
        quantity,
        unitPriceMinor: precio,
        categoryId: producto.categoryId,
        laboratoryId: producto.laboratoryId,
        isMedication: producto.isMedication,
      });
    }
    const ofertas = await this.ofertas(cliente, catalogo, opciones.bloquear);
    const contexto = this.contextoOfertas(catalogo, listas);
    const resultado = calcularOfertas(
      validos.map((v) => ({
        productId: v.productId,
        quantity: v.quantity,
        unitPriceMinor: v.unitPriceMinor,
        categoryId: v.categoryId,
        laboratoryId: v.laboratoryId,
        isMedication: v.isMedication,
        manualPrice: false,
      })),
      ofertas,
      contexto,
    );
    const items = validos.map((v) => {
      const renglon = resultado.renglones.find(
        (r) => r.productId === v.productId,
      );
      const brutoMinor = v.unitPriceMinor * BigInt(v.quantity);
      const discountMinor =
        (renglon?.offerDiscountMinor ?? 0n) > brutoMinor
          ? brutoMinor
          : (renglon?.offerDiscountMinor ?? 0n);
      return {
        ...v,
        discountMinor,
        totalMinor: brutoMinor - discountMinor,
        labels: renglon?.labels ?? [],
        inStock: stock.has(v.productId),
      };
    });
    return {
      items,
      noDisponibles,
      ofertas,
      aplicaciones: resultado.aplicaciones,
      sugerencias: resultado.sugerencias,
      deLaCompra: ofertasDeLaCompra(ofertas, contexto),
      ahorroMinor: items.reduce((s, i) => s + i.discountMinor, 0n),
      totalMinor:
        totalDelPedido(items) - items.reduce((s, i) => s + i.discountMinor, 0n),
    };
  }

  /** Foto de las ofertas aplicadas, en la misma transacción del pedido. */
  private async guardarOfertas(
    tx: Prisma.TransactionClient,
    organizationId: string,
    orderId: string,
    aplicaciones: readonly {
      offerId: string;
      version: number;
      name: string;
      label: string;
      type: OfertaMotor["type"];
      discountMinor: bigint;
      items: {
        productId: string;
        units: number;
        grossMinor: bigint;
        discountMinor: bigint;
      }[];
    }[],
    ofertas: readonly OfertaMotor[],
  ) {
    for (const aplicacion of aplicaciones) {
      const oferta = ofertas.find((o) => o.id === aplicacion.offerId);
      const items = aplicacion.items.filter((item) => item.units > 0);
      if (!oferta || !items.length) continue;
      await tx.catalogOrderOffer.create({
        data: {
          organizationId,
          orderId,
          offerId: aplicacion.offerId,
          offerVersion: aplicacion.version,
          name: aplicacion.name.slice(0, 120),
          label: (aplicacion.label || etiquetaOferta(oferta)).slice(0, 60),
          type: aplicacion.type,
          parameters: parametrosOferta(oferta),
          units: items.reduce((suma, item) => suma + item.units, 0),
          discountMinor: aplicacion.discountMinor,
          items: {
            create: items.map((item) => ({
              productId: item.productId,
              units: item.units,
              grossMinor:
                item.grossMinor > item.discountMinor
                  ? item.grossMinor
                  : item.discountMinor,
              discountMinor: item.discountMinor,
            })),
          },
        },
      });
    }
  }

  /**
   * Cotización del carrito (SISTEMA-107): precios, ofertas, ahorro y lo que
   * falta para la próxima oferta. No guarda nada.
   */
  async cotizar(slug: string, cookie: unknown, items: RenglonPedido[]) {
    const catalogo = await this.catalogo(slug);
    const sesion = await this.sesion(catalogo, cookie);
    this.exigirAcceso(catalogo, sesion);
    if (!catalogo.showPricesPublic && !sesion)
      throw new UnauthorizedException("Ingresá para ver tus precios.");
    const listas = await this.listas(catalogo, sesion);
    const carrito = await this.armarCarrito(
      this.prisma,
      catalogo,
      listas,
      unirRenglones(items),
      { estricto: false, bloquear: false },
    );
    return {
      items: carrito.items.map((item) => ({
        productId: item.productId,
        quantity: item.quantity,
        unitPriceMinor: item.unitPriceMinor.toString(),
        discountMinor: item.discountMinor.toString(),
        totalMinor: item.totalMinor.toString(),
        // La misma etiqueta que la tarjeta ("x2 → 5% | x4 → 10%").
        labels: carrito.aplicaciones
          .filter((a) => a.items.some((i) => i.productId === item.productId))
          .map((a) => {
            const oferta = carrito.ofertas.find((o) => o.id === a.offerId);
            return oferta ? etiquetaCatalogo(oferta) : a.label;
          }),
        inStock: item.inStock,
      })),
      noDisponibles: carrito.noDisponibles,
      sugerencias: carrito.sugerencias.map((s) => ({
        offerId: s.offerId,
        label: s.label,
        productIds: s.productIds,
        faltan: s.faltan,
        mensaje: mensajeSugerencia(
          carrito.ofertas.find((o) => o.id === s.offerId),
          s,
          carrito.items
            .filter((i) => s.productIds.includes(i.productId))
            .reduce((suma, i) => suma + i.quantity, 0),
        ),
        faltaMinor: s.porMonto?.faltaMinor.toString() ?? null,
      })),
      ofertasDeLaCompra: carrito.deLaCompra,
      aplicadas: carrito.aplicaciones.map((a) => ({
        offerId: a.offerId,
        label: a.label,
        name: a.name,
        discountMinor: a.discountMinor.toString(),
      })),
      ahorroMinor: carrito.ahorroMinor.toString(),
      totalMinor: carrito.totalMinor.toString(),
    };
  }

  async misPedidos(slug: string, cookie: unknown) {
    const { catalogo, sesion } = await this.exigirSesion(slug, cookie);
    const pedidos = await this.prisma.catalogOrder.findMany({
      where: {
        organizationId: catalogo.organizationId,
        portalUserId: sesion.portalUserId,
      },
      orderBy: { createdAt: "desc" },
      take: 100,
      include: pedidoConRenglones,
    });
    return pedidos.map(serializarPedido);
  }

  async miPedido(slug: string, cookie: unknown, orderId: string) {
    const { catalogo, sesion } = await this.exigirSesion(slug, cookie);
    const pedido = await this.prisma.catalogOrder.findFirst({
      where: {
        id: orderId,
        organizationId: catalogo.organizationId,
        portalUserId: sesion.portalUserId,
      },
      include: pedidoConRenglones,
    });
    if (!pedido) throw new NotFoundException("No encontramos ese pedido.");
    return serializarPedido(pedido);
  }

  /** El cliente cancela su pedido mientras la farmacia no lo confirmó. */
  async cancelar(slug: string, cookie: unknown, orderId: string) {
    const { catalogo, sesion } = await this.exigirSesion(slug, cookie);
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "CatalogOrder" WHERE id = ${orderId}::uuid FOR UPDATE`;
      const pedido = await tx.catalogOrder.findFirst({
        where: {
          id: orderId,
          organizationId: catalogo.organizationId,
          portalUserId: sesion.portalUserId,
        },
      });
      if (!pedido) throw new NotFoundException("No encontramos ese pedido.");
      if (pedido.status === "CANCELLED")
        return serializarPedido(
          await tx.catalogOrder.findUniqueOrThrow({
            where: { id: pedido.id },
            include: pedidoConRenglones,
          }),
        );
      if (!siguienteEstado(pedido.status, "cancelar"))
        throw new ConflictException(
          "La farmacia ya revisó este pedido. Comunicate con ella para cambiarlo.",
        );
      const actualizado = await tx.catalogOrder.update({
        where: { id: pedido.id },
        data: { status: "CANCELLED" },
        include: pedidoConRenglones,
      });
      await tx.auditLog.create({
        data: {
          organizationId: catalogo.organizationId,
          branchId: pedido.branchId,
          actorId: null,
          entityType: "CatalogOrder",
          entityId: pedido.id,
          action: "CATALOG_ORDER_CANCELLED",
          before: { status: pedido.status },
          after: { status: "CANCELLED", portalUserId: sesion.portalUserId },
        },
      });
      return serializarPedido(actualizado);
    });
  }

  private relleno() {
    this.hashDeRelleno ??= hash("relleno-para-correos-que-no-existen");
    return this.hashDeRelleno;
  }
}

/** Pedido para el cliente: importes como string de centavos. */
export function serializarPedido(pedido: PedidoConRenglones) {
  return {
    id: pedido.id,
    number: pedido.number,
    status: pedido.status,
    delivery: pedido.delivery,
    deliveryAddress: pedido.deliveryAddress,
    notes: pedido.notes,
    decisionNote: pedido.decisionNote,
    totalMinor: pedido.totalMinor.toString(),
    // Ahorro por ofertas del catálogo (SISTEMA-107).
    ahorroMinor: pedido.items
      .reduce((suma, item) => suma + item.discountMinor, 0n)
      .toString(),
    createdAt: pedido.createdAt.toISOString(),
    decidedAt: pedido.decidedAt?.toISOString() ?? null,
    deliveredAt: pedido.deliveredAt?.toISOString() ?? null,
    stockDeducted: pedido.stockDeductedAt !== null,
    items: pedido.items.map((item) => ({
      productId: item.productId,
      productName: item.productName,
      quantity: item.quantity,
      unitPriceMinor: item.unitPriceMinor.toString(),
      discountMinor: item.discountMinor.toString(),
      totalMinor: item.totalMinor.toString(),
    })),
  };
}
