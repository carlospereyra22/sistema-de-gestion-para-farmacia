import { randomUUID } from "node:crypto";

import { Test, type TestingModule } from "@nestjs/testing";
import { Prisma } from "@prisma/client";

import { AppModule } from "../src/app.module";
import { HealthService } from "../src/health/health.service";
import { PrismaService } from "../src/prisma/prisma.service";

describe("Database integration", () => {
  let moduleReference: TestingModule;
  let prisma: PrismaService;
  let healthService: HealthService;
  let organizationId: string | undefined;

  beforeAll(async () => {
    moduleReference = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    prisma = moduleReference.get(PrismaService);
    healthService = moduleReference.get(HealthService);
    await prisma.$connect();
  });

  afterEach(async () => {
    if (!organizationId) {
      return;
    }

    await prisma.branch.deleteMany({ where: { organizationId } });
    await prisma.organization.delete({ where: { id: organizationId } });
    organizationId = undefined;
  });

  afterAll(async () => {
    await moduleReference.close();
  });

  it("connects to PostgreSQL through the health service", async () => {
    await expect(healthService.check()).resolves.toEqual({
      status: "ok",
      database: "ok",
    });
  });

  it("persists a branch under its organization and prevents duplicate codes in that organization", async () => {
    const organization = await prisma.organization.create({
      data: { id: randomUUID(), name: "Integration Test Organization" },
    });
    organizationId = organization.id;

    const branch = await prisma.branch.create({
      data: {
        organizationId: organization.id,
        name: "Integration Test Branch",
        code: "TEST-BRANCH",
      },
    });

    expect(branch.organizationId).toBe(organization.id);
    await expect(
      prisma.branch.create({
        data: {
          organizationId: organization.id,
          name: "Duplicate Code Branch",
          code: "TEST-BRANCH",
        },
      }),
    ).rejects.toMatchObject<Partial<Prisma.PrismaClientKnownRequestError>>({
      code: "P2002",
    });
  });
});
