import { ArcaConnectionService } from "./arca-connection.service";
import { ArcaSoap } from "./arca-soap";
import type { PrismaService } from "../prisma/prisma.service";
import type { OrganizationsService } from "../organizations/organizations.service";
import type { CredentialVault } from "./credential-vault";

describe("homologation point catalog", () => {
  const access = {
    token: "fixture",
    sign: "fixture",
    cuit: "20247237837",
    version: 1,
  };
  const soap = new ArcaSoap();
  const service = new ArcaConnectionService(
    {} as PrismaService,
    {} as OrganizationsService,
    {} as CredentialVault,
    soap,
  );
  afterEach(() => jest.restoreAllMocks());
  it("accepts the production CAE - Monotributo label without relaxing other checks", async () => {
    const call = jest.spyOn(soap, "call").mockResolvedValue({
      ResultGet: {
        PtoVenta: [
          {
            Nro: "3",
            Bloqueado: "N",
            EmisionTipo: "CAE - Monotributo",
            FchBaja: "NULL",
          },
          {
            Nro: "4",
            Bloqueado: "S",
            EmisionTipo: "CAE - Monotributo",
            FchBaja: "NULL",
          },
          {
            Nro: "5",
            Bloqueado: "N",
            EmisionTipo: "CAE - Monotributo",
            FchBaja: "20260927",
          },
          {
            Nro: "6",
            Bloqueado: "N",
            EmisionTipo: "CAEA - Monotributo",
            FchBaja: "NULL",
          },
          {
            Nro: "7",
            Bloqueado: "N",
            EmisionTipo: "CAE - Desconocido",
            FchBaja: "NULL",
          },
        ],
      },
    });
    expect(
      (await service.points({ ...access, environment: "PRODUCTION" })).map(
        (p) => p.number,
      ),
    ).toEqual([3]);
    expect(call).toHaveBeenCalledWith(
      "wsfe",
      "FEParamGetPtosVenta",
      expect.any(String),
      "PRODUCTION",
    );
  });
  it("only treats explicit 602 as no catalog, never authentication failures", async () => {
    const call = jest.spyOn(soap, "call").mockResolvedValue({
      Errors: { Err: { Code: "602", Msg: "Sin resultados" } },
    });
    expect(await service.points(access)).toEqual([]);
    call.mockResolvedValue({
      Errors: {
        Err: [
          { Code: "602", Msg: "Sin resultados" },
          { Code: "600", Msg: "No autorizado" },
        ],
      },
    });
    await expect(service.points(access)).rejects.toThrow("600");
  });
  it("does not turn blocked/closed/CAEA-only points into an empty manual fallback", async () => {
    const call = jest.spyOn(soap, "call").mockResolvedValue({
      ResultGet: {
        PtoVenta: { Nro: "1", Bloqueado: "S", EmisionTipo: "CAE" },
      },
    });
    await expect(service.points(access)).rejects.toThrow("ninguno");
    call.mockResolvedValue({
      ResultGet: {
        PtoVenta: [
          { Nro: "1", Bloqueado: "N", EmisionTipo: "CAE", FchBaja: "NULL" },
          { Nro: "2", Bloqueado: "N", EmisionTipo: "CAEA" },
        ],
      },
    });
    expect((await service.points(access)).map((p) => p.number)).toEqual([1]);
  });
});
