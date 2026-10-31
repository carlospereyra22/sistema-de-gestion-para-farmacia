const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");
const { createJournal } = require("./journal");
const { deliver, PROFILE } = require("./delivery");

const raw = Buffer.from([31, 27, 31, 19, 20, 4, 27, 64]);
const job = {
  id: crypto.randomUUID(),
  printerId: crypto.randomUUID(),
  profileVersion: PROFILE,
  rawBase64: raw.toString("base64"),
  payloadHash: crypto.createHash("sha256").update(raw).digest("hex"),
};
function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "gestion-print-test-"));
  t.after(() => {
    for (const file of fs.readdirSync(root))
      fs.unlinkSync(path.join(root, file));
    fs.rmdirSync(root);
  });
  return { root, journal: createJournal(root) };
}
test("a lost ACK and gateway restart do not send RAW a second time", async (t) => {
  const { root, journal } = fixture(t);
  let sends = 0;
  const deps = {
    journal,
    preflight: async () => {},
    print: async (_id, bytes) => {
      assert.deepEqual(bytes, raw);
      sends++;
    },
    finish: async () => {
      throw new Error("network offline");
    },
  };
  await assert.rejects(deliver(job, deps));
  let outcome;
  await deliver(job, {
    ...deps,
    journal: createJournal(root),
    finish: async (_job, value) => {
      outcome = value;
    },
  });
  assert.equal(sends, 1);
  assert.equal(outcome, "printed");
});
test("crash after durable reservation requires review, not reprinting", async (t) => {
  const { journal } = fixture(t);
  journal.reserve(job.id, job.payloadHash);
  let outcome;
  await deliver(job, {
    journal,
    preflight: async () => assert.fail(),
    print: async () => assert.fail(),
    finish: async (_job, value) => {
      outcome = value;
    },
  });
  assert.equal(outcome, "uncertain");
});
test("unavailable printer before send can retry safely", async (t) => {
  const { journal } = fixture(t);
  let outcome;
  await deliver(job, {
    journal,
    preflight: async () => {
      throw new Error("offline");
    },
    print: async () => assert.fail(),
    finish: async (_job, value) => {
      outcome = value;
    },
  });
  assert.equal(journal.read(job.id), null);
  assert.equal(outcome, "safe_failure");
});
test("partial transport failure remains uncertain across restarts", async (t) => {
  const { root, journal } = fixture(t);
  const outcomes = [];
  await deliver(job, {
    journal,
    preflight: async () => {},
    print: async () => {
      throw new Error("partial write");
    },
    finish: async (_job, value) => outcomes.push(value),
  });
  await deliver(job, {
    journal: createJournal(root),
    preflight: async () => assert.fail(),
    print: async () => assert.fail(),
    finish: async (_job, value) => outcomes.push(value),
  });
  assert.deepEqual(outcomes, ["uncertain", "uncertain"]);
});
test("corrupt journal is not treated as a new job", async (t) => {
  const { root, journal } = fixture(t);
  fs.writeFileSync(path.join(root, `${job.id}.json`), "invalid");
  await assert.rejects(
    deliver(job, {
      journal,
      preflight: async () => assert.fail(),
      print: async () => assert.fail(),
      finish: async () => assert.fail(),
    }),
  );
});
test("modified payload and unsupported profiles never reach the printer", async (t) => {
  const { journal } = fixture(t);
  const deps = {
    journal,
    preflight: async () => assert.fail(),
    print: async () => assert.fail(),
    finish: async () => assert.fail(),
  };
  await assert.rejects(
    deliver(
      { ...job, rawBase64: Buffer.from("changed").toString("base64") },
      deps,
    ),
  );
  await assert.rejects(deliver({ ...job, profileVersion: "OTHER" }, deps));
});
test("inability to persist reservation blocks RAW send", async (t) => {
  const { journal } = fixture(t);
  await assert.rejects(
    deliver(job, {
      journal: {
        ...journal,
        reserve: () => {
          throw new Error("disk full");
        },
      },
      preflight: async () => {},
      print: async () => assert.fail(),
      finish: async () => assert.fail(),
    }),
  );
});
