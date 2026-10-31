import { ArcaSoap, parseXml, escapeXml, signedLogin } from "./arca-soap";
import { argentinaDate, trialBody } from "./fiscal-trial.service";
import { createCertificateRequest } from "./certificate-files";
import * as forge from "node-forge";
import * as productionTransport from "./arca-production-transport";

describe("ARCA homologation transport", () => {
  afterEach(() => jest.restoreAllMocks());
  it("production setup only allows authentication and point queries, never issuance", async () => {
    const production = jest
      .spyOn(productionTransport, "postProductionWsfe")
      .mockResolvedValue(
        '<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body><FEParamGetPtosVentaResponse><FEParamGetPtosVentaResult><ResultGet /></FEParamGetPtosVentaResult></FEParamGetPtosVentaResponse></soap:Body></soap:Envelope>',
      );
    const mock = jest
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response(
          '<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body><FEParamGetPtosVentaResponse><FEParamGetPtosVentaResult><ResultGet /></FEParamGetPtosVentaResult></FEParamGetPtosVentaResponse></soap:Body></soap:Envelope>',
        ),
      );
    await expect(
      new ArcaSoap().call("wsfe", "FECAESolicitar", "secret", "PRODUCTION"),
    ).rejects.toThrow("no está habilitada");
    expect(mock).not.toHaveBeenCalled();
    expect(production).not.toHaveBeenCalled();
    await new ArcaSoap().call(
      "wsfe",
      "FEParamGetPtosVenta",
      "<Auth/>",
      "PRODUCTION",
    );
    expect(mock).not.toHaveBeenCalled();
    expect(production).toHaveBeenCalledWith(
      expect.stringContaining("FEParamGetPtosVenta"),
      '"http://ar.gov.afip.dif.FEV1/FEParamGetPtosVenta"',
    );
  });
  it("reports production transport failures without secrets or a false issuance warning", async () => {
    jest
      .spyOn(productionTransport, "postProductionWsfe")
      .mockRejectedValue(new Error("SECRET"));
    await expect(
      new ArcaSoap().call(
        "wsfe",
        "FEParamGetPtosVenta",
        "secret",
        "PRODUCTION",
      ),
    ).rejects.toThrow("ARCA producción. No se emitió ningún comprobante");
  });
  it("rejects entities/DTD and malformed XML, keeps numbers as strings", () => {
    expect(() =>
      parseXml('<!DOCTYPE a [<!ENTITY x "secret">]><a>&x;</a>'),
    ).toThrow();
    expect(() => parseXml("<a>")).toThrow();
    expect(parseXml('<s:a xmlns:s="urn:x"><n>0001</n></s:a>')).toEqual({
      a: { n: "0001" },
    });
    expect(escapeXml('<a&"')).toBe("&lt;a&amp;&quot;");
  });
  it("only contacts homologation, no redirects or raw fault leaks", async () => {
    const mock = jest
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response(
          '<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body><soap:Fault><faultstring>coe.notAuthorized SECRET</faultstring></soap:Fault></soap:Body></soap:Envelope>',
        ),
      );
    await expect(
      new ArcaSoap().call("wsaa", "loginCms", "<in0>test</in0>"),
    ).rejects.toThrow("En WSASS");
    expect(mock.mock.calls[0]?.[0]).toBe(
      "https://wsaahomo.afip.gov.ar/ws/services/LoginCms",
    );
    expect(mock.mock.calls[0]?.[1]?.redirect).toBe("error");
  });
  it("uses Argentine date, consumer final condition and correct C/B totals/order", () => {
    expect(argentinaDate(new Date("2026-09-27T01:00:00Z"))).toBe("20260926");
    const sample = {
      point: 1,
      number: 2,
      date: "20260926",
      voucherType: 11,
      totalMinor: 10000,
    };
    const c = trialBody(sample);
    expect(c).toContain("<ImpTotal>100.00</ImpTotal>");
    expect(c).not.toContain("<Iva>");
    expect(c).toContain("<CondicionIVAReceptorId>5");
    const b = trialBody({ ...sample, voucherType: 6, totalMinor: 12100 });
    expect(b).toContain("<ImpIVA>21.00</ImpIVA>");
    expect(b.indexOf("<CondicionIVAReceptorId>")).toBeLessThan(
      b.indexOf("<Iva>"),
    );
  });
  it("signs a CMS with an encapsulated wsfe login request", async () => {
    const keys = await createCertificateRequest("Test", "20247237837");
    const key = forge.pki.privateKeyFromPem(keys.privateKey);
    const cert = forge.pki.createCertificate();
    cert.publicKey = forge.pki.rsa.setPublicKey(key.n, key.e);
    cert.serialNumber = "01";
    cert.validity.notBefore = new Date();
    cert.validity.notAfter = new Date(Date.now() + 86400000);
    cert.setSubject([{ name: "commonName", value: "fixture" }]);
    cert.setIssuer(cert.subject.attributes);
    cert.sign(key, forge.md.sha256.create());
    const cms = signedLogin(forge.pki.certificateToPem(cert), keys.privateKey);
    const bytes = forge.util.decode64(cms);
    expect(bytes).toContain("<service>wsfe</service>");
    expect(bytes).not.toContain("PRIVATE KEY");
    expect(() =>
      forge.pkcs7.messageFromAsn1(forge.asn1.fromDer(bytes)),
    ).not.toThrow();
  });
});
