const { spawnSync } = require("node:child_process");
const { join, resolve } = require("node:path");
const fs = require("node:fs");
const { randomUUID, createHash } = require("node:crypto");
const { seal, open } = require("./fiscal-envelope.cjs");
const maxBuffer = 192 * 1024 * 1024;
const destination = join(
  process.env.LOCALAPPDATA,
  "FarmaciaJuncos",
  "RespaldosCifrados",
);
const sshArgs = [
  "-o",
  "BatchMode=yes",
  "-o",
  "StrictHostKeyChecking=yes",
  "-o",
  "ConnectTimeout=15",
  "-i",
  join(process.env.USERPROFILE, ".ssh", "oracle-gestion.key"),
  "ubuntu@163.176.241.51",
];
let stage = "input";
function ssh(command, input) {
  const result = spawnSync("ssh.exe", [...sshArgs, command], {
    input,
    maxBuffer,
    timeout: 180000,
    windowsHide: true,
  });
  if (result.status !== 0) throw new Error("SSH operation failed");
  return result.stdout;
}
async function main() {
  if (
    process.platform !== "win32" ||
    !fs.statSync(destination).isDirectory() ||
    fs.lstatSync(destination).isSymbolicLink()
  )
    throw new Error("Private backup directory required");
  let input = "";
  for await (const chunk of process.stdin) {
    input += chunk;
    if (input.length > 8192) throw new Error("Input too long");
  }
  const { password, verifyFile } = JSON.parse(input);
  input = "";
  let filename;
  if (verifyFile) {
    filename = resolve(verifyFile);
    if (
      !filename.startsWith(resolve(destination) + "\\") ||
      !filename.endsWith(".gbackup")
    )
      throw new Error("Backup path invalid");
  } else {
    // Validate password before reading any private material from the server.
    seal(Buffer.alloc(0), password);
    stage = "server-backup";
    ssh("sudo -n systemctl start gestion-backup.service");
    const dump = ssh("cat /var/backups/gestion/latest.dump");
    if (dump.subarray(0, 5).toString() !== "PGDMP")
      throw new Error("Invalid dump");
    const vault = ssh("sudo -n /usr/bin/cat /etc/gestion-fiscal/vault.key");
    const vaultKey = vault.toString("utf8").trim();
    if (!/^[a-f0-9]{64}$/i.test(vaultKey)) throw new Error("Invalid vault key");
    const plain = Buffer.from(
      JSON.stringify({
        v: 1,
        createdAt: new Date().toISOString(),
        database: dump.toString("base64"),
        vaultKey,
      }),
    );
    stage = "encrypt-local";
    const encrypted = seal(plain, password);
    filename = join(
      destination,
      "gestion-fiscal-" +
        new Date().toISOString().replaceAll(/[:.]/g, "-") +
        "-" +
        randomUUID().slice(0, 8) +
        ".gbackup",
    );
    fs.writeFileSync(filename, encrypted, { flag: "wx", mode: 0o600 });
    plain.fill(0);
    dump.fill(0);
    vault.fill(0);
  }
  stage = "authenticate-local-file";
  const saved = fs.readFileSync(filename);
  const recovered = open(saved, password);
  stage = "restore-offsite-copy";
  let checked;
  try {
    checked = JSON.parse(
      ssh(
        "sudo -n /usr/local/bin/node /usr/local/lib/gestion-backup/verify-fiscal-recovery.cjs",
        recovered,
      ),
    );
  } finally {
    recovered.fill(0);
  }
  if (!checked.restored || checked.credentialsRecovered < 1)
    throw new Error("Recovery not verified");
  const report = {
    file: filename,
    sha256: createHash("sha256").update(saved).digest("hex"),
    ...checked,
  };
  const receipt = fs.existsSync(filename + ".verified.json")
    ? filename + ".verified-" + randomUUID() + ".json"
    : filename + ".verified.json";
  fs.writeFileSync(receipt, JSON.stringify(report, null, 2), {
    flag: "wx",
    mode: 0o600,
  });
  process.stdout.write(JSON.stringify(report));
}
main().catch(() => {
  process.stderr.write(
    "Respaldo no completado en etapa: " +
      stage +
      ". No se modificaron ventas ni certificados.\n",
  );
  process.exitCode = 1;
});
