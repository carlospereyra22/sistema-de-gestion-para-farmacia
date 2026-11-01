const fs = require("node:fs");
const path = require("node:path");
const { verifyMigrations } = require("./check-migrations.cjs");

if (require.main === module) {
  const database = new URL(process.env.DATABASE_URL || "invalid:");
  if (
    database.pathname !== "/gestion_preprod" ||
    !["127.0.0.1", "localhost"].includes(database.hostname)
  ) {
    console.error("El entorno no apunta a la base de preproduccion esperada.");
    process.exit(1);
  }
  const { PrismaClient } = require("../../apps/api/node_modules/@prisma/client");
  const prisma = new PrismaClient();
  (async () => {
    const rows = await prisma.$queryRawUnsafe(
      'SELECT migration_name, checksum, finished_at, rolled_back_at FROM "_prisma_migrations"',
    );
    verifyMigrations(
      rows,
      path.resolve(__dirname, "../../apps/api/prisma/migrations"),
    );
    console.log("Migraciones historicas de preproduccion verificadas.");
  })()
    .catch(() => {
      console.error(
        "No se pudo validar el historial de preproduccion. Revisar antes de publicar.",
      );
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
}
