import { fiscalQrUrl, type FiscalQrDocument } from "./fiscal-qr";

const document: FiscalQrDocument = {
  environment: "PRODUCTION",
  status: "AUTHORIZED",
  date: "2026-09-27",
  issuerCuit: "20247237837",
  point: 1,
  voucherType: 11,
  number: 2,
  totalMinor: 12345n,
  currency: "PES",
  cae: "70417054367476",
};
function decode(value: FiscalQrDocument) {
  const url = new URL(fiscalQrUrl(value));
  expect(url.origin + url.pathname).toBe("https://www.arca.gob.ar/fe/qr/");
  return JSON.parse(
    Buffer.from(url.searchParams.get("p")!, "base64").toString("utf8"),
  ) as Record<string, unknown>;
}
describe("production fiscal QR payload preparation", () => {
  it("encodes official numeric fields and exact cents, with no credentials", () => {
    expect(decode(document)).toEqual({
      ver: 1,
      fecha: "2026-09-27",
      cuit: 20247237837,
      ptoVta: 1,
      tipoCmp: 11,
      nroCmp: 2,
      importe: 123.45,
      moneda: "PES",
      ctz: 1,
      tipoCodAut: "E",
      codAut: 70417054367476,
    });
    expect(decode({ ...document, totalMinor: 1n }).importe).toBe(0.01);
  });
  it("includes identified recipients and omits anonymous recipient fields", () => {
    expect(
      decode({
        ...document,
        recipient: { docType: 96, docNumber: "12345678" },
      }),
    ).toMatchObject({ tipoDocRec: 96, nroDocRec: 12345678 });
    expect(
      decode({
        ...document,
        recipient: { docType: 80, docNumber: document.issuerCuit },
      }),
    ).toMatchObject({ tipoDocRec: 80, nroDocRec: 20247237837 });
    expect(
      decode({ ...document, recipient: { docType: 99, docNumber: "0" } }),
    ).not.toHaveProperty("nroDocRec");
  });
  it.each(["QUEUED", "PENDING", "UNCERTAIN", "REJECTED"])(
    "rejects %s documents",
    (status) => {
      expect(() => fiscalQrUrl({ ...document, status })).toThrow();
    },
  );
  it("never presents homologation as a production QR", () => {
    expect(() =>
      fiscalQrUrl({ ...document, environment: "HOMOLOGATION" }),
    ).toThrow();
  });
  it.each<Partial<FiscalQrDocument>>([
    { date: "2026-02-30" },
    { date: "invalid" },
    { issuerCuit: "20247237838" },
    { point: 0 },
    { point: 100000 },
    { point: 1.5 },
    { number: 100000000 },
    { voucherType: 0 },
    { totalMinor: 0n },
    { totalMinor: -1n },
    { totalMinor: 2147483648n },
    { currency: "USD" },
    { cae: "" },
    { cae: "00000000000000" },
    { cae: "<script>" },
    { recipient: { docType: 99, docNumber: "12345678" } },
    { recipient: { docType: 80, docNumber: "20247237838" } },
    { recipient: { docType: 96, docNumber: "9007199254740993" } },
  ])("rejects invalid or unsupported fields: %s", (patch) => {
    expect(() => fiscalQrUrl({ ...document, ...patch })).toThrow();
  });
});
