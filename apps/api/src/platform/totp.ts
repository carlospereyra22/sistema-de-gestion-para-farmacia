import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const PERIOD_SECONDS = 30;
const DIGITS = 6;
const ISSUER = "Farmatec";

function base32Encode(bytes: Buffer): string {
  let bits = "";
  for (const byte of bytes) bits += byte.toString(2).padStart(8, "0");
  let text = "";
  for (let index = 0; index < bits.length; index += 5)
    text += BASE32[parseInt(bits.slice(index, index + 5).padEnd(5, "0"), 2)];
  return text;
}

function base32Decode(text: string): Buffer {
  let bits = "";
  for (const character of text)
    bits += BASE32.indexOf(character).toString(2).padStart(5, "0");
  const bytes: number[] = [];
  for (let index = 0; index + 8 <= bits.length; index += 8)
    bytes.push(parseInt(bits.slice(index, index + 8), 2));
  return Buffer.from(bytes);
}

export function generateTotpSecret(): string {
  return base32Encode(randomBytes(20));
}

/** Código de 6 dígitos de un paso de 30 segundos (RFC 6238 con HMAC-SHA1). */
export function totpCode(secret: string, step: number): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const digest = createHmac("sha1", base32Decode(secret))
    .update(counter)
    .digest();
  const offset = digest.readUInt8(digest.length - 1) & 0x0f;
  const value = digest.readUInt32BE(offset) & 0x7fffffff;
  return String(value % 10 ** DIGITS).padStart(DIGITS, "0");
}

export function totpStep(now: Date): number {
  return Math.floor(now.getTime() / 1000 / PERIOD_SECONDS);
}

/** Devuelve el paso que coincide, tolerando un paso de desfase de reloj. */
export function matchTotpStep(
  secret: string,
  code: string,
  now: Date,
): number | undefined {
  const current = totpStep(now);
  const received = Buffer.from(code);
  return [current - 1, current, current + 1].find((step) => {
    const expected = Buffer.from(totpCode(secret, step));
    return (
      expected.length === received.length && timingSafeEqual(expected, received)
    );
  });
}

export function totpUri(email: string, secret: string): string {
  const label = encodeURIComponent(`${ISSUER}:${email}`);
  return `otpauth://totp/${label}?secret=${secret}&issuer=${ISSUER}&algorithm=SHA1&digits=${DIGITS}&period=${PERIOD_SECONDS}`;
}
