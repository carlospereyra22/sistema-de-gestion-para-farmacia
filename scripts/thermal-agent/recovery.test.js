const { test } = require("node:test");
const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const { createRecovery } = require("./recovery");
test("recovers a crashed child and an unresponsive child without sending jobs", async () => {
  const children = [];
  let kills = 0;
  const recovery = createRecovery({
    probe: async () => false,
    log: () => {},
    launch: () => {
      const child = new EventEmitter();
      child.kill = () => {
        kills++;
        child.emit("exit");
      };
      children.push(child);
      return child;
    },
  });
  await recovery.check();
  assert.equal(children.length, 1);
  children[0].emit("exit");
  await recovery.check();
  assert.equal(children.length, 2);
  await recovery.check();
  await recovery.check();
  await recovery.check();
  assert.equal(kills, 1);
  await recovery.check();
  assert.equal(children.length, 3);
  recovery.stop();
  await recovery.check();
  assert.equal(children.length, 3);
});
test("does not launch duplicates when healthy or checks overlap", async () => {
  let launches = 0;
  let healthy = true;
  const recovery = createRecovery({
    probe: async () => healthy,
    log: () => {},
    launch: () => {
      launches++;
      return new EventEmitter();
    },
  });
  await recovery.check();
  assert.equal(launches, 0);
  healthy = false;
  await Promise.all([recovery.check(), recovery.check()]);
  assert.equal(launches, 1);
});
