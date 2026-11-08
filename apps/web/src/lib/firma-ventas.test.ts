import { createPublicKey, verify } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { almacenEnMemoria, usarAlmacen } from "./almacen-local";
import { claveDeEstaPc, firmarVenta } from "./firma-ventas";

// Verifica como lo hace el servidor (node:crypto, firma r||s).
const valida = (publica: string, texto: string, firma: string) =>
  verify(
    "sha256",
    Buffer.from(texto),
    {
      key: createPublicKey({
        key: Buffer.from(publica, "base64"),
        format: "der",
        type: "spki",
      }),
      dsaEncoding: "ieee-p1363",
    },
    Buffer.from(firma, "base64"),
  );

describe("firma de ventas sin conexión", () => {
  beforeEach(() => usarAlmacen(almacenEnMemoria()));

  it("cada usuario conserva su clave en la PC", async () => {
    const primera = await claveDeEstaPc("ana@farmacia.com");
    expect((await claveDeEstaPc("ana@farmacia.com")).publica).toBe(
      primera.publica,
    );
    expect((await claveDeEstaPc("beto@farmacia.com")).publica).not.toBe(
      primera.publica,
    );
    expect(primera.privada.extractable).toBe(false);
  });

  it("el servidor puede verificar la firma, y sólo del texto exacto", async () => {
    const venta = JSON.stringify({ clientOperationId: "v1", total: 100 });
    const { publica } = await claveDeEstaPc("ana@farmacia.com");
    const firma = await firmarVenta("ana@farmacia.com", venta);
    expect(valida(publica, venta, firma)).toBe(true);
    expect(valida(publica, `${venta} `, firma)).toBe(false);
  });
});
