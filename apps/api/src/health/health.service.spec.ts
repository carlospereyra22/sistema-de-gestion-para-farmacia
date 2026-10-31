import { HealthService } from "./health.service";

describe("HealthService", () => {
  it("reports an unavailable database when no connection is configured", async () => {
    const service = new HealthService(
      { $queryRawUnsafe: jest.fn() } as never,
      { databaseUrl: undefined } as never,
    );

    await expect(service.check()).resolves.toEqual({
      status: "error",
      database: "unavailable",
      message: "Database is not configured yet.",
    });
  });

  it("reports a healthy database after a successful lightweight query", async () => {
    const service = new HealthService(
      {
        $queryRawUnsafe: jest.fn().mockResolvedValue([{ "?column?": 1 }]),
      } as never,
      { databaseUrl: "postgresql://localhost:5432/gestion" } as never,
    );

    await expect(service.check()).resolves.toEqual({
      status: "ok",
      database: "ok",
    });
  });
});
