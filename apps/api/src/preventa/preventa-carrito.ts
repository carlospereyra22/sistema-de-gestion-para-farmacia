import { BadRequestException } from "@nestjs/common";
import type { Prisma } from "@prisma/client";

import {
  etiquetaCatalogo,
  mensajeSugerencia,
  ofertasDeLaCompra,
} from "../catalogo-online/catalogo-ofertas";
import { cargarOfertasMotor, parametrosOferta } from "../offers/ofertas-carga";
import {
  calcularOfertas,
  etiquetaOferta,
  type OfertaMotor,
} from "../offers/ofertas-motor";
import {
  filtroProductos,
  idsDeListas,
  precioEnListas,
  stockPorProducto,
  type AjustesPreventa,
  type Listas,
} from "./preventa-comun";
import type { RenglonPreventa } from "./preventa-reglas";

export type RenglonArmado = {
  productId: string;
  productName: string;
  quantity: number;
  listUnitPriceMinor: bigint;
  unitPriceMinor: bigint;
  discountMinor: bigint;
  totalMinor: bigint;
  stock: number;
  labels: string[];
};

/**
 * Arma el pedido con los precios del servidor (SISTEMA-108): lista del
 * cliente con sus respaldos, el precio que bajó el preventista (si puede) y
 * las ofertas de mostrador con el mismo motor que Ventas. Un precio puesto a
 * mano reemplaza la oferta de ese producto, como en Ventas.
 *
 * Estricto (crear o editar): un producto que no se puede vender frena todo.
 * Sin estricto (cotizar): se informa como no disponible.
 */
export async function armarCarrito(
  cliente: Prisma.TransactionClient,
  datos: {
    organizationId: string;
    ajustes: AjustesPreventa;
    listas: Listas;
    renglones: readonly RenglonPreventa[];
    puedeBajarPrecio: boolean;
    estricto: boolean;
    bloquear: boolean;
  },
) {
  const { organizationId, ajustes, listas, renglones } = datos;
  const productos = await cliente.product.findMany({
    where: {
      ...filtroProductos(organizationId, ajustes.branchId),
      id: { in: renglones.map(({ productId }) => productId) },
    },
    select: {
      id: true,
      name: true,
      categoryId: true,
      laboratoryId: true,
      isMedication: true,
      prices: {
        where: { priceListId: { in: idsDeListas(listas) } },
        select: { priceListId: true, amountMinor: true },
      },
    },
  });
  const porId = new Map(productos.map((p) => [p.id, p]));
  const stock = await stockPorProducto(
    cliente,
    organizationId,
    ajustes.branchId,
    renglones.map(({ productId }) => productId),
  );
  const noDisponibles: string[] = [];
  const validos: (Omit<
    RenglonArmado,
    "discountMinor" | "totalMinor" | "labels"
  > & {
    categoryId: string | null;
    laboratoryId: string | null;
    isMedication: boolean;
  })[] = [];
  for (const renglon of renglones) {
    const producto = porId.get(renglon.productId);
    const lista = producto ? precioEnListas(producto.prices, listas) : null;
    const disponible = stock.get(renglon.productId) ?? 0;
    const faltaStock =
      !ajustes.allowOutOfStock && disponible < renglon.quantity;
    if (!producto || lista === null || faltaStock) {
      if (datos.estricto) {
        if (!producto)
          throw new BadRequestException(
            "Algún producto del pedido ya no se vende. Actualizá el pedido.",
          );
        if (lista === null)
          throw new BadRequestException(
            `${producto.name} no tiene precio. Quitalo del pedido para seguir.`,
          );
        throw new BadRequestException(
          `No hay stock suficiente de ${producto.name}: quedan ${disponible}.`,
        );
      }
      noDisponibles.push(renglon.productId);
      continue;
    }
    if (!Number.isSafeInteger(renglon.quantity) || renglon.quantity < 1)
      throw new BadRequestException("Revisá las cantidades del pedido.");
    let unitario = lista;
    if (renglon.unitPriceMinor !== undefined) {
      if (!/^\d{1,15}$/.test(renglon.unitPriceMinor))
        throw new BadRequestException(
          `El precio de ${producto.name} no es válido.`,
        );
      const pedido = BigInt(renglon.unitPriceMinor);
      if (pedido !== lista) {
        if (!datos.puedeBajarPrecio)
          throw new BadRequestException(
            "No tenés habilitado cambiar precios. Pedíselo a la farmacia.",
          );
        if (pedido > lista)
          throw new BadRequestException(
            `El precio de ${producto.name} no puede superar el de lista.`,
          );
        unitario = pedido;
      }
    }
    validos.push({
      productId: producto.id,
      productName: producto.name.slice(0, 200),
      quantity: renglon.quantity,
      listUnitPriceMinor: lista,
      unitPriceMinor: unitario,
      stock: disponible,
      categoryId: producto.categoryId,
      laboratoryId: producto.laboratoryId,
      isMedication: producto.isMedication,
    });
  }
  const ofertas: OfertaMotor[] = ajustes.applyOffers
    ? await cargarOfertasMotor(cliente, organizationId, {
        desde: new Date(),
        canal: "POS",
        bloquear: datos.bloquear,
      })
    : [];
  const contexto = {
    ahora: new Date(),
    branchId: ajustes.branchId,
    priceListId: listas.elegida,
  };
  const resultado = calcularOfertas(
    validos.map((v) => ({
      productId: v.productId,
      quantity: v.quantity,
      unitPriceMinor: v.unitPriceMinor,
      categoryId: v.categoryId,
      laboratoryId: v.laboratoryId,
      isMedication: v.isMedication,
      manualPrice: v.unitPriceMinor !== v.listUnitPriceMinor,
    })),
    ofertas,
    contexto,
  );
  const items: RenglonArmado[] = validos.map((v) => {
    const renglon = resultado.renglones.find(
      (r) => r.productId === v.productId,
    );
    const bruto = v.unitPriceMinor * BigInt(v.quantity);
    const oferta = renglon?.offerDiscountMinor ?? 0n;
    const discountMinor = oferta > bruto ? bruto : oferta;
    return {
      productId: v.productId,
      productName: v.productName,
      quantity: v.quantity,
      listUnitPriceMinor: v.listUnitPriceMinor,
      unitPriceMinor: v.unitPriceMinor,
      discountMinor,
      totalMinor: bruto - discountMinor,
      stock: v.stock,
      labels: resultado.aplicaciones
        .filter((a) => a.items.some((i) => i.productId === v.productId))
        .map((a) => {
          const o = ofertas.find((x) => x.id === a.offerId);
          return o ? etiquetaCatalogo(o) : a.label;
        }),
    };
  });
  return {
    items,
    noDisponibles,
    ofertas,
    aplicaciones: resultado.aplicaciones,
    sugerencias: resultado.sugerencias.map((s) => ({
      offerId: s.offerId,
      label: s.label,
      productIds: s.productIds,
      faltan: s.faltan,
      mensaje: mensajeSugerencia(
        ofertas.find((o) => o.id === s.offerId),
        s,
        items
          .filter((i) => s.productIds.includes(i.productId))
          .reduce((suma, i) => suma + i.quantity, 0),
      ),
    })),
    deLaCompra: ofertasDeLaCompra(ofertas, contexto),
    ahorroMinor: items.reduce((s, i) => s + i.discountMinor, 0n),
    totalMinor: items.reduce((s, i) => s + i.totalMinor, 0n),
  };
}

export type CarritoArmado = Awaited<ReturnType<typeof armarCarrito>>;

/** El carrito como lo ve la web (importes en texto). */
export function serializarCarrito(carrito: CarritoArmado, verStock: boolean) {
  return {
    items: carrito.items.map((item) => ({
      productId: item.productId,
      productName: item.productName,
      quantity: item.quantity,
      listUnitPriceMinor: item.listUnitPriceMinor.toString(),
      unitPriceMinor: item.unitPriceMinor.toString(),
      discountMinor: item.discountMinor.toString(),
      totalMinor: item.totalMinor.toString(),
      stock: verStock ? item.stock : null,
      inStock: item.stock >= item.quantity,
      labels: item.labels,
    })),
    noDisponibles: carrito.noDisponibles,
    sugerencias: carrito.sugerencias,
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

/** Foto de las ofertas aplicadas al pedido, en su misma transacción. */
export async function guardarOfertasDelPedido(
  tx: Prisma.TransactionClient,
  organizationId: string,
  orderId: string,
  carrito: CarritoArmado,
) {
  for (const aplicacion of carrito.aplicaciones) {
    const oferta = carrito.ofertas.find((o) => o.id === aplicacion.offerId);
    const items = aplicacion.items.filter((item) => item.units > 0);
    if (!oferta || !items.length) continue;
    await tx.preventaOrderOffer.create({
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
