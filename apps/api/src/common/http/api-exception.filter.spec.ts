import { ConflictException, type ArgumentsHost } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { ApiExceptionFilter } from "./api-exception.filter";

describe("branch product conflict responses", () => {
  it.each([
    new Prisma.PrismaClientUnknownRequestError("BRANCH_PRODUCT_REMOVED", {
      clientVersion: "test",
    }),
    new Prisma.PrismaClientKnownRequestError("Constraint failed", {
      code: "P2004",
      clientVersion: "test",
      meta: { database_error: "BRANCH_PRODUCT_UNAVAILABLE" },
    }),
  ])(
    "returns a Spanish conflict without exposing database details",
    (exception) => {
      const json = jest.fn();
      const status = jest.fn().mockReturnValue({ json });
      const host = {
        switchToHttp: () => ({
          getRequest: () => ({}),
          getResponse: () => ({ status }),
        }),
      } as unknown as ArgumentsHost;
      new ApiExceptionFilter().catch(exception, host);
      expect(status).toHaveBeenCalledWith(409);
      expect(json).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining(
            "archivado o eliminado de esta sucursal",
          ),
        }),
      );
      expect(JSON.stringify(json.mock.calls)).not.toContain("BRANCH_PRODUCT");
    },
  );
});

describe("ofertas que cambiaron (SISTEMA-103)", () => {
  it("publica el código y el cálculo nuevo para que la web actualice el carrito", () => {
    const json = jest.fn();
    const status = jest.fn().mockReturnValue({ json });
    const host = {
      switchToHttp: () => ({
        getRequest: () => ({}),
        getResponse: () => ({ status }),
      }),
    } as unknown as ArgumentsHost;
    new ApiExceptionFilter().catch(
      new ConflictException({
        error: "OFERTAS_CAMBIARON",
        message: "Las ofertas de la venta cambiaron.",
        details: { ofertas: [{ productId: "p1", offerDiscountMinor: "100" }] },
      }),
      host,
    );
    expect(status).toHaveBeenCalledWith(409);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        code: "OFERTAS_CAMBIARON",
        details: { ofertas: [{ productId: "p1", offerDiscountMinor: "100" }] },
      }),
    );
  });
});
