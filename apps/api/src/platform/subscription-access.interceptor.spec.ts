import type { CallHandler, ExecutionContext } from "@nestjs/common";
import type { Reflector } from "@nestjs/core";
import { of } from "rxjs";

import type { PrismaService } from "../prisma/prisma.service";
import { SubscriptionAccessInterceptor } from "./subscription-access.interceptor";

const organizationId = "6fa3c8e5-7692-4bc8-b6da-8de8f09c2b9b";
const overdue = {
  exempt: false,
  suspendedAt: null,
  cancelledAt: null,
  trialEndsAt: new Date("2020-01-01T00:00:00.000Z"),
  paidThrough: null,
  extendedUntil: null,
};

function setup(
  subscription: () => Promise<unknown>,
  membership: unknown = { active: true, roles: [] },
) {
  const prisma = {
    organizationSubscription: { findUnique: jest.fn(subscription) },
    userOrganization: { findUnique: jest.fn().mockResolvedValue(membership) },
  };
  const interceptor = new SubscriptionAccessInterceptor(
    prisma as unknown as PrismaService,
    { getAllAndOverride: () => undefined } as unknown as Reflector,
  );
  const handle = jest.fn(() => of("respuesta"));
  const context = (params: Record<string, string>, method = "POST") =>
    ({
      getType: () => "http",
      getHandler: () => undefined,
      getClass: () => undefined,
      switchToHttp: () => ({
        getRequest: () => ({ params, method, auth: { sub: "actor" } }),
      }),
    }) as unknown as ExecutionContext;
  const run = (params: Record<string, string>, method?: string) =>
    interceptor.intercept(context(params, method), {
      handle,
    } as CallHandler);
  return { prisma, handle, run };
}

describe("SubscriptionAccessInterceptor", () => {
  it("si el chequeo falla, deja pasar", async () => {
    const { handle, run } = setup(() => Promise.reject(new Error("caída")));

    await run({ organizationId });

    expect(handle).toHaveBeenCalled();
  });

  it("sin suscripción deja pasar", async () => {
    const { handle, run } = setup(() => Promise.resolve(null));

    await run({ organizationId });

    expect(handle).toHaveBeenCalled();
  });

  it("una exenta pasa aunque sus fechas estén vencidas", async () => {
    const { handle, prisma, run } = setup(() =>
      Promise.resolve({ ...overdue, exempt: true }),
    );

    await run({ organizationId });

    expect(handle).toHaveBeenCalled();
    expect(prisma.userOrganization.findUnique).not.toHaveBeenCalled();
  });

  it("frena a un miembro de una farmacia bloqueada", async () => {
    const { handle, run } = setup(() => Promise.resolve(overdue));

    await expect(run({ organizationId })).rejects.toMatchObject({
      status: 402,
    });
    expect(handle).not.toHaveBeenCalled();
  });

  it("a quien no es de la farmacia no le revela su estado", async () => {
    const { handle, run } = setup(() => Promise.resolve(overdue), null);

    await run({ organizationId });

    expect(handle).toHaveBeenCalled();
  });

  it("no consulta nada en rutas sin farmacia o con un id inválido", async () => {
    const { handle, prisma, run } = setup(() => Promise.resolve(overdue));

    await run({});
    await run({ organizationId: "no-es-un-uuid" });

    expect(handle).toHaveBeenCalledTimes(2);
    expect(prisma.organizationSubscription.findUnique).not.toHaveBeenCalled();
  });
});
