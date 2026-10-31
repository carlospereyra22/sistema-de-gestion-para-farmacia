import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import {
  createHash,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
import { Prisma, type PrintJob } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";

export const PRINT_PROFILE = "V21_FINAL_DENSITY_4";
export const digest = (value: string | Buffer) =>
  createHash("sha256").update(value).digest("hex");
type Scope = { actorId: string; organizationId: string; branchId: string };
export type PrintRequest = {
  requestId: string;
  printerId?: string;
  cashRegisterId?: string;
  documentType: "sale" | "account";
  documentId: string;
  reprintOfId?: string;
};
const publicJob = (job: PrintJob) => ({
  id: job.id,
  requestId: job.requestId,
  status: job.status,
  printerId: job.printerId,
  documentType: job.documentType,
  documentId: job.documentId,
  attempts: job.attempts,
  lastError: job.lastError,
  uncertain: job.uncertain,
  createdAt: job.createdAt,
  printedAt: job.printedAt,
});

@Injectable()
export class PrintQueueService {
  constructor(private readonly prisma: PrismaService) {}

  async access(scope: Scope, permission: string) {
    const member = await this.prisma.userOrganization.findUnique({
      where: {
        userId_organizationId: {
          userId: scope.actorId,
          organizationId: scope.organizationId,
        },
      },
      include: {
        roles: {
          include: {
            role: {
              include: { permissions: { include: { permission: true } } },
            },
          },
        },
        organization: true,
      },
    });
    const branch = await this.prisma.userBranch.findFirst({
      where: {
        userId: scope.actorId,
        branchId: scope.branchId,
        branch: { organizationId: scope.organizationId, active: true },
      },
    });
    if (
      !member?.active ||
      !member.organization.active ||
      !branch ||
      !member.roles.some(({ role }) =>
        role.permissions.some(
          ({ permission: granted }) => granted.code === permission,
        ),
      )
    )
      throw new ForbiddenException("No tenés permiso para esta sucursal.");
  }

  async printers(scope: Scope) {
    await this.access(scope, "ORGANIZATION_READ");
    const printers = await this.prisma.printer.findMany({
      where: {
        organizationId: scope.organizationId,
        branchId: scope.branchId,
        enabled: true,
        gateway: { enabled: true },
      },
      include: { gateway: true },
      orderBy: [{ isDefault: "desc" }, { name: "asc" }],
    });
    return printers.map((printer) => ({
      id: printer.id,
      name: printer.name,
      isDefault: printer.isDefault,
      cashRegisterId: printer.cashRegisterId,
      profileVersion: printer.profileVersion,
      online:
        !!printer.gateway.lastSeenAt &&
        Date.now() - printer.gateway.lastSeenAt.getTime() < 90000,
      lastSeenAt: printer.gateway.lastSeenAt,
    }));
  }

  async registerGateway(scope: Scope, name: string) {
    await this.access(scope, "ORGANIZATION_MANAGE");
    const secret = randomBytes(32).toString("hex");
    return this.prisma.$transaction(async (tx) => {
      const gateway = await tx.printGateway.create({
        data: {
          organizationId: scope.organizationId,
          branchId: scope.branchId,
          name,
          secretHash: digest(secret),
        },
      });
      await tx.auditLog.create({
        data: {
          organizationId: scope.organizationId,
          branchId: scope.branchId,
          actorId: scope.actorId,
          entityType: "PRINT_GATEWAY",
          entityId: gateway.id,
          action: "REGISTERED",
        },
      });
      return { id: gateway.id, name, credential: `${gateway.id}.${secret}` };
    });
  }

  async rotateGateway(scope: Scope, id: string, enabled: boolean) {
    await this.access(scope, "ORGANIZATION_MANAGE");
    const secret = randomBytes(32).toString("hex");
    return this.prisma.$transaction(async (tx) => {
      const result = await tx.printGateway.updateMany({
        where: {
          id,
          organizationId: scope.organizationId,
          branchId: scope.branchId,
        },
        data: { enabled, secretHash: digest(secret) },
      });
      if (!result.count) throw new NotFoundException();
      await tx.auditLog.create({
        data: {
          organizationId: scope.organizationId,
          branchId: scope.branchId,
          actorId: scope.actorId,
          entityType: "PRINT_GATEWAY",
          entityId: id,
          action: enabled ? "CREDENTIAL_ROTATED" : "DISABLED",
        },
      });
      return { id, credential: enabled ? `${id}.${secret}` : undefined };
    });
  }

  async registerPrinter(
    scope: Scope,
    input: {
      gatewayId: string;
      name: string;
      windowsPrinterName: string;
      isDefault: boolean;
      cashRegisterId?: string;
    },
  ) {
    await this.access(scope, "ORGANIZATION_MANAGE");
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Branch" WHERE id = ${scope.branchId}::uuid FOR UPDATE`;
      const gateway = await tx.printGateway.findFirst({
        where: {
          id: input.gatewayId,
          organizationId: scope.organizationId,
          branchId: scope.branchId,
          enabled: true,
        },
      });
      if (!gateway)
        throw new BadRequestException(
          "Equipo de impresión no disponible en esta sucursal.",
        );
      if (
        input.cashRegisterId &&
        !(await tx.cashRegister.findFirst({
          where: {
            id: input.cashRegisterId,
            branchId: scope.branchId,
            active: true,
          },
        }))
      )
        throw new BadRequestException("Caja inválida.");
      if (input.isDefault)
        await tx.printer.updateMany({
          where: {
            organizationId: scope.organizationId,
            branchId: scope.branchId,
            isDefault: true,
          },
          data: { isDefault: false },
        });
      const printer = await tx.printer.create({
        data: {
          ...input,
          organizationId: scope.organizationId,
          branchId: scope.branchId,
        },
      });
      await tx.auditLog.create({
        data: {
          organizationId: scope.organizationId,
          branchId: scope.branchId,
          actorId: scope.actorId,
          entityType: "PRINTER",
          entityId: printer.id,
          action: "REGISTERED",
        },
      });
      return { id: printer.id, name: printer.name };
    });
  }

  async enqueue(
    scope: Scope,
    input: PrintRequest,
    render: () => Promise<Buffer>,
  ) {
    await this.access(
      scope,
      input.documentType === "sale" ? "SALE_READ" : "ACCOUNT_READ",
    );
    return this.prisma.$transaction(
      async (tx) => {
        // One transaction owns this intention even when two requests arrive together.
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${scope.organizationId + input.requestId}, 0))`;
        const prior = await tx.printJob.findUnique({
          where: {
            organizationId_requestId: {
              organizationId: scope.organizationId,
              requestId: input.requestId,
            },
          },
        });
        if (prior) {
          if (
            prior.branchId !== scope.branchId ||
            prior.requestedByUserId !== scope.actorId ||
            prior.documentId !== input.documentId ||
            prior.documentType !== input.documentType ||
            (input.printerId && input.printerId !== prior.printerId)
          )
            throw new ConflictException(
              "El identificador corresponde a otro envío.",
            );
          return publicJob(prior);
        }
        const printers = await tx.printer.findMany({
          where: {
            organizationId: scope.organizationId,
            branchId: scope.branchId,
            enabled: true,
            gateway: { enabled: true },
          },
        });
        if (
          input.cashRegisterId &&
          !(await tx.cashRegister.findFirst({
            where: {
              id: input.cashRegisterId,
              branchId: scope.branchId,
              active: true,
            },
          }))
        )
          throw new BadRequestException("Caja inválida.");
        const printer = input.printerId
          ? printers.find((p) => p.id === input.printerId)
          : ((input.cashRegisterId
              ? printers.find((p) => p.cashRegisterId === input.cashRegisterId)
              : undefined) ??
            printers.find((p) => p.isDefault) ??
            (printers.length === 1 ? printers[0] : undefined));
        if (!printer)
          throw new BadRequestException(
            printers.length
              ? "Seleccioná la impresora de destino."
              : "La sucursal no tiene una impresora configurada.",
          );
        if (
          printer.profileVersion !== PRINT_PROFILE ||
          printer.transport !== "windowsRaw"
        )
          throw new BadRequestException("Perfil de impresión no habilitado.");
        if (
          input.reprintOfId &&
          !(await tx.printJob.findFirst({
            where: {
              id: input.reprintOfId,
              organizationId: scope.organizationId,
              branchId: scope.branchId,
              documentId: input.documentId,
              documentType: input.documentType,
            },
          }))
        )
          throw new BadRequestException("Reimpresión inválida.");
        const raw = await render();
        if (!raw.length || raw.length > 2 * 1024 * 1024)
          throw new BadRequestException("El ticket supera el tamaño admitido.");
        const job = await tx.printJob.create({
          data: {
            organizationId: scope.organizationId,
            branchId: scope.branchId,
            gatewayId: printer.gatewayId,
            printerId: printer.id,
            requestId: input.requestId,
            documentType: input.documentType,
            documentId: input.documentId,
            requestedByUserId: scope.actorId,
            reprintOfId: input.reprintOfId,
            profileVersion: PRINT_PROFILE,
            rawPayload: new Uint8Array(raw),
            payloadHash: digest(raw),
          },
        });
        await tx.auditLog.create({
          data: {
            organizationId: scope.organizationId,
            branchId: scope.branchId,
            actorId: scope.actorId,
            entityType: "PRINT_JOB",
            entityId: job.id,
            action: input.reprintOfId ? "REPRINT_REQUESTED" : "QUEUED",
            after: {
              documentType: input.documentType,
              documentId: input.documentId,
              printerId: printer.id,
            },
          },
        });
        return publicJob(job);
      },
      { timeout: 15000 },
    );
  }

  async status(scope: Scope, id: string) {
    const job = await this.prisma.printJob.findFirst({
      where: {
        id,
        organizationId: scope.organizationId,
        branchId: scope.branchId,
      },
    });
    if (!job) throw new NotFoundException();
    await this.access(
      scope,
      job.documentType === "sale" ? "SALE_READ" : "ACCOUNT_READ",
    );
    return publicJob(job);
  }

  async retry(scope: Scope, id: string) {
    const job = await this.status(scope, id);
    if (job.uncertain)
      throw new ConflictException(
        "Revisá el papel y la cola. Este envío pudo haber salido; una nueva copia requiere confirmación.",
      );
    await this.prisma.$transaction(async (tx) => {
      const changed = await tx.printJob.updateMany({
        where: {
          id,
          organizationId: scope.organizationId,
          branchId: scope.branchId,
          status: "FAILED",
          uncertain: false,
        },
        data: {
          status: "PENDING",
          attempts: 0,
          nextAttemptAt: new Date(),
          failedAt: null,
          lastError: null,
        },
      });
      if (changed.count)
        await tx.auditLog.create({
          data: {
            organizationId: scope.organizationId,
            branchId: scope.branchId,
            actorId: scope.actorId,
            entityType: "PRINT_JOB",
            entityId: id,
            action: "RETRY_REQUESTED",
          },
        });
    });
    return this.status(scope, id);
  }

  async authenticate(authorization?: string) {
    const match = /^Bearer ([0-9a-f-]{36})\.([0-9a-f]{64})$/i.exec(
      authorization ?? "",
    );
    if (!match) throw new UnauthorizedException();
    const gateway = await this.prisma.printGateway.findUnique({
      where: { id: match[1] },
    });
    if (
      !gateway?.enabled ||
      !timingSafeEqual(
        Buffer.from(gateway.secretHash, "hex"),
        Buffer.from(digest(match[2]!), "hex"),
      )
    )
      throw new UnauthorizedException();
    const branch = await this.prisma.branch.findFirst({
      where: {
        id: gateway.branchId,
        organizationId: gateway.organizationId,
        active: true,
        organization: { active: true },
      },
    });
    if (!branch) throw new UnauthorizedException();
    return gateway;
  }

  async heartbeat(authorization: string | undefined, version: string) {
    const gateway = await this.authenticate(authorization);
    await this.prisma.printGateway.update({
      where: { id: gateway.id },
      data: { lastSeenAt: new Date(), version },
    });
    const printers = await this.prisma.printer.findMany({
      where: { gatewayId: gateway.id, enabled: true },
      select: {
        id: true,
        windowsPrinterName: true,
        transport: true,
        profileVersion: true,
      },
    });
    return { printers };
  }

  async claim(authorization?: string) {
    const gateway = await this.authenticate(authorization);
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "PrintGateway" WHERE id = ${gateway.id}::uuid FOR UPDATE`;
      const now = new Date();
      await tx.printGateway.update({
        where: { id: gateway.id },
        data: { lastSeenAt: now },
      });
      // Same gateway only: its persistent journal decides if an expired lease may print.
      const job = await tx.printJob.findFirst({
        where: {
          gatewayId: gateway.id,
          organizationId: gateway.organizationId,
          branchId: gateway.branchId,
          printer: { enabled: true },
          OR: [
            { status: "PENDING", nextAttemptAt: { lte: now } },
            { status: "LEASED", leaseUntil: { lte: now } },
          ],
        },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      });
      if (!job) return { job: null };
      // Never dispatch another job while this box already owns a live lease.
      if (
        await tx.printJob.findFirst({
          where: {
            gatewayId: gateway.id,
            status: "LEASED",
            leaseUntil: { gt: now },
          },
        })
      )
        return { job: null };
      const leased = await tx.printJob.update({
        where: { id: job.id },
        data: {
          status: "LEASED",
          leaseId: randomUUID(),
          leaseUntil: new Date(Date.now() + 90000),
          attempts: { increment: 1 },
        },
      });
      return {
        job: {
          id: leased.id,
          leaseId: leased.leaseId,
          printerId: leased.printerId,
          profileVersion: leased.profileVersion,
          rawBase64: Buffer.from(leased.rawPayload).toString("base64"),
          payloadHash: leased.payloadHash,
        },
      };
    });
  }

  async finish(
    authorization: string | undefined,
    id: string,
    leaseId: string,
    outcome: "printed" | "safe_failure" | "uncertain",
  ) {
    const gateway = await this.authenticate(authorization);
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "PrintGateway" WHERE id = ${gateway.id}::uuid FOR UPDATE`;
      const job = await tx.printJob.findFirst({
        where: {
          id,
          gatewayId: gateway.id,
          organizationId: gateway.organizationId,
          branchId: gateway.branchId,
        },
      });
      if (!job || job.leaseId !== leaseId)
        throw new ConflictException("Lease inválido.");
      if (job.status === "PRINTED" && outcome === "printed")
        return { ok: true };
      if (job.status !== "LEASED")
        throw new ConflictException("El trabajo no está asignado.");
      const printed = outcome === "printed";
      const retry = outcome === "safe_failure" && job.attempts < 5;
      const lastError = printed
        ? null
        : outcome === "uncertain"
          ? "Salida sin confirmar. Revisá el papel y la cola antes de pedir otra copia."
          : "La impresora no está disponible antes del envío.";
      await tx.printJob.update({
        where: { id },
        data: {
          status: printed ? "PRINTED" : retry ? "PENDING" : "FAILED",
          uncertain: outcome === "uncertain",
          printedAt: printed ? new Date() : null,
          failedAt: !printed && !retry ? new Date() : null,
          leaseUntil: null,
          nextAttemptAt: new Date(
            Date.now() + Math.min(60000, 5000 * job.attempts),
          ),
          lastError,
        },
      });
      await tx.auditLog.create({
        data: {
          organizationId: job.organizationId,
          branchId: job.branchId,
          entityType: "PRINT_JOB",
          entityId: id,
          action: printed ? "SPOOL_ACCEPTED" : "DELIVERY_FAILED",
          after: { gatewayId: gateway.id, outcome } as Prisma.InputJsonObject,
        },
      });
      return { ok: true };
    });
  }
}
