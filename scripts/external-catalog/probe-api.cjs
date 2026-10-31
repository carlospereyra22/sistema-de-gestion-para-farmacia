// Run after the API build. Enables preview only inside this short-lived process.
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "../..");
const line = fs
  .readFileSync(path.join(root, "apps/api/.env"), "utf8")
  .replace(/^\uFEFF/, "")
  .split(/\r?\n/)
  .find((line) => line.startsWith("DATABASE_URL="));
const url = new URL(line.slice(13).trim().replace(/^"|"$/g, ""));
if (
  !["127.0.0.1", "localhost"].includes(url.hostname) ||
  url.pathname !== "/gestion_dev"
)
  throw Error("Local only");
url.pathname = "/catalogo_juncos_external";
url.search = "";
process.env.EXTERNAL_CATALOG_DATABASE_URL = url.href;
process.env.EXTERNAL_CATALOG_PREVIEW = "true";
const organization = "00000000-0000-4000-8000-000000000001";
process.env.EXTERNAL_CATALOG_ORGANIZATION_ID = organization;
process.env.NODE_ENV = "test";
const candidates = [
  "apps/api/dist/src/catalog/external-catalog.service.js",
  "apps/api/dist/catalog/external-catalog.service.js",
].map((p) => path.join(root, p));
const { ExternalCatalogService } = require(
  candidates.find((p) => fs.existsSync(p)),
);
const service = new ExternalCatalogService();
(async () => {
  const result = await service.lookup("7500435211895", organization);
  if (!result.matched || result.automaticSelection || !result.requiresReview)
    throw Error("Lookup verification failed");
  if (
    !result.reference.some(
      (r) => r.source === "excel270" && r.name.includes("Pantene"),
    )
  )
    throw Error("Attached product missing");
  const absent = await service.lookup("12345670", organization);
  const algabo = await service.lookup("7791274197864", organization);
  if (
    !algabo.reference.some(
      (candidate) =>
        candidate.name.includes("BARRO") && candidate.name.includes("ALGABO"),
    )
  )
    throw Error("New catalogue product missing");
  if (absent.matched) throw Error("Unexpected fabricated code match");
  process.env.NODE_ENV = "production";
  let blocked = false;
  try {
    await service.lookup("7500435211895", organization);
  } catch {
    blocked = true;
  }
  if (!blocked) throw Error("Production not blocked");
  console.log(
    JSON.stringify({
      actualAttachedCodeFound: true,
      sourceCandidates: result.reference.length,
      nonexistentNotFabricated: true,
      algaboFound: true,
      productionBlocked: true,
    }),
  );
})()
  .catch(() => {
    console.error(
      "External catalog probe failed; inspect configuration without logging credentials.",
    );
    process.exitCode = 1;
  })
  .finally(() => service.onModuleDestroy());
