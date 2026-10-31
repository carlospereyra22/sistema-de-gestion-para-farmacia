import type { ArgumentsHost } from "@nestjs/common";
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
