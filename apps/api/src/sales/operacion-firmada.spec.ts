import { ApiExceptionFilter } from "../common/http/api-exception.filter";
import { PARA_SU_DUENO, sinClaveRegistrada } from "./operacion-firmada";

describe("operación firmada de otro usuario sin clave registrada", () => {
  it("responde 409 con el código PARA_SU_DUENO para que la PC la deje a su dueño", () => {
    const error = sinClaveRegistrada("la venta");
    let estado = 0;
    let cuerpo: { code?: string; message?: string } = {};
    const respuesta = {
      status: (s: number) => {
        estado = s;
        return respuesta;
      },
      json: (b: typeof cuerpo) => {
        cuerpo = b;
      },
    };
    new ApiExceptionFilter().catch(error, {
      switchToHttp: () => ({
        getRequest: () => ({ requestId: "r1" }),
        getResponse: () => respuesta,
      }),
    } as never);
    expect(estado).toBe(409);
    expect(cuerpo.code).toBe(PARA_SU_DUENO);
    expect(cuerpo.message).toContain("quien hizo la venta");
  });
});
