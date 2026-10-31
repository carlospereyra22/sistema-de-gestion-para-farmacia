import { BadRequestException } from "@nestjs/common";
export function assertCredentialTransport(
  secure: boolean,
  remoteAddress: string | undefined,
  forwardedProto: string | string[] | undefined,
  production: boolean,
) {
  const loopback = ["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(
    remoteAddress ?? "",
  );
  // Only trust the TLS indication from the local reverse proxy, never an arbitrary client.
  if (secure || (loopback && (forwardedProto === "https" || !production)))
    return;
  throw new BadRequestException(
    "La carga de claves requiere HTTPS. Para pruebas locales usá localhost.",
  );
}
