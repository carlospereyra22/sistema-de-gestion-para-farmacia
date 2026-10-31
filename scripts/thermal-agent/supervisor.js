// Per-user supervisor: restart only our child; never replay print jobs.
const net = require("node:net");
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { spawn } = require("node:child_process");
const { createRecovery } = require("./recovery");
const config = require("./config.json");
const root = path.resolve(__dirname, "../..");
const logs = path.join(root, ".cache/thermal-agent");
const fingerprint = crypto
  .createHash("sha256")
  .update(root.toLowerCase())
  .digest("hex")
  .slice(0, 12);
function probe() {
  return new Promise((resolve) => {
    const request = http.get(
      `http://127.0.0.1:${config.port}/health`,
      (response) => {
        let text = "";
        response.on("data", (chunk) => {
          if (text.length < 10000) text += chunk;
        });
        response.on("end", () => {
          try {
            resolve(JSON.parse(text).protocol === "gestion-v21-minor-v1");
          } catch {
            resolve(false);
          }
        });
      },
    );
    request.setTimeout(2000, () => request.destroy());
    request.on("error", () => resolve(false));
  });
}
function startSupervisor() {
  fs.mkdirSync(logs, { recursive: true });
  const lock = net.createServer((socket) => socket.end());
  let timer;
  const log = (text) =>
    fs.appendFileSync(
      path.join(logs, "supervisor.log"),
      `${new Date().toISOString()} ${text}\n`,
    );
  const launch = () => {
    let child;
    const output = fs.openSync(path.join(logs, "managed-agent.log"), "a");
    const errors = fs.openSync(path.join(logs, "managed-agent.err.log"), "a");
    try {
      child = spawn(process.execPath, [path.join(__dirname, "server.js")], {
        cwd: __dirname,
        windowsHide: true,
        stdio: ["ignore", output, errors],
      });
    } finally {
      fs.closeSync(output);
      fs.closeSync(errors);
    }
    log(`Componente iniciado PID ${child.pid}`);
    return child;
  };
  const recovery = createRecovery({ probe, launch, log });
  const stop = () => {
    clearInterval(timer);
    recovery.stop();
    lock.close();
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
  lock.on("error", (error) => {
    if (error.code === "EADDRINUSE") process.exit(0);
    else throw error;
  });
  lock.listen(`\\\\.\\pipe\\gestion-thermal-${fingerprint}`, () => {
    log("Supervisor listo.");
    void recovery.check();
    timer = setInterval(() => void recovery.check(), 5000);
  });
}
if (require.main === module) startSupervisor();
module.exports = { startSupervisor };
