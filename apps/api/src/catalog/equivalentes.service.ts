import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { CatalogService } from "./catalog.service";
import {
  dosisDe,
  dosisDeItem,
  dosisPorNombre,
  formaDePresentacion,
  separarAlternativas,
  type ItemBase,
  type ProductoPropio,
} from "./equivalentes";
import { claveGuia } from "./guias-principio-activo";
import { gtinOf } from "./medicine-reference-snapshot";
import { stockAvailability } from "../inventory/stock-availability";

const MAX_ITEMS = 400;

// Grupos del padrón que no son una droga sino una categoría (cosméticos,
// accesorios, alimentos): entre sí no hay equivalencia posible.
const SIN_EQUIVALENCIA = [
  /^producto cosmetico$/,
  /^accesorio$/,
  /^protector solar$/,
  /^pendiente$/,
  /^producto medico$/,
  /^tiras reactivas$/,
  /^medidor de glucosa$/,
  /^dispositivo/,
  /^soluc\.parent/,
  /^hierbas/,
  /^extractos/,
  /^vitaminas$/,
  /^minerales$/,
  /^detergentes/,
  /^espuma de poliuretano/,
  /^form?\./,
  /proteinas|carbohid|aminoacidos|fibras|maltodextrina|almidon|goma xantica/,
];

export function sinEquivalencia(guideKey: string): boolean {
  return SIN_EQUIVALENCIA.some((regla) => regla.test(guideKey));
}
const MAX_POR_GRUPO = 30;

// Equivalentes y otros productos con la misma droga (SISTEMA-108), desde la
// base de medicamentos compartida, marcando lo que la farmacia ya tiene con su
// precio general y el stock de la sucursal.
@Injectable()
export class EquivalentesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly catalog: CatalogService,
  ) {}

  async buscar(
    actorId: string,
    organizationId: string,
    branchId: string,
    datos: {
      codigos: string[];
      principioActivo?: string;
      forma?: string;
      concentracion?: string;
      // Sin códigos (AlfaBeta): nombre y presentación exactos en la base.
      nombre?: string;
      presentacion?: string;
    },
  ) {
    await this.catalog.assertPermission(
      actorId,
      organizationId,
      "CATALOG_READ",
    );
    const codigos = datos.codigos.map((code) => code.replace(/^0+/, ""));
    const gtins = datos.codigos
      .map((code) => gtinOf(code))
      .filter((gtin): gtin is string => !!gtin);
    const propios = codigos.length
      ? await this.prisma.medicineCatalogBarcode.findMany({
          where: {
            OR: [{ barcode: { in: datos.codigos } }, { gtin: { in: gtins } }],
          },
          select: {
            item: {
              select: {
                id: true,
                name: true,
                presentation: true,
                pharmaceuticalForm: true,
                doseText: true,
                guideKey: true,
              },
            },
          },
          take: 20,
        })
      : [];
    const porNombre = propios.some((fila) => fila.item.guideKey)
      ? undefined
      : await this.porNombre(datos.nombre, datos.presentacion);
    const base =
      propios.find((fila) => fila.item.guideKey)?.item ?? porNombre?.exacta;
    // El principio activo del padrón (por código o nombre) manda sobre el
    // texto cargado en el producto, que puede venir de otra fuente.
    const guideKey =
      base?.guideKey ||
      porNombre?.droga ||
      claveGuia(datos.principioActivo ?? "") ||
      "";
    const vacio = {
      principioActivo: "",
      composicionAbierta: false,
      equivalentes: [],
      mismaDroga: [],
    };
    if (!guideKey || sinEquivalencia(guideKey)) return vacio;

    const items = await this.prisma.medicineCatalogItem.findMany({
      where: { guideKey, officialDelisted: false },
      select: {
        id: true,
        name: true,
        presentation: true,
        laboratory: true,
        pharmaceuticalForm: true,
        doseText: true,
        priceMinor: true,
        barcodes: { select: { barcode: true } },
      },
      orderBy: { name: "asc" },
      take: MAX_ITEMS,
    });
    const filas: ItemBase[] = items.map((item) => ({
      ...item,
      codigos: item.barcodes.map((code) => code.barcode.replace(/^0+/, "")),
    }));

    const productoPorCodigo = await this.productosPropios(
      organizationId,
      branchId,
      filas.flatMap((item) => item.codigos),
    );
    const guia = await this.prisma.medicineActiveGuide.findUnique({
      where: { activeKey: guideKey },
      select: { activeIngredient: true },
    });
    // Del medicamento de la base si se lo encontró; si no, de los datos del
    // producto (forma por la abreviatura, dosis del nombre).
    const forma =
      base?.pharmaceuticalForm ||
      datos.forma ||
      formaDePresentacion(datos.presentacion ?? "");
    // "+asoc.", multivitamínicos y minerales: el padrón no detalla todos los
    // componentes; no se ofrecen equivalentes, solo productos relacionados.
    const composicionAbierta = /asoc\.|^vit\.\+|minerales|^vitaminas/.test(
      guideKey,
    );
    const { equivalentes, mismaDroga } = separarAlternativas(
      {
        forma,
        dosis:
          (base ? dosisDeItem(base) : null) ??
          dosisDe(
            datos.nombre ?? "",
            [datos.concentracion, datos.presentacion].filter(Boolean).join(" "),
          ) ??
          dosisPorNombre(base?.name ?? datos.nombre ?? "", filas, forma),
        nombre: base?.name ?? datos.nombre ?? "",
        // "+asoc.": el padrón no detalla los otros componentes; vitaminas y
        // minerales varían de una marca a otra.
        composicionAbierta,
        itemIds: new Set([
          ...propios.map((fila) => fila.item.id),
          ...(base ? [base.id] : []),
        ]),
        codigos: new Set(codigos),
      },
      filas,
      productoPorCodigo,
    );
    return {
      principioActivo: guia?.activeIngredient ?? guideKey,
      composicionAbierta,
      equivalentes: equivalentes.slice(0, MAX_POR_GRUPO),
      mismaDroga: mismaDroga.slice(0, MAX_POR_GRUPO),
    };
  }

  // Por nombre (AlfaBeta y productos sin código de fábrica): la presentación
  // exacta, comparada sin espacios ni puntos, sirve de base. Si no está, solo
  // se toma la droga cuando todas las presentaciones con ese nombre coinciden;
  // forma y dosis salen del texto de la presentación.
  private async porNombre(nombre?: string, presentacion?: string) {
    if (!nombre?.trim()) return undefined;
    const candidatos = await this.prisma.medicineCatalogItem.findMany({
      where: {
        name: { equals: nombre.trim(), mode: "insensitive" },
        guideKey: { not: "" },
      },
      select: {
        id: true,
        name: true,
        presentation: true,
        pharmaceuticalForm: true,
        doseText: true,
        guideKey: true,
      },
      take: 30,
    });
    const compacta = (texto: string) =>
      texto.toLocaleLowerCase("es-AR").replace(/[\s.]+/g, "");
    const buscada = compacta(presentacion ?? "");
    const exacta = buscada
      ? candidatos.find((item) => compacta(item.presentation) === buscada)
      : candidatos[0];
    const drogas = new Set(candidatos.map((item) => item.guideKey));
    return {
      exacta,
      droga: drogas.size === 1 ? [...drogas][0] : undefined,
    };
  }

  // Productos activos de la organización que comparten código con la base,
  // con su precio general y el stock de la sucursal.
  private async productosPropios(
    organizationId: string,
    branchId: string,
    codigos: string[],
  ): Promise<Map<string, ProductoPropio>> {
    if (!codigos.length) return new Map();
    const conCeros = codigos.flatMap((code) => [code, code.padStart(13, "0")]);
    const barras = await this.prisma.productBarcode.findMany({
      where: {
        code: { in: [...new Set(conCeros)] },
        product: { organizationId, active: true },
      },
      select: {
        code: true,
        product: {
          select: {
            id: true,
            name: true,
            prices: {
              where: {
                priceList: {
                  organizationId,
                  name: "Precio general",
                  active: true,
                },
              },
              select: { amountMinor: true },
              take: 1,
            },
          },
        },
      },
    });
    const ids = [...new Set(barras.map((fila) => fila.product.id))];
    // Stock vendible, como en Ventas: sin lotes vencidos.
    const lotes = ids.length
      ? await this.prisma.productLot.findMany({
          where: {
            organizationId,
            branchId,
            productId: { in: ids },
            quantity: { gt: 0 },
          },
          select: { productId: true, quantity: true, expiresAt: true },
        })
      : [];
    const ahora = new Date();
    const stockPorProducto = new Map<string, number>();
    for (const lote of lotes)
      stockPorProducto.set(
        lote.productId,
        (stockPorProducto.get(lote.productId) ?? 0) +
          stockAvailability(lote, ahora).sellableQuantity,
      );
    return new Map(
      barras.map((fila) => [
        fila.code.replace(/^0+/, ""),
        {
          id: fila.product.id,
          nombre: fila.product.name,
          precioMinor: fila.product.prices[0]?.amountMinor ?? null,
          stock: stockPorProducto.get(fila.product.id) ?? 0,
        },
      ]),
    );
  }
}
