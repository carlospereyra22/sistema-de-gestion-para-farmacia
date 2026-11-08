import type { Prisma } from "@prisma/client";

// Facturas que se emiten después de la venta (SISTEMA-65, decisiones del
// usuario del 08/11/2026). La factura siempre lleva la fecha del día en que se
// emite (ARCA no acepta una fecha anterior a la última del punto de venta); la
// venta conserva su fecha y el comprobante queda marcado como diferido.

/**
 * - CAJA_CERRADA: se pidió factura con la caja cerrada; espera (HELD) a que el
 *   cobro se incorpore a una caja.
 * - COMPROBANTE_INTERNO: la venta se hizo con comprobante interno y después se
 *   mandó a ARCA a mano.
 */
export type MotivoDiferida = "CAJA_CERRADA" | "COMPROBANTE_INTERNO";

/** Cómo se encola una factura que no sale en el momento de la venta. */
export type FacturaDiferida = {
  motivo: MotivoDiferida;
  /** El cobro todavía no entró a una caja: no se envía hasta incorporarlo. */
  enEspera: boolean;
  /** Quién hizo la venta, para el cajero del comprobante. */
  cajeroId?: string;
};

/** Días que tiene una venta con comprobante interno para mandarse a ARCA. */
export const DIAS_PARA_FACTURAR = 30;
const DIA_MS = 24 * 60 * 60 * 1000;

/** Motivo por el que ya no se puede mandar la venta a ARCA, o null. */
export function fueraDePlazo(completedAt: Date, ahora: Date): string | null {
  return ahora.getTime() - completedAt.getTime() > DIAS_PARA_FACTURAR * DIA_MS
    ? `Pasaron más de ${DIAS_PARA_FACTURAR} días desde la venta: ya no se puede enviar a ARCA.`
    : null;
}

export const NO_VALIDO_COMO_FACTURA =
  "COMPROBANTE INTERNO · NO VÁLIDO COMO FACTURA";

const fechaYHora = (fecha: Date) =>
  new Intl.DateTimeFormat("es-AR", {
    timeZone: "America/Argentina/Buenos_Aires",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  })
    .format(fecha)
    .replace(",", "");

/**
 * Leyenda impresa al pie: el comprobante interno aclara que no es factura; la
 * factura en espera, que todavía no salió; la diferida, cuándo fue la venta.
 */
export function leyendaComprobante(datos: {
  factura: boolean;
  estado?: string | null;
  motivo?: string | null;
  venta: Date;
}): string | undefined {
  if (!datos.factura) return NO_VALIDO_COMO_FACTURA;
  if (datos.estado === "HELD")
    return `${NO_VALIDO_COMO_FACTURA} · La factura se emite cuando el cobro entre a una caja.`;
  if (datos.motivo)
    return `Facturada después · venta del ${fechaYHora(datos.venta)}`;
  return undefined;
}

/** Estado con el que se crea la factura. */
export const estadoInicial = (diferida?: FacturaDiferida) =>
  diferida?.enEspera ? "HELD" : "QUEUED";

/**
 * Libera la factura en espera de una venta cuando su cobro se incorpora a una
 * caja: pasa a la cola fiscal, que la emite con la fecha de ese día. Corre
 * dentro de la transacción de Caja que incorpora el cobro. Devuelve si había
 * una factura esperando.
 */
export async function liberarFacturaEnEspera(
  tx: Prisma.TransactionClient,
  datos: {
    organizationId: string;
    branchId: string;
    saleId: string;
    actorId: string;
    ahora: Date;
  },
): Promise<boolean> {
  const { organizationId, branchId, saleId, actorId, ahora } = datos;
  const liberar = { status: "QUEUED", releasedAt: ahora, detail: null };
  const produccion = await tx.fiscalDocument.updateMany({
    where: {
      organizationId,
      branchId,
      sourceSaleId: saleId,
      kind: "INVOICE",
      status: "HELD",
    },
    data: liberar,
  });
  const prueba = produccion.count
    ? { count: 0 }
    : await tx.fiscalTrial.updateMany({
        where: { organizationId, sourceSaleId: saleId, status: "HELD" },
        data: liberar,
      });
  if (!produccion.count && !prueba.count) return false;
  const documento = produccion.count
    ? await tx.fiscalDocument.findFirstOrThrow({
        where: { organizationId, sourceSaleId: saleId, kind: "INVOICE" },
        select: { id: true },
      })
    : await tx.fiscalTrial.findFirstOrThrow({
        where: { organizationId, sourceSaleId: saleId },
        select: { id: true },
      });
  await tx.auditLog.create({
    data: {
      organizationId,
      branchId,
      actorId,
      entityType: produccion.count ? "FISCAL_DOCUMENT" : "FISCAL_TRIAL",
      entityId: documento.id,
      action: "LIBERADA",
      before: { status: "HELD" },
      after: { status: "QUEUED", saleId, releasedAt: ahora.toISOString() },
    },
  });
  return true;
}
