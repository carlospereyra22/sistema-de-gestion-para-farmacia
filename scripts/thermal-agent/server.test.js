const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { randomUUID } = require("node:crypto");
const { createServer } = require("./server");
const sale = {
  kind: "sale",
  id: "real-sale",
  number: "1234ABCD",
  date: "2026-09-13T15:00:00Z",
  store: { name: "Test" },
  branch: "Test",
  customer: "Test",
  items: [],
  totalMinor: "100",
  payments: [],
};
async function withAgent(
  run,
  print = async () => {},
  printers = async () => '["Xprinter XP-80"]',
) {
  const directory = fs.mkdtempSync(
    path.join(os.tmpdir(), "gestion-agent-test-"),
  );
  const server = createServer(print, printers, directory);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const post = (requestId, origin = "http://localhost:5173", payload = sale) =>
    fetch(`http://127.0.0.1:${server.address().port}/print`, {
      method: "POST",
      headers: {
        Host: "127.0.0.1:17890",
        Origin: origin,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ requestId, sale: payload }),
    });
  try {
    await run(post, directory);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    for (const name of fs.readdirSync(directory))
      fs.unlinkSync(path.join(directory, name));
    fs.rmdirSync(directory);
  }
}
test("simultaneous/repeated requests spool once, reject wrong origins", async () => {
  let calls = 0;
  await withAgent(
    async (post) => {
      const id = randomUUID();
      await Promise.all([post(id), post(id)]);
      assert.equal(calls, 1);
      const repeated = await post(id);
      assert.equal((await repeated.json()).duplicatePrevented, true);
      assert.equal(
        (await post(randomUUID(), "https://untrusted.example")).status,
        403,
      );
      assert.equal(calls, 1);
    },
    async () => {
      calls++;
      await new Promise((resolve) => setTimeout(resolve, 20));
    },
  );
});
test("missing printer never reserves a job or claims success", async () => {
  await withAgent(
    async (post, directory) => {
      assert.equal((await post(randomUUID())).status, 422);
      assert.deepEqual(fs.readdirSync(directory), []);
    },
    async () => {
      throw Error("Must not print");
    },
    async () => "[]",
  );
});
test("uncertain spool failure cannot print again on retry", async () => {
  let calls = 0;
  await withAgent(
    async (post) => {
      const id = randomUUID();
      assert.equal((await post(id)).status, 500);
      assert.equal((await post(id)).status, 409);
      assert.equal(calls, 1);
    },
    async () => {
      calls++;
      throw Error("Partial write");
    },
  );
});
