const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

function verifyMigrations(rows, directory) {
  for (const row of rows) {
    if (row.rolled_back_at) continue;
    if (!row.finished_at)
      throw new Error(
        "Hay una migracion fallida o incompleta. Requiere revision.",
      );
    if (!/^[a-zA-Z0-9_-]+$/.test(row.migration_name))
      throw new Error("Nombre de migracion invalido.");
    const file = path.join(directory, row.migration_name, "migration.sql");
    if (!fs.existsSync(file))
      throw new Error(`Falta migracion aplicada: ${row.migration_name}`);
    const hash = crypto
      .createHash("sha256")
      .update(fs.readFileSync(file))
      .digest("hex");
    if (hash !== row.checksum)
      throw new Error(`Migracion aplicada modificada: ${row.migration_name}`);
  }
}
module.exports = { verifyMigrations };
if (require.main === module) {
  const database = new URL(process.env.DATABASE_URL || "invalid:");
  if (
    database.pathname !== "/gestion_prod" ||
    !["127.0.0.1", "localhost"].includes(database.hostname)
  ) {
    console.error("El entorno no apunta a la base de produccion esperada.");
    process.exit(1);
  }
  const {
    PrismaClient,
  } = require("../../apps/api/node_modules/@prisma/client");
  const prisma = new PrismaClient();
  (async () => {
    const rows = await prisma.$queryRawUnsafe(
      'SELECT migration_name, checksum, finished_at, rolled_back_at FROM "_prisma_migrations"',
    );
    verifyMigrations(
      rows,
      path.resolve(__dirname, "../../apps/api/prisma/migrations"),
    );
    console.log("Migraciones historicas verificadas.");
  })()
    .catch(() => {
      console.error(
        "No se pudo validar el historial de migraciones. Revisar antes de publicar.",
      );
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
}
