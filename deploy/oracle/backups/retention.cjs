const fs = require("node:fs");
const path = require("node:path");

function expiredNames(names, kind) {
  const pattern =
    kind === "daily"
      ? /^gestion-\d{4}-\d{2}-\d{2}\.dump$/
      : /^gestion-\d{4}-W\d{2}\.dump$/;
  return names
    .filter((name) => pattern.test(name))
    .sort()
    .reverse()
    .slice(kind === "daily" ? 7 : 4);
}

function prune(root) {
  for (const kind of ["daily", "weekly"]) {
    const directory = path.join(root, kind);
    const entries = fs.readdirSync(directory, { withFileTypes: true });
    const obsolete = expiredNames(
      entries.filter((entry) => entry.isFile()).map((entry) => entry.name),
      kind,
    );
    for (const name of obsolete) {
      fs.unlinkSync(path.join(directory, name));
      console.log(`Copia vencida eliminada: ${kind}/${name}`);
    }
  }
}

module.exports = { expiredNames, prune };
if (require.main === module) prune("/var/backups/gestion");
