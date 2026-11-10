import {
  BadRequestException,
  ConflictException,
  HttpException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { CATEGORY_COLORS, CATEGORY_ICONS } from "@gestion/contracts";
import { decodeProductImage } from "./product-image";
import {
  contextoSinConexion,
  guardarOperacionSinConexion,
  operacionYaRegistrada,
  type ContextoSinConexion,
} from "../common/offline/registro-sin-conexion";
import { verificarOperacionDeOtro } from "../sales/operacion-firmada";
import { camposPisados } from "../parties/proveedor-sin-conexion";
import { CatalogService } from "./catalog.service";
import { changeBranchProduct } from "./branch-product-lifecycle";
import { validateCategoryPlacement } from "./category-tree";
import {
  addEquivalentBarcode,
  gtinSpellings,
  removeEquivalentBarcode,
} from "./equivalent-barcode";
import {
  KIND_CATALOGO,
  camposDeLaEdicion,
  preciosPisados,
  sinCamposPisados,
  type OperacionCatalogoSinConexion,
} from "./producto-sin-conexion";

type Marca = { origen: string; deviceId: string; occurredAt: string };

/** Producto (u otro) que ya tiene ese código de barras, en cualquier escritura. */
async function codigoDeOtro(
  tx: Prisma.TransactionClient,
  organizationId: string,
  code: string,
  productId?: string,
) {
  let spellings = [code.trim()];
  try {
    spellings = gtinSpellings(code);
  } catch {
    // Código propio que no es un GTIN: se compara tal cual.
  }
  return tx.productBarcode.findFirst({
    where: {
      organizationId,
      code: { in: spellings },
      ...(productId ? { productId: { not: productId } } : {}),
    },
    select: { productId: true, product: { select: { name: true } } },
  });
}

/**
 * Productos sin conexión (SISTEMA-79): registra en el servidor lo que se hizo
 * en la PC sin internet, una sola vez, con su hora real y sus avisos. Las
 * reglas están en `producto-sin-conexion.ts`.
 */
@Injectable()
export class CatalogOfflineService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly catalog: CatalogService,
  ) {}

  async catalogOffline(
    actorId: string,
    organizationId: string,
    branchId: string,
    op: OperacionCatalogoSinConexion,
    reenviadaPor?: string,
  ) {
    await this.catalog.assertPermission(
      actorId,
      organizationId,
      "CATALOG_MANAGE",
    );
    const contexto = await contextoSinConexion(this.prisma, organizationId, {
      operationId: op.clientOperationId,
      kind: KIND_CATALOGO[op.tipo],
      occurredAt: op.occurredAt,
      deviceId: op.deviceId,
      negocio: {
        tipo: op.tipo,
        productId: "productId" in op ? op.productId : undefined,
        cuerpo: op.cuerpo,
      },
      reenviadaPor,
    });
    const marca: Marca = {
      origen: "SIN_CONEXION",
      deviceId: op.deviceId,
      occurredAt: contexto.occurredAt.toISOString(),
    };
    try {
      return await this.prisma.$transaction(
        async (tx) => {
          const registrada = await operacionYaRegistrada(
            tx,
            organizationId,
            contexto,
          );
          if (registrada) return registrada;
          const entityId = await this.aplicar(
            tx,
            actorId,
            organizationId,
            branchId,
            op,
            contexto,
            marca,
          );
          return guardarOperacionSinConexion(tx, contexto, {
            organizationId,
            branchId,
            actorId,
            entityId,
          });
        },
        { timeout: 30000 },
      );
    } catch (error) {
      // 404/409 significan "queda para su dueño" en la bandeja de la PC y
      // frenarían el resto: un rechazo de la operación es definitivo (422).
      if (
        error instanceof NotFoundException ||
        error instanceof ConflictException
      )
        throw new UnprocessableEntityException(
          `${error.message} No se registró: revisalo y volvé a cargarlo.`,
        );
      throw error;
    }
  }

  /** La de otro usuario de esta PC: queda a nombre de quien la hizo. */
  async catalogOfflineSigned(
    senderId: string,
    organizationId: string,
    branchId: string,
    firma: {
      actorId: string;
      deviceId: string;
      payload: string;
      signature: string;
    },
    op: OperacionCatalogoSinConexion,
  ) {
    if (firma.actorId === senderId)
      return this.catalogOffline(senderId, organizationId, branchId, op);
    await verificarOperacionDeOtro(this.prisma, {
      ...firma,
      senderId,
      organizationId,
      branchId,
    });
    try {
      await this.catalog.assertPermission(
        firma.actorId,
        organizationId,
        "CATALOG_MANAGE",
      );
    } catch {
      throw new BadRequestException(
        "Quien cargó el producto ya no puede administrar el catálogo. Revisalo a mano.",
      );
    }
    return this.catalogOffline(
      firma.actorId,
      organizationId,
      branchId,
      op,
      senderId,
    );
  }

  private async aplicar(
    tx: Prisma.TransactionClient,
    actorId: string,
    organizationId: string,
    branchId: string,
    op: OperacionCatalogoSinConexion,
    contexto: ContextoSinConexion,
    marca: Marca,
  ): Promise<string | null> {
    switch (op.tipo) {
      case "ALTA": {
        const id = op.clientOperationId;
        if (await tx.product.findUnique({ where: { id } }))
          throw new ConflictException(
            "Ese producto ya existe con otros datos.",
          );
        const cuerpo = { ...op.cuerpo };
        cuerpo.categoryId = await this.opcionDisponible(
          tx,
          organizationId,
          "categories",
          cuerpo.categoryId,
        );
        cuerpo.laboratoryId = await this.opcionDisponible(
          tx,
          organizationId,
          "laboratories",
          cuerpo.laboratoryId,
        );
        // Código que otra PC usó mientras tanto: el producto se crea igual,
        // sin ese código, para no perder lo que se le cargó (decisión del
        // usuario).
        if (cuerpo.barcode?.trim()) {
          const otro = await codigoDeOtro(tx, organizationId, cuerpo.barcode);
          if (otro) {
            this.avisoCodigo(contexto, cuerpo.name, cuerpo.barcode, otro);
            delete cuerpo.barcode;
          }
        }
        const equivalentes: string[] = [];
        for (const code of cuerpo.equivalentBarcodes ?? []) {
          const otro = await codigoDeOtro(tx, organizationId, code);
          if (otro) this.avisoCodigo(contexto, cuerpo.name, code, otro);
          else equivalentes.push(code);
        }
        cuerpo.equivalentBarcodes = equivalentes;
        const preparado = await this.catalog.prepararAlta(
          tx,
          organizationId,
          cuerpo,
        );
        await this.catalog.crearEnTx(
          tx,
          actorId,
          organizationId,
          cuerpo,
          preparado,
          id,
        );
        await tx.auditLog.create({
          data: {
            actorId,
            organizationId,
            branchId,
            entityType: "PRODUCT",
            entityId: id,
            action: "PRODUCT_CREATED",
            after: { name: cuerpo.name.trim(), ...marca },
          },
        });
        return id;
      }
      case "EDICION": {
        const producto = await tx.product.findFirst({
          where: { id: op.productId, organizationId },
          select: { id: true, name: true },
        });
        if (!producto) throw new NotFoundException("El producto ya no existe.");
        // Campo por campo: si otra PC cambió el mismo dato después (según su
        // hora real), queda ese cambio y un aviso (decisión del usuario).
        const registros = await tx.auditLog.findMany({
          where: {
            organizationId,
            entityType: "PRODUCT",
            entityId: op.productId,
            action: "PRODUCT_UPDATED",
          },
          select: { createdAt: true, before: true, after: true },
        });
        const pisados = camposPisados(
          registros,
          contexto.occurredAt,
          camposDeLaEdicion(op.cuerpo),
        );
        if (pisados.length)
          contexto.avisos.push({
            kind: "DATO_PISADO",
            detail: {
              nombre: producto.name,
              campos: pisados,
              motivo:
                "Otra PC cambió esos datos después: quedaron esos cambios.",
            },
          });
        const cuerpo = sinCamposPisados(op.cuerpo, pisados);
        if (cuerpo.categoryId)
          cuerpo.categoryId = await this.opcionDisponible(
            tx,
            organizationId,
            "categories",
            cuerpo.categoryId,
          );
        if (cuerpo.laboratoryId)
          cuerpo.laboratoryId = await this.opcionDisponible(
            tx,
            organizationId,
            "laboratories",
            cuerpo.laboratoryId,
          );
        if (cuerpo.barcode?.trim()) {
          const otro = await codigoDeOtro(
            tx,
            organizationId,
            cuerpo.barcode,
            op.productId,
          );
          if (otro) {
            this.avisoCodigo(contexto, producto.name, cuerpo.barcode, otro);
            delete cuerpo.barcode;
          }
        }
        if (
          camposDeLaEdicion(cuerpo).length ||
          cuerpo.generateInternalBarcode
        ) {
          const imagen = await this.catalog.prepararEdicion(
            tx,
            organizationId,
            op.productId,
            cuerpo,
          );
          await this.catalog.editarEnTx(
            tx,
            actorId,
            organizationId,
            op.productId,
            cuerpo,
            imagen,
            marca,
          );
        }
        return op.productId;
      }
      case "ESTADO_SUCURSAL":
        // Si el estado o el stock ya no son los que se vieron, se rechaza y
        // nada cambia: es una baja de mercadería (decisión del usuario).
        await changeBranchProduct(
          tx,
          actorId,
          organizationId,
          branchId,
          op.productId,
          op.cuerpo,
        );
        return op.productId;
      case "CODIGO_AGREGAR": {
        const otro = await codigoDeOtro(tx, organizationId, op.cuerpo.code);
        if (otro?.productId === op.productId) return op.productId;
        if (otro) {
          const producto = await tx.product.findFirst({
            where: { id: op.productId, organizationId },
            select: { name: true },
          });
          this.avisoCodigo(
            contexto,
            producto?.name ?? "Producto",
            op.cuerpo.code,
            otro,
          );
          return op.productId;
        }
        await addEquivalentBarcode(
          tx,
          actorId,
          organizationId,
          op.productId,
          op.cuerpo.code,
        );
        return op.productId;
      }
      case "CODIGO_QUITAR": {
        const tiene = await tx.productBarcode.findFirst({
          where: {
            organizationId,
            productId: op.productId,
            code: op.cuerpo.code.trim(),
            kind: "EQUIVALENT",
          },
          select: { id: true },
        });
        // Ya lo quitó otra PC: no hay nada que hacer.
        if (tiene)
          await removeEquivalentBarcode(
            tx,
            actorId,
            organizationId,
            op.productId,
            op.cuerpo.code,
          );
        return op.productId;
      }
      case "ELIMINAR": {
        // Ya eliminado: no hay nada que hacer. Si se usó mientras tanto, se
        // rechaza (no se puede eliminar un producto con historial).
        if (
          await tx.product.findFirst({
            where: { id: op.productId, organizationId },
            select: { id: true },
          })
        )
          await this.catalog.eliminarEnTx(
            tx,
            actorId,
            organizationId,
            op.productId,
          );
        return op.productId;
      }
      case "OPCION":
        return this.crearOpcion(tx, actorId, organizationId, op, contexto);
      case "OPCION_EDICION":
        return this.editarOpcion(tx, actorId, organizationId, op, contexto);
      case "OPCION_BAJA":
        return this.bajaDeOpcion(tx, actorId, organizationId, op);
      case "OPCION_ICONO":
        return this.iconoDeCategoria(tx, actorId, organizationId, op, contexto);
      case "LOGO":
        return this.logoDeLaboratorio(
          tx,
          actorId,
          organizationId,
          op,
          contexto,
        );
      case "LISTA_ALTA":
        return this.crearLista(tx, actorId, organizationId, op, contexto);
      case "LISTA_EDICION":
        return this.editarLista(tx, actorId, organizationId, op, contexto);
      case "LISTA_PRECIOS":
        return this.preciosDeLista(tx, actorId, organizationId, op, contexto);
    }
  }

  // --- Categorías, laboratorios y listas de precios (SISTEMA-80) ---

  /**
   * Id en el servidor de algo creado sin conexión: el de la PC, o el que ya
   * existía con ese nombre (lo dice la operación registrada).
   */
  private async idReal(
    tx: Prisma.TransactionClient,
    organizationId: string,
    id: string,
    kind: string,
  ) {
    const creada = await tx.offlineOperation.findFirst({
      where: { id, organizationId, kind },
      select: { entityId: true },
    });
    return creada?.entityId ?? id;
  }

  /** ¿Otra PC cambió esto después (según la hora real)? Para avisar y no pisarlo. */
  private async cambiadoDespues(
    tx: Prisma.TransactionClient,
    organizationId: string,
    entityType: string,
    entityId: string,
    acciones: string[],
    campos: string[],
    cuando: Date,
  ) {
    const registros = await tx.auditLog.findMany({
      where: { organizationId, entityType, entityId, action: { in: acciones } },
      select: { createdAt: true, before: true, after: true },
    });
    return camposPisados(registros, cuando, campos);
  }

  private async editarOpcion(
    tx: Prisma.TransactionClient,
    actorId: string,
    organizationId: string,
    op: Extract<OperacionCatalogoSinConexion, { tipo: "OPCION_EDICION" }>,
    contexto: ContextoSinConexion,
  ) {
    const { type } = op.cuerpo;
    const id = await this.idReal(
      tx,
      organizationId,
      op.cuerpo.id,
      KIND_CATALOGO.OPCION,
    );
    const name = op.cuerpo.name.trim();
    const tipo = type === "categories" ? "categoría" : "laboratorio";
    const campos = [
      "name",
      ...(type === "categories" && op.cuerpo.parentId !== undefined
        ? ["parentId"]
        : []),
    ];
    const pisados = await this.cambiadoDespues(
      tx,
      organizationId,
      type === "categories" ? "CATEGORY" : "LABORATORY",
      id,
      ["RENAMED", "MOVED"],
      campos,
      contexto.occurredAt,
    );
    if (type === "laboratories") {
      const lab = await tx.laboratory.findFirst({
        where: { id, organizationId, active: true },
      });
      if (!lab) throw new NotFoundException("El laboratorio ya no existe.");
      if (pisados.length) return this.avisoPisado(contexto, lab.name, tipo, id);
      if (
        await tx.laboratory.findFirst({
          where: {
            organizationId,
            id: { not: id },
            name: { equals: name, mode: "insensitive" },
          },
          select: { id: true },
        })
      )
        return this.avisoNombre(contexto, name, tipo, id);
      await tx.laboratory.update({ where: { id }, data: { name } });
      await tx.auditLog.create({
        data: {
          organizationId,
          actorId,
          entityType: "LABORATORY",
          entityId: id,
          action: "RENAMED",
          before: { name: lab.name, active: lab.active },
          after: { name, occurredAt: contexto.occurredAt.toISOString() },
        },
      });
      return id;
    }
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${organizationId}, 146))`;
    const nodes = await tx.category.findMany({
      where: { organizationId },
      select: { id: true, name: true, parentId: true, active: true },
    });
    const antes = nodes.find((node) => node.id === id && node.active);
    if (!antes) throw new NotFoundException("La categoría ya no existe.");
    if (pisados.length) return this.avisoPisado(contexto, antes.name, tipo, id);
    const parentId =
      op.cuerpo.parentId === undefined
        ? antes.parentId
        : op.cuerpo.parentId
          ? await this.idReal(
              tx,
              organizationId,
              op.cuerpo.parentId,
              KIND_CATALOGO.OPCION,
            )
          : null;
    try {
      validateCategoryPlacement(nodes, id, name, parentId);
    } catch (error) {
      if (error instanceof ConflictException)
        return this.avisoNombre(contexto, name, tipo, id);
      if (error instanceof HttpException)
        throw new UnprocessableEntityException(error.message);
      throw error;
    }
    await tx.category.update({ where: { id }, data: { name, parentId } });
    await tx.auditLog.create({
      data: {
        actorId,
        organizationId,
        entityType: "CATEGORY",
        entityId: id,
        action: parentId !== antes.parentId ? "MOVED" : "RENAMED",
        before: { name: antes.name, parentId: antes.parentId, active: true },
        after: {
          name,
          parentId,
          active: true,
          occurredAt: contexto.occurredAt.toISOString(),
        },
      },
    });
    return id;
  }

  /**
   * Eliminar una categoría o un laboratorio: si mientras tanto se le asignaron
   * productos (o subcategorías), se rechaza, como con conexión.
   */
  private async bajaDeOpcion(
    tx: Prisma.TransactionClient,
    actorId: string,
    organizationId: string,
    op: Extract<OperacionCatalogoSinConexion, { tipo: "OPCION_BAJA" }>,
  ) {
    const { type } = op.cuerpo;
    const id = await this.idReal(
      tx,
      organizationId,
      op.cuerpo.id,
      KIND_CATALOGO.OPCION,
    );
    const where = { id, organizationId };
    const item =
      type === "categories"
        ? await tx.category.findFirst({ where })
        : await tx.laboratory.findFirst({ where });
    // Ya eliminada en otra PC: no hay nada que hacer.
    if (!item?.active) return id;
    const productos = await tx.product.count({
      where:
        type === "categories"
          ? { organizationId, categoryId: id }
          : { organizationId, laboratoryId: id },
    });
    if (productos)
      throw new ConflictException(
        `“${item.name}” tiene ${productos} producto(s) asociado(s): no se eliminó.`,
      );
    if (
      type === "categories" &&
      (await tx.category.count({
        where: { organizationId, parentId: id, active: true },
      }))
    )
      throw new ConflictException(
        `“${item.name}” tiene subcategorías: no se eliminó.`,
      );
    if (type === "categories")
      await tx.category.update({ where: { id }, data: { active: false } });
    else await tx.laboratory.update({ where: { id }, data: { active: false } });
    await tx.auditLog.create({
      data: {
        actorId,
        organizationId,
        entityType: type === "categories" ? "CATEGORY" : "LABORATORY",
        entityId: id,
        action: "ARCHIVED",
        before: { name: item.name, active: true },
        after: { active: false, origen: "SIN_CONEXION" },
      },
    });
    return id;
  }

  private async iconoDeCategoria(
    tx: Prisma.TransactionClient,
    actorId: string,
    organizationId: string,
    op: Extract<OperacionCatalogoSinConexion, { tipo: "OPCION_ICONO" }>,
    contexto: ContextoSinConexion,
  ) {
    const { icon, color } = op.cuerpo;
    if (!(CATEGORY_ICONS as readonly string[]).includes(icon))
      throw new BadRequestException("Icono inválido.");
    if (
      color !== undefined &&
      !(CATEGORY_COLORS as readonly string[]).includes(color)
    )
      throw new BadRequestException("Color inválido.");
    const id = await this.idReal(
      tx,
      organizationId,
      op.cuerpo.id,
      KIND_CATALOGO.OPCION,
    );
    const item = await tx.category.findFirst({
      where: { id, organizationId, active: true },
    });
    if (!item) throw new NotFoundException("La categoría ya no existe.");
    const campos = ["icon", ...(color !== undefined ? ["color"] : [])];
    if (
      (
        await this.cambiadoDespues(
          tx,
          organizationId,
          "CATEGORY",
          id,
          ["ICON_CHANGED"],
          campos,
          contexto.occurredAt,
        )
      ).length
    )
      return this.avisoPisado(contexto, item.name, "categoría", id);
    await tx.category.update({
      where: { id },
      data: { icon, ...(color !== undefined ? { color } : {}) },
    });
    await tx.auditLog.create({
      data: {
        actorId,
        organizationId,
        entityType: "CATEGORY",
        entityId: id,
        action: "ICON_CHANGED",
        before: {
          icon: item.icon,
          ...(color !== undefined ? { color: item.color } : {}),
        },
        after: {
          icon,
          ...(color !== undefined ? { color } : {}),
          occurredAt: contexto.occurredAt.toISOString(),
        },
      },
    });
    return id;
  }

  private async logoDeLaboratorio(
    tx: Prisma.TransactionClient,
    actorId: string,
    organizationId: string,
    op: Extract<OperacionCatalogoSinConexion, { tipo: "LOGO" }>,
    contexto: ContextoSinConexion,
  ) {
    const id = await this.idReal(
      tx,
      organizationId,
      op.cuerpo.id,
      KIND_CATALOGO.OPCION,
    );
    const lab = await tx.laboratory.findFirst({
      where: { id, organizationId, active: true },
    });
    if (!lab) throw new NotFoundException("El laboratorio ya no existe.");
    // Un logo cambiado en otra PC después queda (el más reciente gana).
    if (lab.logoUpdatedAt && lab.logoUpdatedAt > contexto.occurredAt)
      return this.avisoPisado(contexto, lab.name, "laboratorio", id);
    const content =
      op.cuerpo.dataUrl === null
        ? null
        : new Uint8Array(decodeProductImage(op.cuerpo.dataUrl));
    await tx.laboratory.update({
      where: { id },
      data: {
        logo: content,
        logoUpdatedAt: content === null ? null : contexto.occurredAt,
      },
    });
    await tx.auditLog.create({
      data: {
        actorId,
        organizationId,
        entityType: "LABORATORY",
        entityId: id,
        action: content === null ? "LOGO_REMOVED" : "LOGO_SAVED",
        after: {
          origen: "SIN_CONEXION",
          occurredAt: contexto.occurredAt.toISOString(),
        },
      },
    });
    return id;
  }

  /** Lista creada sin conexión: si ya existe con ese nombre, se usa esa. */
  private async crearLista(
    tx: Prisma.TransactionClient,
    actorId: string,
    organizationId: string,
    op: Extract<OperacionCatalogoSinConexion, { tipo: "LISTA_ALTA" }>,
    contexto: ContextoSinConexion,
  ) {
    const name = op.cuerpo.name.trim();
    if (name.length < 2 || name.toLocaleLowerCase("es") === "precio general")
      throw new BadRequestException(
        "Ingresá un nombre de al menos dos caracteres distinto de Precio general.",
      );
    const previa = await tx.priceList.findFirst({
      where: { organizationId, name: { equals: name, mode: "insensitive" } },
    });
    if (previa) {
      if (!previa.active)
        await tx.priceList.update({
          where: { id: previa.id },
          data: { active: true },
        });
      contexto.avisos.push({
        kind: "OPCION_EXISTENTE",
        detail: {
          nombre: name,
          tipo: "lista de precios",
          motivo: "Ya existía una lista con ese nombre: se usó la existente.",
        },
      });
      return previa.id;
    }
    const id = op.clientOperationId;
    await tx.priceList.create({ data: { id, organizationId, name } });
    if (op.cuerpo.includeAll) {
      // Como con conexión, con el precio general de cada producto activo (los
      // que no tienen precio general quedan afuera).
      const general = await tx.priceList.findFirst({
        where: { organizationId, name: "Precio general", active: true },
        select: { id: true },
      });
      const precios = general
        ? await tx.productPrice.findMany({
            where: {
              priceListId: general.id,
              product: { organizationId, active: true },
            },
            select: { productId: true, amountMinor: true },
          })
        : [];
      if (precios.length)
        await tx.productPrice.createMany({
          data: precios.map((p) => ({ ...p, priceListId: id })),
        });
    }
    await tx.auditLog.create({
      data: {
        actorId,
        organizationId,
        entityType: "PRICE_LIST",
        entityId: id,
        action: "PRICE_LIST_CREATED",
        after: {
          name,
          includeAll: Boolean(op.cuerpo.includeAll),
          occurredAt: contexto.occurredAt.toISOString(),
        },
      },
    });
    return id;
  }

  /** La lista de la operación (creada sin conexión o no), editable. */
  private async listaEditable(
    tx: Prisma.TransactionClient,
    organizationId: string,
    priceListId: string,
  ) {
    const id = await this.idReal(
      tx,
      organizationId,
      priceListId,
      KIND_CATALOGO.LISTA_ALTA,
    );
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${organizationId + ":price-list:" + id}, 0))`;
    const lista = await tx.priceList.findFirst({
      where: { id, organizationId, active: true },
    });
    if (!lista)
      throw new NotFoundException("La lista de precios ya no existe.");
    if (lista.name === "Precio general")
      throw new BadRequestException("Precio general es de solo lectura.");
    return lista;
  }

  private async editarLista(
    tx: Prisma.TransactionClient,
    actorId: string,
    organizationId: string,
    op: Extract<OperacionCatalogoSinConexion, { tipo: "LISTA_EDICION" }>,
    contexto: ContextoSinConexion,
  ) {
    const lista = await this.listaEditable(
      tx,
      organizationId,
      op.cuerpo.priceListId,
    );
    const name = op.cuerpo.name.trim();
    if (name.length < 2 || name.toLocaleLowerCase("es") === "precio general")
      throw new BadRequestException(
        "Ingresá un nombre de 2 a 120 caracteres distinto de Precio general.",
      );
    const pedidos = [
      ...(name !== lista.name ? ["name"] : []),
      ...(op.cuerpo.fallbackPriceListId !== undefined
        ? ["fallbackPriceListId"]
        : []),
    ];
    const pisados = await this.cambiadoDespues(
      tx,
      organizationId,
      "PRICE_LIST",
      lista.id,
      ["PRICE_LIST_RENAMED", "PRICE_LIST_UPDATED"],
      pedidos,
      contexto.occurredAt,
    );
    if (pisados.length)
      this.avisoPisado(contexto, lista.name, "lista de precios", lista.id);
    const data: { name?: string; fallbackPriceListId?: string | null } = {};
    if (pedidos.includes("name") && !pisados.includes("name")) {
      if (
        await tx.priceList.findFirst({
          where: {
            organizationId,
            id: { not: lista.id },
            name: { equals: name, mode: "insensitive" },
          },
          select: { id: true },
        })
      )
        this.avisoNombre(contexto, name, "lista de precios", lista.id);
      else data.name = name;
    }
    if (
      pedidos.includes("fallbackPriceListId") &&
      !pisados.includes("fallbackPriceListId")
    ) {
      const respaldo = op.cuerpo.fallbackPriceListId
        ? await this.idReal(
            tx,
            organizationId,
            op.cuerpo.fallbackPriceListId,
            KIND_CATALOGO.LISTA_ALTA,
          )
        : null;
      const disponible = respaldo
        ? await tx.priceList.findFirst({
            where: { id: respaldo, organizationId, active: true },
            select: { id: true, name: true },
          })
        : null;
      if (respaldo !== lista.id)
        data.fallbackPriceListId =
          disponible && disponible.name !== "Precio general"
            ? disponible.id
            : null;
    }
    if (!Object.keys(data).length) return lista.id;
    await tx.priceList.update({ where: { id: lista.id }, data });
    await tx.auditLog.create({
      data: {
        actorId,
        organizationId,
        entityType: "PRICE_LIST",
        entityId: lista.id,
        action:
          data.fallbackPriceListId === undefined
            ? "PRICE_LIST_RENAMED"
            : "PRICE_LIST_UPDATED",
        before: {
          ...(data.name !== undefined ? { name: lista.name } : {}),
          ...(data.fallbackPriceListId !== undefined
            ? { fallbackPriceListId: lista.fallbackPriceListId ?? null }
            : {}),
        },
        after: { ...data, occurredAt: contexto.occurredAt.toISOString() },
      },
    });
    return lista.id;
  }

  /**
   * Precios cambiados sin conexión. Producto por producto: si el precio ya no
   * es el que se vio y otra PC lo cambió después, queda ese (el más reciente)
   * y aviso; si no, se aplica (decisión del usuario).
   */
  private async preciosDeLista(
    tx: Prisma.TransactionClient,
    actorId: string,
    organizationId: string,
    op: Extract<OperacionCatalogoSinConexion, { tipo: "LISTA_PRECIOS" }>,
    contexto: ContextoSinConexion,
  ) {
    const lista = await this.listaEditable(
      tx,
      organizationId,
      op.cuerpo.priceListId,
    );
    const ids = op.cuerpo.changes.map((c) => c.productId);
    if (new Set(ids).size !== ids.length)
      throw new BadRequestException("Hay productos repetidos.");
    const [activos, actuales, registros] = await Promise.all([
      tx.product.findMany({
        where: { id: { in: ids }, organizationId, active: true },
        select: { id: true, name: true },
      }),
      tx.productPrice.findMany({
        where: { priceListId: lista.id, productId: { in: ids } },
      }),
      tx.auditLog.findMany({
        where: {
          organizationId,
          entityType: "PRICE_LIST",
          entityId: lista.id,
          action: "PRICE_LIST_UPDATED",
        },
        select: { createdAt: true, after: true },
      }),
    ]);
    const cambiados = new Set(
      preciosPisados(
        registros,
        contexto.occurredAt,
        op.cuerpo.changes
          .filter(
            (c) =>
              (actuales
                .find((p) => p.productId === c.productId)
                ?.amountMinor.toString() ?? null) !== c.expectedMinor,
          )
          .map((c) => c.productId),
      ),
    );
    const nombre = new Map(activos.map((p) => [p.id, p.name]));
    const aplicados = op.cuerpo.changes.filter(
      (c) => nombre.has(c.productId) && !cambiados.has(c.productId),
    );
    if (cambiados.size)
      contexto.avisos.push({
        kind: "DATO_PISADO",
        detail: {
          nombre: lista.name,
          lista: lista.name,
          productos: [...cambiados].map((id) => nombre.get(id) ?? id),
          motivo: "Otra PC cambió esos precios después: quedaron esos precios.",
        },
      });
    for (const c of aplicados)
      if (c.amountMinor === null)
        await tx.productPrice.deleteMany({
          where: { priceListId: lista.id, productId: c.productId },
        });
      else
        await tx.productPrice.upsert({
          where: {
            productId_priceListId: {
              productId: c.productId,
              priceListId: lista.id,
            },
          },
          create: {
            productId: c.productId,
            priceListId: lista.id,
            amountMinor: BigInt(c.amountMinor),
          },
          update: { amountMinor: BigInt(c.amountMinor) },
        });
    if (aplicados.length) {
      await tx.priceList.update({
        where: { id: lista.id },
        data: { updatedAt: new Date() },
      });
      await tx.auditLog.create({
        data: {
          actorId,
          organizationId,
          entityType: "PRICE_LIST",
          entityId: lista.id,
          action: "PRICE_LIST_UPDATED",
          after: {
            requestId: op.clientOperationId,
            actorId,
            changes: aplicados.map((c) => ({ ...c })),
            origen: "SIN_CONEXION",
            occurredAt: contexto.occurredAt.toISOString(),
          },
        },
      });
    }
    return lista.id;
  }

  private avisoPisado(
    contexto: ContextoSinConexion,
    nombre: string,
    tipo: string,
    id: string,
  ) {
    contexto.avisos.push({
      kind: "DATO_PISADO",
      detail: {
        nombre,
        tipo,
        motivo: `Otra PC cambió esta ${tipo === "laboratorio" ? "ficha" : tipo} después: quedó ese cambio.`,
      },
    });
    return id;
  }

  private avisoNombre(
    contexto: ContextoSinConexion,
    nombre: string,
    tipo: string,
    id: string,
  ) {
    contexto.avisos.push({
      kind: "NOMBRE_REPETIDO",
      detail: {
        nombre,
        tipo,
        motivo: "Ese nombre ya estaba usado: no se cambió.",
      },
    });
    return id;
  }

  private avisoCodigo(
    contexto: ContextoSinConexion,
    nombre: string,
    codigo: string,
    otro: { product: { name: string } },
  ) {
    contexto.avisos.push({
      kind: "CODIGO_REPETIDO",
      detail: {
        nombre,
        codigo: codigo.trim(),
        otro: otro.product.name,
        motivo: `El código ya era de “${otro.product.name}”: se registró sin ese código. Unificalos a mano.`,
      },
    });
  }

  /**
   * Categoría o laboratorio elegido en la PC: si se creó sin conexión puede
   * tener otro id en el servidor (si ya existía con ese nombre). Si ya no
   * está disponible, el producto queda sin ella.
   */
  private async opcionDisponible(
    tx: Prisma.TransactionClient,
    organizationId: string,
    tipo: "categories" | "laboratories",
    id: string | undefined,
  ): Promise<string | undefined> {
    if (!id) return undefined;
    const creada = await tx.offlineOperation.findFirst({
      where: { id, organizationId, kind: KIND_CATALOGO.OPCION },
      select: { entityId: true },
    });
    const real = creada?.entityId ?? id;
    const where = { id: real, organizationId, active: true };
    const existe =
      tipo === "categories"
        ? await tx.category.findFirst({ where, select: { id: true } })
        : await tx.laboratory.findFirst({ where, select: { id: true } });
    return existe ? real : undefined;
  }

  /**
   * Categoría o laboratorio creado sin conexión. Si ya existe con ese nombre
   * (otra PC lo creó), se usa ese y queda un aviso. Si no, se crea con el id
   * de la PC.
   */
  private async crearOpcion(
    tx: Prisma.TransactionClient,
    actorId: string,
    organizationId: string,
    op: Extract<OperacionCatalogoSinConexion, { tipo: "OPCION" }>,
    contexto: ContextoSinConexion,
  ) {
    const name = op.cuerpo.name.trim();
    if (name.length < 2 || name.length > 120)
      throw new BadRequestException(
        "El nombre debe tener entre 2 y 120 caracteres.",
      );
    const mismo = (a: string) =>
      a.trim().toLocaleLowerCase("es") === name.toLocaleLowerCase("es");
    const existente = (id: string) => {
      contexto.avisos.push({
        kind: "OPCION_EXISTENTE",
        detail: {
          nombre: name,
          tipo: op.cuerpo.type === "categories" ? "categoría" : "laboratorio",
          motivo: "Ya existía con ese nombre: se usó la existente.",
        },
      });
      return id;
    };
    if (op.cuerpo.type === "laboratories") {
      const previo = await tx.laboratory.findFirst({
        where: { organizationId, name: { equals: name, mode: "insensitive" } },
      });
      if (previo) {
        if (!previo.active)
          await tx.laboratory.update({
            where: { id: previo.id },
            data: { active: true },
          });
        return existente(previo.id);
      }
      await tx.laboratory.create({
        data: { id: op.clientOperationId, organizationId, name },
      });
      return op.clientOperationId;
    }
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${organizationId}, 146))`;
    const nodes = await tx.category.findMany({
      where: { organizationId },
      select: { id: true, name: true, parentId: true, active: true },
    });
    const parentId = op.cuerpo.parentId
      ? ((await this.opcionDisponible(
          tx,
          organizationId,
          "categories",
          op.cuerpo.parentId,
        )) ?? null)
      : null;
    const previa = nodes.find(
      (node) => node.active && node.parentId === parentId && mismo(node.name),
    );
    if (previa) return existente(previa.id);
    try {
      validateCategoryPlacement(nodes, undefined, name, parentId);
    } catch (error) {
      if (error instanceof HttpException)
        throw new UnprocessableEntityException(error.message);
      throw error;
    }
    await tx.category.create({
      data: {
        id: op.clientOperationId,
        organizationId,
        name,
        parentId,
        ...(op.cuerpo.icon &&
        (CATEGORY_ICONS as readonly string[]).includes(op.cuerpo.icon)
          ? { icon: op.cuerpo.icon }
          : {}),
        ...(op.cuerpo.color &&
        (CATEGORY_COLORS as readonly string[]).includes(op.cuerpo.color)
          ? { color: op.cuerpo.color }
          : {}),
      },
    });
    await tx.auditLog.create({
      data: {
        actorId,
        organizationId,
        entityType: "CATEGORY",
        entityId: op.clientOperationId,
        action: "CREATED",
        after: { name, parentId, origen: "SIN_CONEXION" },
      },
    });
    return op.clientOperationId;
  }
}
