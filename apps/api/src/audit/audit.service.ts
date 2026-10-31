import { Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";

import { PrismaService } from "../prisma/prisma.service";

type AuditEntry = {
  organizationId: string;
  branchId?: string;
  actorId?: string;
  entityType: string;
  entityId?: string;
  action: string;
  before?: Prisma.InputJsonValue;
  after?: Prisma.InputJsonValue;
};

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async record(entry: AuditEntry): Promise<void> {
    await this.prisma.auditLog.create({ data: entry });
  }

  async recordInTransaction(
    transaction: Prisma.TransactionClient,
    entry: AuditEntry,
  ): Promise<void> {
    await transaction.auditLog.create({ data: entry });
  }
}
