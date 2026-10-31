"use strict";
const crypto = require("node:crypto");
const PROFILE = "V21_FINAL_DENSITY_4";

// Transport and network are separate. An ACK failure must NEVER become a spool retry.
async function deliver(job, { journal, preflight, print, finish }) {
  if (
    job.profileVersion !== PROFILE ||
    !/^[0-9a-f]{64}$/.test(job.payloadHash) ||
    typeof job.rawBase64 !== "string" ||
    job.rawBase64.length > 2800000
  )
    throw new Error("Invalid payload");
  const raw = Buffer.from(job.rawBase64, "base64");
  if (crypto.createHash("sha256").update(raw).digest("hex") !== job.payloadHash)
    throw new Error("Payload hash mismatch");
  const prior = journal.read(job.id);
  if (prior) {
    if (prior.hash !== job.payloadHash)
      throw new Error("Journal payload mismatch");
    return finish(job, prior.state === "printed" ? "printed" : "uncertain");
  }
  try {
    await preflight(job.printerId);
  } catch {
    return finish(job, "safe_failure");
  }
  journal.reserve(job.id, job.payloadHash);
  try {
    await print(job.printerId, raw);
    journal.printed(job.id, job.payloadHash);
  } catch {
    return finish(job, "uncertain");
  }
  return finish(job, "printed");
}
module.exports = { deliver, PROFILE };
