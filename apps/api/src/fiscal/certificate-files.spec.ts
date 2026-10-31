import { createPrivateKey, randomBytes } from "node:crypto";
import * as forge from "node-forge";
import {
  createCertificateRequest,
  inspectCertificate,
} from "./certificate-files";
import { CredentialVault } from "./credential-vault";
import { assertCredentialTransport } from "./credential-transport";

export function testCertificate(
  privateKey: string,
  holder = "20247237837",
  from = new Date(Date.now() - 60000),
  to = new Date(Date.now() + 86400000),
  ca = false,
) {
  const key = forge.pki.privateKeyFromPem(privateKey);
  const certificate = forge.pki.createCertificate();
  certificate.publicKey = forge.pki.rsa.setPublicKey(key.n, key.e);
  certificate.serialNumber = "01";
  certificate.validity.notBefore = from;
  certificate.validity.notAfter = to;
  certificate.setSubject([
    { name: "commonName", value: "Test only" },
    { name: "serialNumber", value: `CUIT ${holder}` },
  ]);
  certificate.setIssuer(certificate.subject.attributes);
  certificate.setExtensions([{ name: "basicConstraints", cA: ca }]);
  certificate.sign(key, forge.md.sha256.create());
  return forge.pki.certificateToPem(certificate);
}

describe("fiscal file checks (local only, no ARCA authorization)", () => {
  let generated: Awaited<ReturnType<typeof createCertificateRequest>>;
  beforeAll(async () => {
    generated = await createCertificateRequest("Farmacia Ñandú", "20247237837");
  });
  it("generates a signed PKCS10 request with the holder CUIT, accents and a 2048-bit key", () => {
    const request = forge.pki.certificationRequestFromPem(generated.csr);
    expect(request.verify()).toBe(true);
    expect(request.subject.getField({ name: "serialNumber" }).value).toBe(
      "CUIT 20247237837",
    );
    // Forge exposes ASN.1 UTF8String values as binary strings when parsing.
    expect(forge.util.decodeUtf8(request.subject.getField("O").value)).toBe(
      "Farmacia Ñandú",
    );
    expect(
      createPrivateKey(generated.privateKey).asymmetricKeyDetails
        ?.modulusLength,
    ).toBe(2048);
    expect(generated.csr).not.toContain("PRIVATE KEY");
  });
  it("checks matching keys and validity without claiming the issuer is trusted", () => {
    const result = inspectCertificate(
      testCertificate(generated.privateKey),
      generated.privateKey,
      "20247237837",
    );
    expect(result.fingerprint).toMatch(/^[A-F0-9:]+$/);
    expect(result.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });
  it("rejects a wrong CUIT, invalid dates, CA files and malformed files", () => {
    const key = generated.privateKey;
    expect(() =>
      inspectCertificate(testCertificate(key), key, "20111111112"),
    ).toThrow("CUIT");
    expect(() =>
      inspectCertificate(
        testCertificate(key, undefined, new Date(0), new Date(1000)),
        key,
        "20247237837",
      ),
    ).toThrow("vencido");
    expect(() =>
      inspectCertificate(
        testCertificate(key, undefined, new Date(Date.now() + 60000)),
        key,
        "20247237837",
      ),
    ).toThrow("vigencia");
    expect(() =>
      inspectCertificate(
        testCertificate(key, undefined, undefined, undefined, true),
        key,
        "20247237837",
      ),
    ).toThrow("autoridad");
    expect(() => inspectCertificate("pdf", key, "20247237837")).toThrow(
      "leer los archivos",
    );
  });
  it("rejects mismatched keys and supports password-protected key files", async () => {
    const other = await createCertificateRequest("Other", "20247237837");
    const cert = testCertificate(generated.privateKey);
    expect(() =>
      inspectCertificate(cert, other.privateKey, "20247237837"),
    ).toThrow("no corresponden");
    const encrypted = createPrivateKey(generated.privateKey)
      .export({
        format: "pem",
        type: "pkcs8",
        cipher: "aes-256-cbc",
        passphrase: "test-passphrase",
      })
      .toString();
    expect(() =>
      inspectCertificate(cert, encrypted, "20247237837", "wrong"),
    ).toThrow("contraseña");
    expect(
      inspectCertificate(cert, encrypted, "20247237837", "test-passphrase")
        .fingerprint,
    ).toBeTruthy();
  });
});

describe("credential encryption", () => {
  const previous = process.env.FISCAL_VAULT_KEY;
  const previousMode = process.env.NODE_ENV;
  afterEach(() => {
    if (previous === undefined) delete process.env.FISCAL_VAULT_KEY;
    else process.env.FISCAL_VAULT_KEY = previous;
    if (previousMode === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousMode;
  });
  it("authenticates organization/environment context and rejects tampering or a lost key", async () => {
    process.env.FISCAL_VAULT_KEY = randomBytes(32).toString("hex");
    const vault = new CredentialVault();
    const envelope = await vault.seal("test-secret", "org1:HOMOLOGATION");
    expect(envelope).not.toContain("test-secret");
    expect(await vault.open(envelope, "org1:HOMOLOGATION")).toBe("test-secret");
    await expect(vault.open(envelope, "org2:HOMOLOGATION")).rejects.toThrow();
    const changed = JSON.parse(envelope) as { payload: string };
    changed.payload = Buffer.from("changed").toString("base64");
    await expect(
      vault.open(JSON.stringify(changed), "org1:HOMOLOGATION"),
    ).rejects.toThrow();
    process.env.FISCAL_VAULT_KEY = randomBytes(32).toString("hex");
    await expect(vault.open(envelope, "org1:HOMOLOGATION")).rejects.toThrow();
  });
  it("never falls back to plaintext or a generated production master key", async () => {
    process.env.FISCAL_VAULT_KEY = "invalid";
    const vault = new CredentialVault();
    expect(vault.provider()).toBe("UNAVAILABLE");
    await expect(vault.seal("test-secret", "org")).rejects.toThrow();
    delete process.env.FISCAL_VAULT_KEY;
    process.env.NODE_ENV = "production";
    expect(vault.provider()).toBe("UNAVAILABLE");
  });
  (process.platform === "win32" ? it : it.skip)(
    "protects local test credentials with Windows DPAPI",
    async () => {
      delete process.env.FISCAL_VAULT_KEY;
      process.env.NODE_ENV = "development";
      const vault = new CredentialVault();
      const envelope = await vault.seal("dpapi-test-only", "test-org");
      expect(await vault.open(envelope, "test-org")).toBe("dpapi-test-only");
      await expect(vault.open(envelope, "other-org")).rejects.toThrow();
    },
    20000,
  );
});

it("rejects remote HTTP uploads and spoofed proxy headers", () => {
  expect(() =>
    assertCredentialTransport(false, "192.0.2.1", "https", true),
  ).toThrow();
  expect(() =>
    assertCredentialTransport(false, "127.0.0.1", undefined, true),
  ).toThrow();
  expect(() =>
    assertCredentialTransport(true, "192.0.2.1", undefined, true),
  ).not.toThrow();
  expect(() =>
    assertCredentialTransport(false, "127.0.0.1", "https", true),
  ).not.toThrow();
  expect(() =>
    assertCredentialTransport(false, "::1", undefined, false),
  ).not.toThrow();
});
