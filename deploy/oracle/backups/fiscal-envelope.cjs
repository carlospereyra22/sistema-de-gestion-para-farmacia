const {
  randomBytes,
  scryptSync,
  createCipheriv,
  createDecipheriv,
} = require("node:crypto");
const CONTEXT = Buffer.from("gestion-portable-fiscal-backup:v1");
const LIMIT = 192 * 1024 * 1024;
function key(password, salt) {
  if (
    typeof password !== "string" ||
    password.length < 16 ||
    password.length > 1024
  )
    throw new Error("Password length invalid");
  return scryptSync(password, salt, 32, {
    N: 65536,
    r: 8,
    p: 1,
    maxmem: 128 * 1024 * 1024,
  });
}
function seal(plain, password) {
  if (!Buffer.isBuffer(plain) || plain.length > LIMIT)
    throw new Error("Backup size invalid");
  const salt = randomBytes(32),
    nonce = randomBytes(12);
  const secret = key(password, salt);
  try {
    const cipher = createCipheriv("aes-256-gcm", secret, nonce, {
      authTagLength: 16,
    });
    cipher.setAAD(CONTEXT);
    const payload = Buffer.concat([cipher.update(plain), cipher.final()]);
    return Buffer.from(
      JSON.stringify({
        v: 1,
        salt: salt.toString("base64"),
        nonce: nonce.toString("base64"),
        tag: cipher.getAuthTag().toString("base64"),
        payload: payload.toString("base64"),
      }),
    );
  } finally {
    secret.fill(0);
  }
}
function open(encoded, password) {
  if (encoded.length > LIMIT * 1.4) throw new Error("Backup size invalid");
  const data = JSON.parse(encoded.toString("utf8"));
  if (data.v !== 1) throw new Error("Backup version invalid");
  const fields = {};
  for (const name of ["salt", "nonce", "tag", "payload"]) {
    if (
      typeof data[name] !== "string" ||
      !/^[A-Za-z0-9+/]*={0,2}$/.test(data[name])
    )
      throw new Error("Backup encoding invalid");
    fields[name] = Buffer.from(data[name], "base64");
  }
  if (
    fields.salt.length !== 32 ||
    fields.nonce.length !== 12 ||
    fields.tag.length !== 16 ||
    fields.payload.length > LIMIT
  )
    throw new Error("Backup fields invalid");
  const secret = key(password, fields.salt);
  try {
    const decipher = createDecipheriv("aes-256-gcm", secret, fields.nonce, {
      authTagLength: 16,
    });
    decipher.setAAD(CONTEXT);
    decipher.setAuthTag(fields.tag);
    // Nothing leaves this function before authentication succeeds.
    return Buffer.concat([decipher.update(fields.payload), decipher.final()]);
  } finally {
    secret.fill(0);
  }
}
module.exports = { seal, open };
