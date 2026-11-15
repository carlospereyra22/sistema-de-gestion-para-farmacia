import type { Prisma } from "@prisma/client";

import {
  incluirOferta,
  ofertaMotor,
  parametrosOferta,
  unidadesUsadas,
} from "../offers/ofertas-carga";
import {
  etiquetaOferta,
  type AplicacionOferta,
  type OfertaMotor,
} from "../offers/ofertas-motor";
import type { OfflineIssue } from "./offline-sale";

/** Oferta que aplicó la PC en una venta sin conexión (SISTEMA-103). */
export type OfertaAplicadaEnPc = {
  offerId: string;
  version: number;
  items: {
    productId: string;
    units: number;
    grossMinor: string;
    discountMinor: string;
  }[];
};

export type OfertaParaGuardar = {
  aplicacion: AplicacionOferta;
  oferta: OfertaMotor;
};

export function conOferta(
  aplicaciones: readonly AplicacionOferta[],
  ofertas: readonly OfertaMotor[],
): OfertaParaGuardar[] {
  return aplicaciones.flatMap((aplicacion) => {
    const oferta = ofertas.find((item) => item.id === aplicacion.offerId);
    return oferta ? [{ aplicacion, oferta }] : [];
  });
}

/**
 * Venta sin conexión: si lo cobrado coincide con lo que calcula el servidor,
 * vale el cálculo del servidor. Si no, se respeta lo cobrado y la instantánea
 * se arma con lo que declaró la PC, siempre que sean ofertas de la farmacia y
 * sumen exactamente lo cobrado en cada producto. Un tope total superado queda
 * como aviso: la venta ya ocurrió.
 */
export async function aplicacionesSinConexion(
  tx: Prisma.TransactionClient,
  organizationId: string,
  declaradas: readonly OfertaAplicadaEnPc[] | undefined,
  calculadas: readonly AplicacionOferta[],
  ofertasVigentes: readonly OfertaMotor[],
  renglones: readonly {
    productId: string;
    cobradoMinor: bigint;
    calculadoMinor: bigint;
  }[],
  issues: OfflineIssue[],
): Promise<OfertaParaGuardar[]> {
  if (renglones.every((item) => item.cobradoMinor === item.calculadoMinor))
    return conOferta(calculadas, ofertasVigentes);
  if (!declaradas?.length) return [];
  const porProducto = new Map<string, bigint>();
  for (const declarada of declaradas)
    for (const item of declarada.items) {
      if (
        !/^\d{1,15}$/.test(item.discountMinor) ||
        !/^\d{1,15}$/.test(item.grossMinor)
      )
        return [];
      porProducto.set(
        item.productId,
        (porProducto.get(item.productId) ?? 0n) + BigInt(item.discountMinor),
      );
    }
  const coincide =
    renglones.every(
      (item) => (porProducto.get(item.productId) ?? 0n) === item.cobradoMinor,
    ) &&
    [...porProducto.keys()].every((productId) =>
      renglones.some((item) => item.productId === productId),
    );
  if (!coincide) return [];
  const filas = await tx.offer.findMany({
    where: {
      organizationId,
      id: { in: [...new Set(declaradas.map((item) => item.offerId))] },
    },
    include: incluirOferta,
  });
  const usadas = await unidadesUsadas(
    tx,
    organizationId,
    filas.filter((fila) => fila.maxUnitsTotal !== null).map((fila) => fila.id),
  );
  const resultado: OfertaParaGuardar[] = [];
  for (const declarada of declaradas) {
    const fila = filas.find((item) => item.id === declarada.offerId);
    if (!fila) return [];
    const oferta = ofertaMotor(fila, (id) => [id], usadas.get(fila.id) ?? 0);
    const units = declarada.items.reduce((suma, item) => suma + item.units, 0);
    const discountMinor = declarada.items.reduce(
      (suma, item) => suma + BigInt(item.discountMinor),
      0n,
    );
    if (units <= 0) continue;
    if (
      fila.maxUnitsTotal !== null &&
      (usadas.get(fila.id) ?? 0) + units > fila.maxUnitsTotal
    )
      issues.push({
        kind: "TOPE_OFERTA_SUPERADO",
        detail: {
          offerId: fila.id,
          nombre: fila.name,
          tope: fila.maxUnitsTotal,
          usadas: usadas.get(fila.id) ?? 0,
          unidades: units,
        },
      });
    resultado.push({
      oferta,
      aplicacion: {
        offerId: fila.id,
        version: Math.max(1, Math.trunc(declarada.version)),
        name: fila.name,
        label: etiquetaOferta(oferta),
        type: fila.type,
        units,
        discountMinor,
        items: declarada.items.map((item) => ({
          productId: item.productId,
          units: item.units,
          grossMinor: BigInt(item.grossMinor),
          discountMinor: BigInt(item.discountMinor),
        })),
      },
    });
  }
  return resultado;
}

/** Instantánea de las ofertas aplicadas, en la misma transacción de la venta. */
export async function guardarOfertasVenta(
  tx: Prisma.TransactionClient,
  organizationId: string,
  saleId: string,
  ofertas: readonly OfertaParaGuardar[],
  createdAt?: Date,
) {
  for (const { aplicacion, oferta } of ofertas) {
    const items = aplicacion.items.filter((item) => item.units > 0);
    if (!items.length) continue;
    await tx.saleOffer.create({
      data: {
        organizationId,
        saleId,
        offerId: aplicacion.offerId,
        offerVersion: aplicacion.version,
        name: aplicacion.name.slice(0, 120),
        label: aplicacion.label.slice(0, 60),
        type: aplicacion.type,
        parameters: parametrosOferta(oferta),
        units: items.reduce((suma, item) => suma + item.units, 0),
        discountMinor: aplicacion.discountMinor,
        ...(createdAt ? { createdAt } : {}),
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
