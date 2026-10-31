import { ArcaSoap } from "./arca-soap";
import { productionIssuanceAvailable } from "./production-issuance";
import * as transport from "./arca-production-transport";

describe("local test environment safety", () => {
  const previousLocal = process.env.FISCAL_LOCAL_TESTING;
  const previousIssuance = process.env.FISCAL_PRODUCTION_ISSUANCE;
  afterEach(() => {
    if (previousLocal === undefined) delete process.env.FISCAL_LOCAL_TESTING;
    else process.env.FISCAL_LOCAL_TESTING = previousLocal;
    if (previousIssuance === undefined)
      delete process.env.FISCAL_PRODUCTION_ISSUANCE;
    else process.env.FISCAL_PRODUCTION_ISSUANCE = previousIssuance;
    jest.restoreAllMocks();
  });
  it("blocks inherited production activation flags", () => {
    process.env.FISCAL_LOCAL_TESTING = "true";
    process.env.FISCAL_PRODUCTION_ISSUANCE = "enabled";
    expect(productionIssuanceAvailable()).toBe(false);
  });
  it.each([
    "loginCms",
    "FEParamGetPtosVenta",
    "FECompConsultar",
    "FECAESolicitar",
  ])("blocks production %s before any network call", async (operation) => {
    process.env.FISCAL_LOCAL_TESTING = "true";
    process.env.FISCAL_PRODUCTION_ISSUANCE = "enabled";
    const fetchMock = jest.spyOn(globalThis, "fetch");
    const production = jest.spyOn(transport, "postProductionWsfe");
    await expect(
      new ArcaSoap().call(
        operation === "loginCms" ? "wsaa" : "wsfe",
        operation,
        "",
        "PRODUCTION",
      ),
    ).rejects.toThrow("entorno local de pruebas");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(production).not.toHaveBeenCalled();
  });
  it("retains the normal production gate outside local testing", () => {
    delete process.env.FISCAL_LOCAL_TESTING;
    process.env.FISCAL_PRODUCTION_ISSUANCE = "enabled";
    expect(productionIssuanceAvailable()).toBe(true);
  });
});
