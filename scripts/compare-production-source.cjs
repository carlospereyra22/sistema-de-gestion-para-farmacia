// Read-only comparison. Only public source/configuration paths; never env files,
// credentials, customer data, backups or node_modules.
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { spawnSync } = require("node:child_process");
const root = path.resolve(__dirname, "..");
const sourcePaths = [
  "apps/api/src",
  "apps/api/prisma/migrations",
  "apps/api/prisma/schema.prisma",
  "apps/web/src",
  "packages/contracts/src",
  "package.json",
  "pnpm-lock.yaml",
  "apps/api/package.json",
  "apps/web/package.json",
];
const remoteScript = `import os,sys,json,hashlib
root=os.path.dirname(os.path.dirname(sys.argv[1]))
paths=json.loads(sys.stdin.readline())
result={}
for entry in paths:
 p=os.path.join(root,entry)
 files=[p] if os.path.isfile(p) else [os.path.join(d,f) for d,_,names in os.walk(p) for f in names] if os.path.isdir(p) else []
 for file in files:
  with open(file,encoding='utf-8-sig') as stream: content=stream.read().replace('\\r\\n','\\n')
  result[os.path.relpath(file,root).replace(os.sep,'/')]=hashlib.sha256(content.encode()).hexdigest()
print(json.dumps(result))
`;
const encodedScript = Buffer.from(remoteScript).toString("base64");
const remote = spawnSync(
  "ssh",
  [
    "-o",
    "BatchMode=yes",
    "-o",
    "StrictHostKeyChecking=yes",
    "-i",
    path.join(process.env.USERPROFILE, ".ssh", "oracle-gestion.key"),
    "ubuntu@163.176.241.51",
    `python3 -c "import base64;exec(base64.b64decode('${encodedScript}'))" "$(systemctl show gestion-api -p WorkingDirectory --value)"`,
  ],
  { input: JSON.stringify(sourcePaths) + "\n", encoding: "utf8" },
);
if (remote.status !== 0) {
  console.error("No se pudo comparar el código remoto.");
  process.exit(1);
}
const published = JSON.parse(remote.stdout);
const missing = [],
  changed = [];
let identical = 0;
for (const [file, hash] of Object.entries(published)) {
  const local = path.join(root, file);
  if (!fs.existsSync(local)) {
    missing.push(file);
    continue;
  }
  const content = fs
    .readFileSync(local, "utf8")
    .replace(/^\uFEFF/, "")
    .replace(/\r\n/g, "\n");
  if (crypto.createHash("sha256").update(content).digest("hex") === hash)
    identical++;
  else changed.push(file);
}
console.log(
  JSON.stringify(
    {
      compared: Object.keys(published).length,
      identical,
      missingLocally: missing,
      differentLocally: changed,
      frontendSourceIncluded: Object.keys(published).some((p) =>
        p.startsWith("apps/web/src/"),
      ),
    },
    null,
    2,
  ),
);

async function compareWebSnapshot() {
  const snapshot = path.join(
    root,
    ".cache/production/20261003-203658-4a189596/source/apps/web",
  );
  const origin = "https://sistema-de-gestion22.netlify.app";
  const response = await fetch(origin, { signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error("No se pudo consultar la web publicada.");
  const html = await response.text();
  const assets = [
    ...html.matchAll(/(?:src|href)="(\/assets\/[^"/]+\.(?:js|css))"/g),
  ].map((match) => match[1]);
  if (!assets.some((asset) => asset.endsWith(".js")))
    throw new Error("No se encontró el bundle publicado.");
  for (const asset of assets) {
    const file = path.join(snapshot, "dist", asset.slice(1));
    if (!fs.existsSync(file))
      throw new Error(
        "La web publicada no corresponde a la copia de publicación disponible.",
      );
    const remoteAsset = await fetch(origin + asset, {
      signal: AbortSignal.timeout(15000),
    });
    if (
      !remoteAsset.ok ||
      !Buffer.from(await remoteAsset.arrayBuffer()).equals(
        fs.readFileSync(file),
      )
    )
      throw new Error("El bundle publicado difiere de la copia guardada.");
  }
  const missing = [],
    changed = [];
  let compared = 0;
  function walk(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const source = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        walk(source);
        continue;
      }
      const relative = path.relative(snapshot, source);
      const local = path.join(root, "apps/web", relative);
      compared++;
      if (!fs.existsSync(local)) missing.push(relative);
      else if (
        fs.readFileSync(source, "utf8").replace(/\r\n/g, "\n") !==
        fs.readFileSync(local, "utf8").replace(/\r\n/g, "\n")
      )
        changed.push(relative);
    }
  }
  walk(path.join(snapshot, "src"));
  console.log(
    JSON.stringify(
      {
        webSnapshotMatchesPublishedAssets: true,
        compared,
        missingLocally: missing,
        differentLocally: changed,
      },
      null,
      2,
    ),
  );
}
compareWebSnapshot().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
