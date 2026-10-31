"use strict";
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

function writeDurable(file, value, flags) {
  const fd = fs.openSync(file, flags, 0o600);
  try {
    fs.writeFileSync(fd, JSON.stringify(value));
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
}

function createJournal(root) {
  fs.mkdirSync(root, { recursive: true, mode: 0o700 });
  const target = (id) => {
    if (!/^[0-9a-f-]{36}$/i.test(id)) throw new Error("Invalid job ID");
    return path.join(root, `${id}.json`);
  };
  return {
    read(id) {
      try {
        const record = JSON.parse(fs.readFileSync(target(id), "utf8"));
        if (
          !["sending", "printed"].includes(record.state) ||
          !/^[0-9a-f]{64}$/.test(record.hash)
        )
          throw new Error("Corrupt print journal");
        return record;
      } catch (error) {
        if (error.code === "ENOENT") return null;
        throw error;
      }
    },
    reserve(id, hash) {
      // Exclusive and flushed BEFORE touching the spooler. Never delete uncertain records.
      writeDurable(target(id), { state: "sending", hash }, "wx");
    },
    printed(id, hash) {
      const file = target(id);
      const temporary = `${file}.${crypto.randomUUID()}.tmp`;
      writeDurable(temporary, { state: "printed", hash }, "wx");
      fs.renameSync(temporary, file);
    },
  };
}
module.exports = { createJournal };
