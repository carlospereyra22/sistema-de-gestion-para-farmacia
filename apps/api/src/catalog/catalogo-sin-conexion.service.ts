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
    }
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
      data: { id: op.clientOperationId, organizationId, name, parentId },
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
