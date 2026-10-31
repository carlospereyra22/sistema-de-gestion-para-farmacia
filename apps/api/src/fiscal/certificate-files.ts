import { BadRequestException } from "@nestjs/common";
import {
  createPrivateKey,
  generateKeyPair,
  X509Certificate,
} from "node:crypto";
import { promisify } from "node:util";
import * as forge from "node-forge";

export async function createCertificateRequest(
  name: string,
  holderCuit: string,
) {
  const keys = await promisify(generateKeyPair)("rsa", {
    modulusLength: 2048,
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });
  const csr = forge.pki.createCertificationRequest();
  csr.publicKey = forge.pki.publicKeyFromPem(keys.publicKey);
  // Forge's runtime expects a tag type; its declarations label this field Class.
  csr.setSubject([
    { name: "countryName", value: "AR" },
    {
      name: "organizationName",
      value: name,
      valueTagClass: Number(forge.asn1.Type.UTF8),
    },
    { name: "commonName", value: "SistemaGestionHomologacion" },
    { name: "serialNumber", value: `CUIT ${holderCuit}` },
  ]);
  csr.sign(
    forge.pki.privateKeyFromPem(keys.privateKey),
    forge.md.sha256.create(),
  );
  return {
    privateKey: keys.privateKey,
    csr: forge.pki.certificationRequestToPem(csr),
  };
}

export function inspectCertificate(
  certificatePem: string,
  privateKeyPem: string,
  holderCuit: string,
  passphrase?: string,
) {
  let certificate: X509Certificate;
  let privateKey: ReturnType<typeof createPrivateKey>;
  try {
    if (
      (certificatePem.match(/-----BEGIN CERTIFICATE-----/g) ?? []).length !==
        1 ||
      certificatePem.length > 24000
    )
      throw new Error();
    certificate = new X509Certificate(certificatePem);
    privateKey = createPrivateKey({
      key: privateKeyPem,
      format: "pem",
      passphrase,
    });
  } catch {
    throw new BadRequestException(
      "No pudimos leer los archivos. Usá un certificado PEM y su archivo .key; si la clave está protegida, revisá la contraseña del archivo.",
    );
  }
  if (certificate.ca)
    throw new BadRequestException(
      "Cargaste un certificado de autoridad certificante. Necesitamos el certificado de tu alias.",
    );
  if (
    privateKey.asymmetricKeyType !== "rsa" ||
    (privateKey.asymmetricKeyDetails?.modulusLength ?? 0) < 2048
  )
    throw new BadRequestException(
      "La clave debe ser RSA de al menos 2048 bits.",
    );
  if (!certificate.checkPrivateKey(privateKey))
    throw new BadRequestException(
      "El certificado y la clave privada no corresponden. Elegí los archivos del mismo trámite.",
    );
  const parsed = forge.pki.certificateFromPem(certificate.toString());
  if (
    parsed.subject.getField({ name: "serialNumber" })?.value !==
    `CUIT ${holderCuit}`
  )
    throw new BadRequestException(
      "El CUIT del titular no coincide con el certificado. Revisá el CUIT de quien ingresó a WSASS.",
    );
  const now = Date.now();
  if (
    Date.parse(certificate.validFrom) > now ||
    Date.parse(certificate.validTo) <= now
  )
    throw new BadRequestException(
      "El certificado está vencido o todavía no comenzó su vigencia.",
    );
  return {
    certificate: certificate.toString(),
    fingerprint: certificate.fingerprint256,
    expiresAt: new Date(certificate.validTo),
    privateKey: privateKey.export({ format: "pem", type: "pkcs8" }).toString(),
  };
}
