const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { verifyMigrations } = require("./check-migrations.cjs");
const directory = path.resolve(__dirname, "../../apps/api/prisma/migrations");
const migration_name = fs
  .readdirSync(directory)
  .find((name) => /^20/.test(name));
const checksum = crypto
  .createHash("sha256")
  .update(
    fs.readFileSync(path.join(directory, migration_name, "migration.sql")),
  )
  .digest("hex");
const row = {
  migration_name,
  checksum,
  finished_at: new Date(),
  rolled_back_at: null,
};
test("accepts unchanged applied migrations", () =>
  verifyMigrations([row], directory));
test("rejects changed, missing, incomplete and unsafe migrations", () => {
  for (const changed of [
    { checksum: "wrong" },
    { migration_name: "20990101_missing" },
    { finished_at: null },
    { migration_name: "../outside" },
  ]) {
    assert.throws(() => verifyMigrations([{ ...row, ...changed }], directory));
  }
});
test("ignores explicitly rolled back attempts", () =>
  verifyMigrations(
    [{ ...row, finished_at: null, rolled_back_at: new Date() }],
    directory,
  ));
