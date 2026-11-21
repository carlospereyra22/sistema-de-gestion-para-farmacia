import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma, type FiscalDocument, type FiscalTrial } from "@prisma/client";
import { AccountsService } from "../accounts/accounts.service";
import { AuditService } from "../audit/audit.service";
import { SALDO_A_FAVOR } from "../accounts/item-allocations";
import { lockCashSession } from "../cash/lock-cash-session";
import { reopenForHistoricStock } from "../catalog/branch-product-lifecycle";
import { obj, list, str } from "../fiscal/arca-soap";
import {
  FiscalSalesService,
  type NotaFiscal,
} from "../fiscal/fiscal-sales.service";
import { ProductionCreditService } from "../fiscal/production-credit.service";
import { ProductionSalesService } from "../fiscal/production-sales.service";
import { PrismaService } from "../prisma/prisma.service";
import {
  armarRenglonesNota,
  devueltoPorRenglon,
  repartirNota,
  whereNotasCredito,
  type FiltroNotasCredito,
  type PedidoNota,
} from "./nota-credito";
import { SalesService } from "./sales.service";

export type NotaCreditoInput = {
  requestId: string;
  reason: string;
  items: PedidoNota[];
  /**
   * Cómo se devuelve lo que no baja de la deuda de esta venta. SALDO_A_FAVOR:
   * queda en la cuenta corriente del cliente (baja lo que debe y, si sobra,
   * se descuenta de su próxima compra a cuenta).
   */
  refundMethod?: "CASH" | "CARD" | "TRANSFER" | "SALDO_A_FAVOR";
  cashSessionId?: string;
  /** Factura real: confirma que se emite un comprobante productivo. */
  confirmProduction?: boolean;
};

type Tipo = "INTERNA" | "FACTURA" | "FACTURA_PRUEBA";

/**
 * Nota de crédito por la venta entera o por productos (SISTEMA-110).
 *
 * Todo en un paso y en una transacción: registra la devolución, baja la deuda
 * de cuenta corriente de esos artículos, devuelve el resto en plata (el
 * efectivo sale de una caja abierta), repone stock en el lote de la venta si se
 * eligió y, si la venta se facturó, deja la nota C en cola. Después se envía a
 * ARCA como una factura. Ver docs/NOTAS_CREDITO.md.
 */
@Injectable()
export class NotasCreditoService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly sales: SalesService,
    private readonly accounts: AccountsService,
    private readonly fiscal: FiscalSalesService,
    private readonly production: ProductionSalesService,
    private readonly productionCredits: ProductionCreditService,
  ) {}

  /** Tipo de nota que corresponde y por qué no se puede hacer, si no se puede. */
  private async tipo(
    db: Prisma.TransactionClient | PrismaService,
    org: string,
    sale: { id: string; status: string; documentType: string },
  ): Promise<{ tipo: Tipo | null; motivo?: string }> {
    if (sale.status !== "COMPLETED")
      return { tipo: null, motivo: "La venta está anulada." };
    if (sale.documentType !== "INVOICE") return { tipo: "INTERNA" };
    const real = await db.fiscalDocument.findFirst({
      where: { organizationId: org, sourceSaleId: sale.id, kind: "INVOICE" },
    });
    const prueba = real
      ? null
      : await db.fiscalTrial.findFirst({
          where: {
            organizationId: org,
            sourceSaleId: sale.id,
            kind: "INVOICE",
          },
        });
    const factura = real ?? prueba;
    if (!factura)
      return { tipo: null, motivo: "La venta no tiene factura registrada." };
    if (factura.status !== "AUTHORIZED")
      return {
        tipo: null,
        motivo: ["QUEUED", "REJECTED", "HELD"].includes(factura.status)
          ? "La factura todavía no llegó a ARCA. Si querés deshacer la venta, anulala."
          : "La factura está esperando la respuesta de ARCA. Probá de nuevo en unos minutos.",
      };
    return { tipo: real ? "FACTURA" : "FACTURA_PRUEBA" };
  }

  private async devuelto(
    db: Prisma.TransactionClient | PrismaService,
    org: string,
    saleId: string,
  ) {
    const [devoluciones, anteriores] = await Promise.all([
      db.customerReturnItem.findMany({
        where: { customerReturn: { organizationId: org, saleId } },
        include: {
          customerReturn: { select: { creditKind: true, reason: true } },
        },
      }),
      // Notas productivas anteriores a SISTEMA-110: reservaban cantidades sin
      // una devolución propia.
      db.fiscalDocument.findMany({
        where: {
          organizationId: org,
          sourceSaleId: saleId,
          kind: "CREDIT_NOTE",
          customerReturnId: null,
          status: { not: "REJECTED" },
        },
        select: { saleSnapshot: true },
      }),
    ]);
    return devueltoPorRenglon(
      devoluciones.map((item) => ({
        saleItemId: item.saleItemId,
        quantity: item.quantity,
        creditKind: item.customerReturn.creditKind,
        reason: item.customerReturn.reason,
      })),
      anteriores.flatMap((doc) =>
        list(obj(doc.saleSnapshot).items).map((line) => ({
          saleItemId: str(obj(line).saleItemId),
          quantity: Number(obj(line).quantity),
        })),
      ),
    );
  }

  private async nombres(
    db: Prisma.TransactionClient | PrismaService,
    org: string,
    items: { productId: string | null; description: string | null }[],
  ) {
    const products = await db.product.findMany({
      where: {
        organizationId: org,
        id: { in: items.flatMap((i) => (i.productId ? [i.productId] : [])) },
      },
      select: { id: true, name: true },
    });
    return (item: { productId: string | null; description: string | null }) =>
      item.description ??
      products.find((p) => p.id === item.productId)?.name ??
      "Producto histórico";
  }

  /** Lo que se puede acreditar de la venta y las notas que ya tiene. */
  async detalle(actor: string, org: string, branch: string, saleId: string) {
    await this.sales.autorizar(actor, org, "SALE_READ");
    const sale = await this.prisma.sale.findFirst({
      where: { id: saleId, organizationId: org, branchId: branch },
      include: { items: { orderBy: { createdAt: "asc" } }, payments: true },
    });
    if (!sale) throw new NotFoundException("No encontramos esa venta.");
    const [{ tipo, motivo }, devuelto, nombre, notas] = await Promise.all([
      this.tipo(this.prisma, org, sale),
      this.devuelto(this.prisma, org, saleId),
      this.nombres(this.prisma, org, sale.items),
      this.prisma.customerReturn.findMany({
        where: { organizationId: org, saleId, creditKind: { not: null } },
        include: { items: { include: { saleItem: true } } },
        orderBy: { createdAt: "desc" },
      }),
    ]);
    const efectivo = sale.payments.some((p) => p.method === "CASH");
    return {
      tipo,
      motivo: motivo ?? null,
      /** Con cliente se puede dejar saldo a favor. */
      tieneCliente: Boolean(sale.customerId),
      cuentaCorriente: Boolean(
        sale.customerId && sale.payments.some((p) => p.method === "ACCOUNT"),
      ),
      metodoSugerido: efectivo
        ? "CASH"
        : (sale.payments.find((p) => ["CARD", "TRANSFER"].includes(p.method))
            ?.method ?? "CASH"),
      items: sale.items.map((item) => ({
        id: item.id,
        name: nombre(item),
        productId: item.productId,
        quantity: item.quantity,
        available: item.quantity - (devuelto.get(item.id) ?? 0),
        unitPriceMinor: item.unitPriceMinor.toString(),
        discountMinor: item.discountMinor.toString(),
        puedeReponer: Boolean(item.productId && item.lotId),
      })),
      notas: await this.presentarNotas(org, notas),
    };
  }

  /**
   * Notas de crédito de la sucursal, de la más nueva a la más vieja
   * (Ventas → Historial → Notas de crédito).
   */
  async listar(
    actor: string,
    org: string,
    branch: string,
    filtro: FiltroNotasCredito,
    page: number,
    pageSize: number,
  ) {
    await this.sales.autorizar(actor, org, "SALE_READ");
    const where = whereNotasCredito(org, branch, filtro);
    const [total, notas] = await this.prisma.$transaction([
      this.prisma.customerReturn.count({ where }),
      this.prisma.customerReturn.findMany({
        where,
        include: {
          items: { include: { saleItem: true } },
          sale: { select: { id: true, documentType: true, customerId: true } },
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);
    const [presentadas, clientes, actores] = await Promise.all([
      this.presentarNotas(org, notas),
      this.prisma.customer.findMany({
        where: {
          organizationId: org,
          id: {
            in: notas.flatMap((n) =>
              n.sale.customerId ? [n.sale.customerId] : [],
            ),
          },
        },
        select: { id: true, name: true },
      }),
      this.prisma.userOrganization.findMany({
        where: {
          organizationId: org,
          userId: { in: [...new Set(notas.map((n) => n.actorId))] },
        },
        select: { userId: true, displayName: true },
      }),
    ]);
    return {
      items: presentadas.map((nota, index) => {
        const original = notas[index]!;
        return {
          ...nota,
          sale: {
            id: original.sale.id,
            documentType: original.sale.documentType,
            customerName:
              clientes.find((c) => c.id === original.sale.customerId)?.name ??
              null,
          },
          actorName:
            actores.find((a) => a.userId === original.actorId)?.displayName ??
            null,
        };
      }),
      total,
      page,
      pageSize,
    };
  }

  private async presentarNotas(
    org: string,
    notas: Prisma.CustomerReturnGetPayload<{
      include: { items: { include: { saleItem: true } } };
    }>[],
  ) {
    const ids = notas.map((nota) => nota.id);
    const [reales, pruebas, nombre] = await Promise.all([
      this.prisma.fiscalDocument.findMany({
        where: { organizationId: org, customerReturnId: { in: ids } },
      }),
      this.prisma.fiscalTrial.findMany({
        where: { organizationId: org, customerReturnId: { in: ids } },
      }),
      this.nombres(
        this.prisma,
        org,
        notas.flatMap((nota) => nota.items.map((linea) => linea.saleItem)),
      ),
    ]);
    return notas.map((nota) => {
      const fiscal =
        reales.find((doc) => doc.customerReturnId === nota.id) ??
        pruebas.find((doc) => doc.customerReturnId === nota.id);
      return {
        id: nota.id,
        saleId: nota.saleId,
        creditKind: nota.creditKind,
        createdAt: nota.createdAt,
        reason: nota.reason,
        totalMinor: String(nota.totalMinor ?? 0n),
        accountMinor: String(nota.accountMinor ?? 0n),
        refundMinor: String(nota.refundMinor ?? 0n),
        refundMethod: nota.refundMethod,
        items: nota.items.map((linea) => ({
          saleItemId: linea.saleItemId,
          name: nombre(linea.saleItem),
          quantity: linea.quantity,
          amountMinor: String(linea.amountMinor ?? 0n),
          restocked: linea.restocked,
        })),
        fiscal: fiscal ? this.presentar(fiscal) : null,
      };
    });
  }

  private presentar(doc: FiscalDocument | FiscalTrial) {
    if ("issuerCuit" in doc) return this.production.present(doc);
    return { ...doc, environment: "HOMOLOGATION" as const };
  }

  async crear(
    actor: string,
    org: string,
    branch: string,
    saleId: string,
    input: NotaCreditoInput,
  ) {
    await this.sales.autorizar(actor, org, "SALE_MANAGE");
    const reason = input.reason.trim();
    if (reason.length < 3)
      throw new BadRequestException(
        "Indicá un motivo de al menos 3 caracteres.",
      );
    const resultado = await this.prisma.$transaction(
      async (tx) => {
        // Bloquea la venta: dos notas a la vez (doble clic, dos PCs) no pueden
        // pasar las dos el control de cantidades, ni cruzarse con una anulación.
        await tx.$queryRaw`SELECT id FROM "Sale" WHERE id = ${saleId}::uuid AND "organizationId" = ${org}::uuid AND "branchId" = ${branch}::uuid FOR UPDATE`;
        const repetida = await tx.customerReturn.findUnique({
          where: {
            organizationId_requestId: {
              organizationId: org,
              requestId: input.requestId,
            },
          },
        });
        if (repetida) {
          if (repetida.saleId !== saleId)
            throw new ConflictException("La operación pertenece a otra venta.");
          return { notaId: repetida.id, tipo: null, fiscalId: null };
        }
        const sale = await tx.sale.findFirst({
          where: { id: saleId, organizationId: org, branchId: branch },
          include: { items: true, payments: true },
        });
        if (!sale) throw new NotFoundException("No encontramos esa venta.");
        const { tipo, motivo } = await this.tipo(tx, org, sale);
        if (!tipo) throw new BadRequestException(motivo);
        if (tipo === "FACTURA" && !input.confirmProduction)
          throw new BadRequestException(
            "Confirmá que se emite una nota de crédito real en ARCA.",
          );
        const renglones = armarRenglonesNota(
          sale.items,
          await this.devuelto(tx, org, saleId),
          input.items,
        );

        // Primero baja lo que se debe en cuenta corriente de esos artículos.
        const pendiente = new Map<string, bigint>();
        if (
          sale.customerId &&
          sale.payments.some((p) => p.method === "ACCOUNT")
        ) {
          const saldos = await this.accounts.itemBalances(
            tx,
            actor,
            org,
            sale.customerId,
          );
          if (
            saldos.unassignedReceipts.length ||
            saldos.mixedSales.some((s) => s.saleId === saleId)
          )
            throw new BadRequestException(
              "Conciliá los cobros y la financiación por artículo en Cuentas corrientes antes de hacer la nota de crédito.",
            );
          for (const item of saldos.items)
            if (item.saleId === saleId)
              pendiente.set(item.saleItemId, BigInt(item.pendingMinor));
        }
        const reparto = repartirNota(renglones, pendiente);
        if (reparto.refundMinor > 0n && !input.refundMethod)
          throw new BadRequestException("Elegí cómo devolvés la plata.");
        if (input.refundMethod === "SALDO_A_FAVOR" && !sale.customerId)
          throw new BadRequestException(
            "El saldo a favor necesita un cliente registrado en la venta.",
          );
        // Saldo a favor: lo que no baja de esta venta también va a la cuenta.
        const saldoAFavor =
          input.refundMethod === "SALDO_A_FAVOR" ? reparto.refundMinor : 0n;
        const aCuenta = reparto.accountMinor + saldoAFavor;
        const enPlata = reparto.refundMinor - saldoAFavor;
        const metodo =
          enPlata > 0n && input.refundMethod !== "SALDO_A_FAVOR"
            ? input.refundMethod!
            : null;
        let cashSessionId: string | null = null;
        if (metodo === "CASH") {
          if (!input.cashSessionId)
            throw new BadRequestException(
              "Elegí la caja abierta de la que sale el efectivo.",
            );
          await lockCashSession(tx, input.cashSessionId);
          const session = await tx.cashSession.findFirst({
            where: { id: input.cashSessionId, closedAt: null },
          });
          const register = session
            ? await tx.cashRegister.findFirst({
                where: {
                  id: session.cashRegisterId,
                  branchId: branch,
                  active: true,
                },
              })
            : null;
          if (!session || !register)
            throw new BadRequestException(
              "La caja elegida no está abierta en esta sucursal.",
            );
          cashSessionId = session.id;
        }

        const nota = await tx.customerReturn.create({
          data: {
            organizationId: org,
            branchId: branch,
            saleId,
            actorId: actor,
            reason,
            requestId: input.requestId,
            creditKind: tipo === "INTERNA" ? "INTERNA" : "FACTURA",
            totalMinor: reparto.totalMinor,
            accountMinor: aCuenta,
            refundMinor: enPlata,
            refundMethod: metodo,
            cashSessionId,
            items: {
              create: renglones.map((renglon) => ({
                saleItemId: renglon.saleItemId,
                quantity: renglon.quantity,
                amountMinor: renglon.amountMinor,
                restocked: renglon.reponer,
              })),
            },
          },
        });
        const numero = nota.id.slice(0, 8).toUpperCase();

        if (cashSessionId && enPlata > 0n)
          await tx.cashMovement.create({
            data: {
              cashSessionId,
              type: "OUT",
              amountMinor: enPlata,
              actorId: actor,
              // El UUID permite reconocerlo como devolución (cash-movement-category).
              reason: `Nota de crédito ${nota.id}: ${reason}`,
            },
          });
        if (reparto.accountMinor > 0n && sale.customerId)
          await tx.customerAccountMovement.create({
            data: {
              organizationId: org,
              branchId: branch,
              customerId: sale.customerId,
              type: "CREDIT",
              amountMinor: reparto.accountMinor,
              actorId: actor,
              clientOperationId: nota.id,
              allocations: reparto.allocations,
              note: `Nota de crédito ${numero}: ${reason}. No es un cobro de dinero.`,
            },
          });
        if (saldoAFavor > 0n && sale.customerId) {
          await tx.customerAccountMovement.create({
            data: {
              organizationId: org,
              branchId: branch,
              customerId: sale.customerId,
              type: "CREDIT",
              amountMinor: saldoAFavor,
              actorId: actor,
              allocations: { kind: SALDO_A_FAVOR, notaId: nota.id, items: [] },
              note: `Nota de crédito ${numero}: saldo a favor. ${reason}`,
            },
          });
          // Baja primero lo que el cliente ya debe; el resto queda a favor.
          await this.accounts.aplicarSaldoAFavor(
            tx,
            actor,
            org,
            sale.customerId,
          );
        }
        for (const renglon of renglones) {
          if (!renglon.reponer || !renglon.productId || !renglon.lotId)
            continue;
          await reopenForHistoricStock(
            tx,
            actor,
            org,
            branch,
            renglon.productId,
            nota.id,
          );
          await tx.productLot.update({
            where: { id: renglon.lotId },
            data: { quantity: { increment: renglon.quantity } },
          });
          await tx.inventoryMovement.create({
            data: {
              organizationId: org,
              branchId: branch,
              productId: renglon.productId,
              lotId: renglon.lotId,
              type: "CUSTOMER_RETURN",
              quantity: renglon.quantity,
              actorId: actor,
              referenceType: "CUSTOMER_RETURN",
              referenceId: nota.id,
            },
          });
        }

        let fiscalId: string | null = null;
        if (tipo !== "INTERNA") {
          const nombre = await this.nombres(tx, org, sale.items);
          const fiscal: NotaFiscal = {
            requestId: input.requestId,
            customerReturnId: nota.id,
            reason,
            totalMinor: reparto.totalMinor,
            items: renglones.map((renglon) => {
              const vendido = sale.items.find(
                (i) => i.id === renglon.saleItemId,
              )!;
              return {
                saleItemId: renglon.saleItemId,
                productId: renglon.productId,
                name: nombre(vendido),
                quantity: renglon.quantity,
                unitPriceMinor: renglon.unitPriceMinor.toString(),
                discountMinor: renglon.discountMinor.toString(),
                amountMinor: renglon.amountMinor.toString(),
              };
            }),
          };
          fiscalId =
            tipo === "FACTURA"
              ? (
                  await this.productionCredits.enqueueCredit(
                    tx,
                    actor,
                    org,
                    branch,
                    saleId,
                    fiscal,
                    {
                      accountMinor: Number(aCuenta),
                      refundMinor: Number(enPlata),
                      method: metodo,
                      cashSessionId,
                      reference: reason,
                      received: true,
                      restocked: renglones.some((r) => r.reponer),
                    },
                  )
                ).id
              : (
                  await this.fiscal.enqueueCredit(
                    tx,
                    actor,
                    org,
                    branch,
                    saleId,
                    fiscal,
                  )
                ).id;
        }
        await this.audit.recordInTransaction(tx, {
          organizationId: org,
          branchId: branch,
          actorId: actor,
          entityType: "CUSTOMER_RETURN",
          entityId: nota.id,
          action: "NOTA_CREDITO",
          after: {
            saleId,
            tipo,
            reason,
            totalMinor: reparto.totalMinor.toString(),
            accountMinor: aCuenta.toString(),
            refundMinor: enPlata.toString(),
            saldoAFavorMinor: saldoAFavor.toString(),
            refundMethod: metodo,
            cashSessionId,
            fiscalId,
            items: renglones.map((r) => ({
              saleItemId: r.saleItemId,
              quantity: r.quantity,
              amountMinor: r.amountMinor.toString(),
              restocked: r.reponer,
            })),
          },
        });
        return { notaId: nota.id, tipo, fiscalId };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
    // Fuera de la transacción: el envío a ARCA. Si falla, queda en cola y la
    // cola fiscal lo reintenta; la devolución ya está registrada.
    if (resultado.fiscalId)
      await this.enviarSinFallar(
        actor,
        org,
        branch,
        saleId,
        resultado.tipo,
        resultado.fiscalId,
      );
    return {
      notaId: resultado.notaId,
      ...(await this.detalle(actor, org, branch, saleId)),
    };
  }

  private async enviarSinFallar(
    actor: string,
    org: string,
    branch: string,
    saleId: string,
    tipo: Tipo | null,
    fiscalId: string,
  ) {
    try {
      if (tipo === "FACTURA")
        await this.production.process(actor, org, branch, saleId, fiscalId);
      else
        await this.fiscal.processCredit(actor, org, branch, saleId, fiscalId);
    } catch {
      // Sigue en cola con su detalle; no se repite la devolución.
    }
  }

  private async comprobante(org: string, saleId: string, notaId: string) {
    const real = await this.prisma.fiscalDocument.findFirst({
      where: {
        organizationId: org,
        sourceSaleId: saleId,
        customerReturnId: notaId,
      },
    });
    if (real) return { tipo: "FACTURA" as const, id: real.id };
    const prueba = await this.prisma.fiscalTrial.findFirst({
      where: {
        organizationId: org,
        creditSaleId: saleId,
        customerReturnId: notaId,
      },
    });
    if (prueba) return { tipo: "FACTURA_PRUEBA" as const, id: prueba.id };
    throw new BadRequestException(
      "La nota de crédito no tiene comprobante fiscal.",
    );
  }

  /** Envía o consulta en ARCA el comprobante de una nota. */
  async procesar(
    actor: string,
    org: string,
    branch: string,
    saleId: string,
    notaId: string,
  ) {
    await this.sales.autorizar(actor, org, "SALE_MANAGE");
    const { tipo, id } = await this.comprobante(org, saleId, notaId);
    return tipo === "FACTURA"
      ? this.production.process(actor, org, branch, saleId, id)
      : this.presentar(
          await this.fiscal.processCredit(actor, org, branch, saleId, id),
        );
  }

  /** Vuelve a poner en cola el comprobante rechazado de una nota y lo envía. */
  async reencolar(
    actor: string,
    org: string,
    branch: string,
    saleId: string,
    notaId: string,
  ) {
    await this.sales.autorizar(actor, org, "SALE_MANAGE");
    const { tipo, id } = await this.comprobante(org, saleId, notaId);
    if (tipo === "FACTURA")
      await this.production.requeue(actor, org, branch, saleId, id);
    else await this.fiscal.requeue(actor, org, branch, saleId, id);
    return this.procesar(actor, org, branch, saleId, notaId);
  }
}
