// Root-only recovery test. Restores ONLY a newly generated, isolated database.
// No API/ARCA calls, no live configuration writes, no secrets in output/files.
const { spawnSync } = require("node:child_process");
const {
  randomUUID,
  createDecipheriv,
  createPrivateKey,
  X509Certificate,
} = require("node:crypto");
const MAX = 192 * 1024 * 1024;
const pg = "/usr/lib/postgresql/18/bin/";
let stage = "input",
  created = false;
const database = "gestion_fiscalcheck_" + randomUUID().replaceAll("-", "");
function run(program, args, input) {
  const result = spawnSync(
    "/usr/sbin/runuser",
    ["-u", "postgres", "--", pg + program, ...args],
    {
      input,
      encoding: "utf8",
      maxBuffer: MAX,
      timeout: 120000,
      env: {
        PATH: "/usr/bin:/bin",
        PGHOST: "/var/run/postgresql",
        PGPORT: "5432",
        PGUSER: "postgres",
      },
    },
  );
  if (result.status !== 0) throw new Error("Recovery command failed");
  return result.stdout;
}
async function main() {
  if (process.getuid() !== 0) throw new Error("Root required");
  const chunks = [];
  let size = 0;
  for await (const chunk of process.stdin) {
    size += chunk.length;
    if (size > MAX) throw new Error("Input too large");
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks);
  const data = JSON.parse(raw.toString("utf8"));
  if (
    data.v !== 1 ||
    !/^[a-f0-9]{64}$/i.test(data.vaultKey) ||
    typeof data.database !== "string"
  )
    throw new Error("Invalid package");
  const dump = Buffer.from(data.database, "base64");
  if (dump.subarray(0, 5).toString() !== "PGDMP")
    throw new Error("Invalid dump");
  stage = "create-isolated-database";
  run("createdb", ["--template=template0", database]);
  created = true;
  run("psql", [
    "-X",
    "-v",
    "ON_ERROR_STOP=1",
    "-d",
    "postgres",
    "-c",
    `REVOKE CONNECT ON DATABASE ${database} FROM PUBLIC`,
  ]);
  stage = "restore-database";
  run(
    "pg_restore",
    ["--dbname=" + database, "--no-owner", "--no-acl", "--single-transaction"],
    dump,
  );
  stage = "verify-fiscal-credentials";
  const records = JSON.parse(
    run("psql", [
      "-XAt",
      "-v",
      "ON_ERROR_STOP=1",
      "-d",
      database,
      "-c",
      `SELECT COALESCE(json_agg(json_build_object('org',"organizationId",'environment',environment,'encrypted',"encryptedPrivateKey",'certificate',certificate)), '[]'::json) FROM "FiscalCredential" WHERE environment='PRODUCTION' AND certificate IS NOT NULL`,
    ]),
  );
  if (!records.length)
    throw new Error("No production credential in restored backup");
  for (const record of records) {
    const envelope = JSON.parse(record.encrypted);
    if (envelope.v !== 1 || envelope.provider !== "AES256_GCM")
      throw new Error("Invalid vault");
    const cipher = createDecipheriv(
      "aes-256-gcm",
      Buffer.from(data.vaultKey, "hex"),
      Buffer.from(envelope.nonce, "base64"),
      { authTagLength: 16 },
    );
    cipher.setAAD(
      Buffer.from(`fiscal-credential:v1:${record.environment}:${record.org}`),
    );
    cipher.setAuthTag(Buffer.from(envelope.tag, "base64"));
    const pem = Buffer.concat([
      cipher.update(Buffer.from(envelope.payload, "base64")),
      cipher.final(),
    ]);
    try {
      if (
        !new X509Certificate(record.certificate).checkPrivateKey(
          createPrivateKey(pem),
        )
      )
        throw new Error("Certificate mismatch");
    } finally {
      pem.fill(0);
    }
  }
  const organizations = Number(
    run("psql", [
      "-XAt",
      "-d",
      database,
      "-c",
      'SELECT count(*) FROM "Organization"',
    ]),
  );
  dump.fill(0);
  raw.fill(0);
  stage = "remove-isolated-database";
  run("dropdb", [database]);
  created = false;
  process.stdout.write(
    JSON.stringify({
      restored: true,
      credentialsRecovered: records.length,
      organizations,
      checkedAt: new Date().toISOString(),
    }),
  );
}
main()
  .catch(() => {
    process.stderr.write("Recovery verification failed at " + stage + "\n");
    process.exitCode = 1;
  })
  .finally(() => {
    if (created && /^gestion_fiscalcheck_[a-f0-9]{32}$/.test(database)) {
      try {
        run("dropdb", ["--if-exists", database]);
      } catch {
        process.stderr.write(
          "Isolated recovery database requires cleanup: " + database + "\n",
        );
      }
    }
  });
