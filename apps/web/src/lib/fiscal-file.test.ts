import { expect, it } from "vitest";
import { readFiscalFile } from "./fiscal-file";

it("accepts PEM certificate and private key files, including encrypted PKCS8", async () => {
  for (const marker of [
    "PRIVATE KEY",
    "RSA PRIVATE KEY",
    "ENCRYPTED PRIVATE KEY",
  ]) {
    const text = `-----BEGIN ${marker}-----\ntest\n-----END ${marker}-----`;
    expect(
      await readFiscalFile(new File([text], "key.pem"), "privateKey"),
    ).toBe(text);
  }
  expect(
    await readFiscalFile(
      new File(["-----BEGIN CERTIFICATE-----"], "certificate.crt"),
      "certificate",
    ),
  ).toContain("CERTIFICATE");
});
it("rejects missing, oversized, empty or non-PEM files before upload", async () => {
  await expect(readFiscalFile(undefined, "certificate")).rejects.toThrow(
    "Elegí",
  );
  for (const file of [
    new File([], "empty.pem"),
    new File(["a".repeat(24001)], "large.pem"),
    new File(["%PDF"], "invoice.pdf"),
  ])
    await expect(readFiscalFile(file, "certificate")).rejects.toThrow();
});
