const fs = require("node:fs");
const path = require("node:path");

function resolveApiEntry(root, exists = fs.existsSync) {
  const candidates = [
    "apps/api/dist/main.js",
    "apps/api/dist/src/main.js",
  ].filter((file) => exists(path.join(root, file)));
  if (candidates.length !== 1) {
    throw new Error(
      "No hay una unica entrada compilada de API. Revisar dist antes de activar.",
    );
  }
  return path.join(root, candidates[0]);
}
module.exports = { resolveApiEntry };
if (require.main === module) {
  try {
    console.log(resolveApiEntry(path.resolve(__dirname, "../..")));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
