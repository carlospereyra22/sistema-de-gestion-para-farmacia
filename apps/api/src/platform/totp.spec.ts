import {
  generateTotpSecret,
  matchTotpStep,
  totpCode,
  totpStep,
  totpUri,
} from "./totp";

// "12345678901234567890" en base32: la clave de prueba del RFC 6238.
const rfcSecret = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";

describe("totp", () => {
  it.each([
    [59, "287082"],
    [1111111109, "081804"],
    [1111111111, "050471"],
    [1234567890, "005924"],
    [2000000000, "279037"],
  ])("coincide con el vector del RFC 6238 en %i", (seconds, code) => {
    expect(totpCode(rfcSecret, totpStep(new Date(seconds * 1000)))).toBe(code);
  });

  it("genera secretos distintos en base32", () => {
    const secret = generateTotpSecret();
    expect(secret).toMatch(/^[A-Z2-7]{32}$/);
    expect(generateTotpSecret()).not.toBe(secret);
  });

  it("acepta un paso de desfase hacia cada lado y devuelve cuál fue", () => {
    const now = new Date(1234567890 * 1000);
    const step = totpStep(now);
    for (const candidate of [step - 1, step, step + 1])
      expect(
        matchTotpStep(rfcSecret, totpCode(rfcSecret, candidate), now),
      ).toBe(candidate);
  });

  it("rechaza un código de dos pasos atrás y cualquier otro valor", () => {
    const now = new Date(1234567890 * 1000);
    const old = totpCode(rfcSecret, totpStep(now) - 2);
    expect(matchTotpStep(rfcSecret, old, now)).toBeUndefined();
    expect(matchTotpStep(rfcSecret, "12345", now)).toBeUndefined();
  });

  it("arma la dirección para la aplicación del celular", () => {
    expect(totpUri("dueno@example.com", "ABC")).toBe(
      "otpauth://totp/Farmatec%3Adueno%40example.com?secret=ABC&issuer=Farmatec&algorithm=SHA1&digits=6&period=30",
    );
  });
});
