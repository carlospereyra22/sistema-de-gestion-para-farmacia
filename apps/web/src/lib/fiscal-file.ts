export async function readFiscalFile(
  file: File | undefined,
  kind: "certificate" | "privateKey",
): Promise<string> {
  if (!file)
    throw new Error(
      kind === "certificate"
        ? "Elegí el certificado que obtuviste en ARCA."
        : "Elegí la clave privada .key del mismo trámite.",
    );
  const limit = kind === "certificate" ? 24000 : 16000;
  if (!file.size || file.size > limit)
    throw new Error(
      `El archivo debe tener contenido y pesar menos de ${limit / 1000} KB.`,
    );
  const text = await file.text();
  const marker =
    kind === "certificate"
      ? /-----BEGIN CERTIFICATE-----/
      : /-----BEGIN (?:RSA |ENCRYPTED )?PRIVATE KEY-----/;
  if (!marker.test(text))
    throw new Error(
      "Necesitamos archivos en formato PEM, no PDF, foto ni PFX. Revisá la ayuda de este paso.",
    );
  return text;
}
