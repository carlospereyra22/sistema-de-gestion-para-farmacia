import {
  BadGatewayException,
  BadRequestException,
  UnprocessableEntityException,
} from "@nestjs/common";
import { conRechazoDeArca, rechazoDeArca } from "./arca-rechazo";

describe("problemas con ARCA al probar la conexión (SISTEMA-97)", () => {
  it("un rechazo de ARCA va como 422 con su código, no como corte de internet", () => {
    const fallo = Object.assign(
      new BadGatewayException("ARCA rechazó la conexión. En WSASS autorizá…"),
      { arcaFault: "ns1:coe.notAuthorized Computador no autorizado" },
    );
    const error = rechazoDeArca(fallo) as UnprocessableEntityException;
    expect(error).toBeInstanceOf(UnprocessableEntityException);
    expect(error.getResponse()).toMatchObject({
      message: "ARCA rechazó la conexión. En WSASS autorizá…",
      error: "ARCA_RECHAZO",
      details: { codigo: "ns1:coe.notAuthorized Computador no autorizado" },
    });
  });

  it("si ARCA no respondió, lo marca distinto", () => {
    const error = rechazoDeArca(
      new BadGatewayException("No se pudo completar la comunicación con ARCA."),
    ) as UnprocessableEntityException;
    expect(error.getResponse()).toMatchObject({ error: "ARCA_SIN_RESPUESTA" });
  });

  it("los demás errores pasan sin cambios", async () => {
    const otro = new BadRequestException("Cargá un certificado vigente.");
    expect(rechazoDeArca(otro)).toBe(otro);
    await expect(conRechazoDeArca(Promise.reject(otro))).rejects.toBe(otro);
    await expect(conRechazoDeArca(Promise.resolve(1))).resolves.toBe(1);
  });
});
