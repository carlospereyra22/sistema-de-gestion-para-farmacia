"use strict";
const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");
const os = require("node:os");
const net = require("node:net");
const crypto = require("node:crypto");
const { createJournal } = require("./journal");
const { deliver } = require("./delivery");

function createGateway(config, root) {
  const base = new URL(config.apiUrl);
  const isLocalTest =
    config.allowLocalTest === true &&
    ["127.0.0.1", "localhost"].includes(base.hostname);
  if (base.protocol !== "https:" && !isLocalTest)
    throw new Error("HTTPS required");
  if (base.username || base.password || base.search || base.hash)
    throw new Error("Invalid API URL");
  if (!/^[0-9a-f-]{36}\.[0-9a-f]{64}$/i.test(config.credential ?? ""))
    throw new Error("Invalid gateway credential");
  const journal = createJournal(path.join(root, "journal"));
  const logs = path.join(root, "gateway.log");
  let printers = [];
  const log = (event) => {
    if (fs.existsSync(logs) && fs.statSync(logs).size > 2 * 1024 * 1024) {
      fs.renameSync(logs, `${logs}.${Date.now()}.old`);
      const old = fs
        .readdirSync(root)
        .filter((file) => /^gateway\.log\.\d+\.old$/.test(file))
        .sort();
      for (const file of old.slice(0, -4)) fs.unlinkSync(path.join(root, file));
    }
    fs.appendFileSync(logs, `${new Date().toISOString()} ${event}\n`);
  };
  const api = async (route, data) => {
    const response = await fetch(
      `${base.href.replace(/\/$/, "")}/print-gateway/${route}`,
      {
        method: "POST",
        redirect: "error",
        signal: AbortSignal.timeout(15000),
        headers: {
          Authorization: `Bearer ${config.credential}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(data),
      },
    );
    if (!response.ok) throw new Error(`API ${response.status}`);
    return response.json();
  };
  const shell = (args) =>
    new Promise((resolve, reject) => {
      const process = spawn(
        "powershell.exe",
        [
          "-NoProfile",
          "-NonInteractive",
          "-ExecutionPolicy",
          "Bypass",
          ...args,
        ],
        { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] },
      );
      let output = "";
      process.stdout.on("data", (chunk) => {
        if (output.length < 100000) output += chunk;
      });
      process.stderr.resume();
      const timer = setTimeout(() => {
        process.kill();
        reject(new Error("Spool timeout; result uncertain"));
      }, 45000);
      process.on("error", (error) => {
        clearTimeout(timer);
        reject(error);
      });
      process.on("close", (code) => {
        clearTimeout(timer);
        code === 0 ? resolve(output.trim()) : reject(new Error("Spool error"));
      });
    });
  const findPrinter = (id) => {
    const printer = printers.find(
      (item) =>
        item.id === id &&
        item.transport === "windowsRaw" &&
        item.profileVersion === "V21_FINAL_DENSITY_4",
    );
    if (!printer || typeof printer.windowsPrinterName !== "string")
      throw new Error("Printer not configured");
    return printer;
  };
  const preflight = async (id) => {
    const printer = findPrinter(id);
    const listed = JSON.parse(
      await shell([
        "-Command",
        "Get-CimInstance Win32_Printer | Select-Object Name,WorkOffline,PrinterStatus | ConvertTo-Json -Compress",
      ]),
    );
    const found = (Array.isArray(listed) ? listed : [listed]).find(
      (item) => item.Name === printer.windowsPrinterName,
    );
    if (!found || found.WorkOffline || [6, 7].includes(found.PrinterStatus))
      throw new Error("Printer unavailable");
  };
  const print = async (id, bytes) => {
    const printer = findPrinter(id);
    const directory = fs.mkdtempSync(
      path.join(os.tmpdir(), "gestion-cloud-print-"),
    );
    const file = path.join(directory, "ticket.bin");
    try {
      fs.writeFileSync(file, bytes, { mode: 0o600 });
      await shell([
        "-File",
        path.join(__dirname, "raw-print.ps1"),
        "-PrinterName",
        printer.windowsPrinterName,
        "-FilePath",
        file,
      ]);
    } finally {
      fs.rmSync(file, { force: true });
      fs.rmdirSync(directory);
    }
  };
  const finish = (job, outcome) =>
    api(`jobs/${job.id}/finish`, { leaseId: job.leaseId, outcome });
  const heartbeat = async () => {
    printers = (await api("heartbeat", { version: "24.1.0" })).printers;
  };
  const cycle = async () => {
    const { job } = await api("jobs/claim", {});
    if (job) {
      log(`received ${job.id}`);
      await deliver(job, { journal, preflight, print, finish });
      log(`processed ${job.id}`);
    }
  };
  return { heartbeat, cycle, log };
}

async function main() {
  const root = path.resolve(process.argv[2] ?? __dirname);
  const config = JSON.parse(
    fs.readFileSync(path.join(root, "config.json"), "utf8"),
  );
  // OS named pipe prevents competing processes from this installation.
  const lock = net.createServer((socket) => socket.end());
  const key = crypto
    .createHash("sha256")
    .update(root.toLowerCase())
    .digest("hex")
    .slice(0, 16);
  await new Promise((resolve, reject) => {
    lock.once("error", reject);
    lock.listen(`\\\\.\\pipe\\gestion-cloud-print-${key}`, resolve);
  });
  const gateway = createGateway(config, root);
  gateway.log("started 24.1.0");
  let lastHeartbeat = 0;
  while (true) {
    try {
      if (Date.now() - lastHeartbeat > 15000) {
        await gateway.heartbeat();
        lastHeartbeat = Date.now();
      }
      await gateway.cycle();
      await new Promise((resolve) => setTimeout(resolve, 1500));
    } catch {
      gateway.log("connection_or_delivery_error; retrying");
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }
  }
}
if (require.main === module)
  main().catch(() => {
    process.exitCode = 1;
  });
module.exports = { createGateway };
