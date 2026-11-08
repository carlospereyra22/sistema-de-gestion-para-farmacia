import { generateKeyPairSync, sign } from "node:crypto";
import { clavePublicaValida, firmaValida } from "./firma-venta";

function parDeClaves(namedCurve = "prime256v1") {
  const { publicKey, privateKey } = generateKeyPairSync("ec", { namedCurve });
  return {
    publica: publicKey
      .export({ format: "der", type: "spki" })
      .toString("base64"),
    firmar: (texto: string) =>
      sign("sha256", Buffer.from(texto), {
        key: privateKey,
        dsaEncoding: "ieee-p1363",
      }).toString("base64"),
  };
}

describe("firma de ventas sin conexión", () => {
  const venta = JSON.stringify({ clientOperationId: "a", total: 100 });

  it("acepta la firma del texto exacto con la clave del usuario", () => {
    const ana = parDeClaves();
    expect(clavePublicaValida(ana.publica)).toBe(true);
    expect(firmaValida(ana.publica, venta, ana.firmar(venta))).toBe(true);
  });

  it("rechaza otro texto, la clave de otro usuario o una firma rota", () => {
    const ana = parDeClaves();
    const beto = parDeClaves();
    const firma = ana.firmar(venta);
    expect(firmaValida(ana.publica, `${venta} `, firma)).toBe(false);
    expect(firmaValida(beto.publica, venta, firma)).toBe(false);
    expect(firmaValida(ana.publica, venta, "no-es-base64")).toBe(false);
  });

  it("sólo admite claves P-256", () => {
    expect(clavePublicaValida(parDeClaves("secp384r1").publica)).toBe(false);
    expect(clavePublicaValida("basura")).toBe(false);
  });
});
