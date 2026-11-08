import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { PROCESO_AUTOMATICO } from "./actor-fiscal";
import {
  ESPERA_ENTRE_INTENTOS_MS,
  planificarCola,
  seguirConElGrupo,
  type EstadoPendiente,
  type Pendiente,
} from "./cola-fiscal-plan";
import { FiscalSalesService } from "./fiscal-sales.service";
import { productionIssuanceAvailable } from "./production-issuance";
import { ProductionSalesService } from "./production-sales.service";

const CADA_MS = 60_000;
/** Deja terminar el arranque de la API antes de la primera vuelta. */
const PRIMERA_VUELTA_MS = 20_000;
const LEIDOS_POR_VUELTA = 500;
const ENVIOS_POR_VUELTA = 50;
const SIN_RESOLVER: EstadoPendiente[] = ["QUEUED", "PENDING", "UNCERTAIN"];

export type ResumenCola = {
  intentados: number;
  autorizados: number;
  rechazados: number;
  sinConfirmar: number;
  fallidos: number;
};

/**
 * Cola fiscal (SISTEMA-61): envía sola a ARCA las facturas y notas de crédito
 * que quedaron en cola y concilia las que esperan confirmación. Así una venta
 * no depende de que alguien toque "Enviar factura pendiente", y las ventas
 * hechas sin internet se facturan al volver la conexión.
 *
 * Producción sólo corre con la emisión productiva habilitada. Las facturas de
 * ventas ya hechas se emiten aunque la farmacia esté bloqueada por falta de
 * pago. Se apaga con FISCAL_QUEUE_WORKER=off.
 */
@Injectable()
export class ColaFiscalService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger("ColaFiscal");
  private timer: NodeJS.Timeout | undefined;
  private corriendo = false;
  /** Último intento de la cola por comprobante, para esperar entre reintentos. */
  private readonly intentos = new Map<string, number>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly production: ProductionSalesService,
    private readonly fiscal: FiscalSalesService,
  ) {}

  onModuleInit() {
    if (process.env.FISCAL_QUEUE_WORKER === "off") return;
    this.timer = setTimeout(() => void this.vuelta(), PRIMERA_VUELTA_MS);
  }

  onModuleDestroy() {
    if (this.timer) clearTimeout(this.timer);
  }

  private async vuelta() {
    try {
      const resumen = await this.procesarPendientes();
      if (resumen.intentados)
        this.logger.log(
          `Intentados ${resumen.intentados}: autorizados ${resumen.autorizados}, rechazados ${resumen.rechazados}, sin confirmar ${resumen.sinConfirmar}, con error ${resumen.fallidos}.`,
        );
    } catch (cause) {
      this.logger.error(
        "No se pudo revisar la cola fiscal.",
        cause instanceof Error ? cause.stack : undefined,
      );
    }
    this.timer = setTimeout(() => void this.vuelta(), CADA_MS);
  }

  /**
   * Una vuelta de la cola. `organizationId` la acota a una farmacia (tests);
   * `ahora` permite simular el reloj.
   */
  async procesarPendientes(
    opciones: { organizationId?: string; ahora?: () => number } = {},
  ): Promise<ResumenCola> {
    const resumen: ResumenCola = {
      intentados: 0,
      autorizados: 0,
      rechazados: 0,
      sinConfirmar: 0,
      fallidos: 0,
    };
    if (this.corriendo) return resumen;
    this.corriendo = true;
    try {
      const ahora = opciones.ahora ?? Date.now;
      const envios = new Map<string, () => Promise<string>>();
      const pendientes: Pendiente[] = [];
      const filtro = opciones.organizationId
        ? { organizationId: opciones.organizationId }
        : {};

      if (productionIssuanceAvailable()) {
        const documentos = await this.prisma.fiscalDocument.findMany({
          where: { status: { in: SIN_RESOLVER }, ...filtro },
          include: { sourceSale: { select: { status: true } } },
          orderBy: { createdAt: "asc" },
          take: LEIDOS_POR_VUELTA,
        });
        for (const doc of documentos) {
          pendientes.push({
            id: doc.id,
            grupo: `prod:${doc.issuerCuit}:${doc.point}`,
            estado: doc.status as EstadoPendiente,
            creado: doc.createdAt,
            actualizado: doc.updatedAt,
            ventaAnulada: doc.sourceSale.status !== "COMPLETED",
          });
          envios.set(
            doc.id,
            async () =>
              (
                await this.production.process(
                  PROCESO_AUTOMATICO,
                  doc.organizationId,
                  doc.branchId,
                  doc.sourceSaleId,
                  doc.id,
                )
              ).status,
          );
        }
      }

      // Homologación: sólo facturas de prueba de ventas, nunca las sueltas.
      const pruebas = await this.prisma.fiscalTrial.findMany({
        where: {
          status: { in: SIN_RESOLVER },
          sourceSaleId: { not: null },
          ...filtro,
        },
        include: { sourceSale: { select: { status: true, branchId: true } } },
        orderBy: { createdAt: "asc" },
        take: LEIDOS_POR_VUELTA,
      });
      for (const prueba of pruebas) {
        const venta = prueba.sourceSale;
        if (!venta || !prueba.sourceSaleId) continue;
        const saleId = prueba.sourceSaleId;
        pendientes.push({
          id: prueba.id,
          grupo: `homo:${prueba.organizationId}`,
          estado: prueba.status as EstadoPendiente,
          creado: prueba.createdAt,
          actualizado: prueba.updatedAt,
          ventaAnulada: venta.status !== "COMPLETED",
        });
        envios.set(
          prueba.id,
          async () =>
            (
              await this.fiscal.process(
                PROCESO_AUTOMATICO,
                prueba.organizationId,
                venta.branchId,
                saleId,
              )
            ).status,
        );
      }

      const plan = planificarCola(pendientes, ahora(), (id) =>
        this.intentos.get(id),
      );
      cola: for (const grupo of plan) {
        let fallosSeguidos = 0;
        for (const pendiente of grupo) {
          if (resumen.intentados >= ENVIOS_POR_VUELTA) break cola;
          const enviar = envios.get(pendiente.id);
          if (!enviar) continue;
          this.intentos.set(pendiente.id, ahora());
          resumen.intentados++;
          let estado: string;
          try {
            estado = await enviar();
          } catch (cause) {
            // Los servicios guardan el motivo en el comprobante; acá sólo se
            // registra para diagnóstico, sin datos de ARCA.
            this.logger.warn(
              `No se pudo procesar ${pendiente.id}: ${cause instanceof Error ? cause.message : "error"}`,
            );
            estado = pendiente.estado === "QUEUED" ? "QUEUED" : "UNCERTAIN";
          }
          if (estado === "AUTHORIZED" || estado === "REJECTED") {
            if (estado === "AUTHORIZED") resumen.autorizados++;
            else resumen.rechazados++;
            this.intentos.delete(pendiente.id);
            fallosSeguidos = 0;
          } else if (estado === "QUEUED") {
            resumen.fallidos++;
            fallosSeguidos++;
          } else resumen.sinConfirmar++;
          if (!seguirConElGrupo(estado, fallosSeguidos)) break;
        }
      }
      this.olvidarIntentosViejos(ahora());
      return resumen;
    } finally {
      this.corriendo = false;
    }
  }

  private olvidarIntentosViejos(ahora: number) {
    for (const [id, cuando] of this.intentos)
      if (ahora - cuando > ESPERA_ENTRE_INTENTOS_MS * 4)
        this.intentos.delete(id);
  }
}
