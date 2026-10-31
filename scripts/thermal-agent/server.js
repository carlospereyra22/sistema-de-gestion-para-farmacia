// Adapted from V21: same loopback endpoint and Windows RAW helper; no demo routes.
const http = require("node:http");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");
const { spawn } = require("node:child_process");
const { buildTicketV2 } = require("./escpos-v2");
const { validateTicket } = require("./validate-ticket");
const config = require("./config.json");
const journal = path.resolve(__dirname, "../../.cache/thermal-print-jobs");

function powershell(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      "powershell.exe",
      ["-NoProfile", "-ExecutionPolicy", "Bypass", ...args],
      { windowsHide: true },
    );
    let output = "",
      error = "";
    child.stdout.on("data", (chunk) => {
      output += chunk;
    });
    child.stderr.on("data", (chunk) => {
      error += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) =>
      code === 0
        ? resolve(output.trim())
        : reject(new Error(error.trim() || "Error de impresión RAW.")),
    );
  });
}
async function rawPrint(buffer) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "gestion-ticket-"));
  const file = path.join(directory, "ticket.bin");
  try {
    fs.writeFileSync(file, buffer);
    await powershell([
      "-File",
      path.join(__dirname, "raw-print.ps1"),
      "-PrinterName",
      config.printerName,
      "-FilePath",
      file,
    ]);
  } finally {
    fs.rmSync(file, { force: true });
    fs.rmdirSync(directory);
  }
}
function readJson(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size <= 1024 * 1024) chunks.push(chunk);
    });
    req.on("end", () => {
      try {
        if (size > 1024 * 1024) throw new Error("Ticket demasiado grande.");
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      } catch (error) {
        reject(error);
      }
    });
    req.on("error", reject);
  });
}
function createServer(
  print = rawPrint,
  printers = () =>
    powershell([
      "-Command",
      "Get-CimInstance Win32_Printer | Select-Object -ExpandProperty Name | ConvertTo-Json -Compress",
    ]),
  journalDirectory = journal,
) {
  return http.createServer(async (req, res) => {
    const origin = req.headers.origin;
    const allowed = !origin || config.allowedOrigins.includes(origin);
    const headers = {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      Vary: "Origin",
    };
    if (origin && allowed)
      Object.assign(headers, {
        "Access-Control-Allow-Origin": origin,
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Allow-Private-Network": "true",
      });
    const send = (status, data) => {
      res.writeHead(status, headers);
      res.end(JSON.stringify(data));
    };
    if (
      !allowed ||
      ![
        "127.0.0.1:" + req.socket.localPort,
        "localhost:" + req.socket.localPort,
      ].includes(req.headers.host)
    )
      return send(403, { ok: false, error: "Origen no permitido." });
    if (req.method === "OPTIONS") return send(204, {});
    if (req.method === "GET" && req.url === "/health")
      return send(200, {
        ok: true,
        protocol: "gestion-v21-minor-v1",
        printer: config.printerName,
      });
    if (req.method === "GET" && req.url === "/status") {
      try {
        const available = JSON.parse((await printers()) || "[]");
        return send(200, {
          ok: true,
          protocol: "gestion-v21-minor-v1",
          printer: config.printerName,
          installed: (Array.isArray(available)
            ? available
            : [available]
          ).includes(config.printerName),
        });
      } catch {
        return send(503, {
          ok: false,
          error: "No se pudo consultar la impresora en Windows.",
        });
      }
    }
    if (req.method !== "POST" || req.url !== "/print")
      return send(404, { ok: false, error: "Ruta no encontrada." });
    if (!req.headers["content-type"]?.startsWith("application/json"))
      return send(415, { ok: false, error: "Se requiere JSON." });
    let reserved = false;
    try {
      const body = await readJson(req);
      if (!/^[0-9a-f-]{36}$/i.test(body.requestId || ""))
        throw new Error("requestId inválido.");
      validateTicket(body.sale);
      const digest = crypto
        .createHash("sha256")
        .update(JSON.stringify(body.sale))
        .digest("hex");
      fs.mkdirSync(journalDirectory, { recursive: true });
      const jobPath = path.join(journalDirectory, body.requestId + ".json");
      if (fs.existsSync(jobPath)) {
        const prior = JSON.parse(fs.readFileSync(jobPath, "utf8"));
        if (prior.digest !== digest)
          return send(409, {
            ok: false,
            error: "Este intento corresponde a otro comprobante.",
          });
        if (prior.status === "sent")
          return send(200, { ok: true, duplicatePrevented: true });
        return send(409, {
          ok: false,
          uncertain: true,
          error:
            "El envío anterior quedó pendiente o sin confirmación. Revisá la cola y el papel antes de autorizar otra copia.",
        });
      }
      const available = JSON.parse((await printers()) || "[]");
      if (
        !(Array.isArray(available) ? available : [available]).includes(
          config.printerName,
        )
      )
        return send(422, {
          ok: false,
          error: `Impresora no encontrada: ${config.printerName}. Revisá su instalación en Windows.`,
        });
      const buffer = buildTicketV2(body.sale);
      // Exclusive reservation before sending: parallel clicks cannot print twice.
      try {
        fs.writeFileSync(
          jobPath,
          JSON.stringify({ digest, status: "pending" }),
          { flag: "wx" },
        );
      } catch (error) {
        if (error.code === "EEXIST")
          return send(409, {
            ok: false,
            uncertain: true,
            error: "El comprobante ya se está enviando.",
          });
        throw error;
      }
      reserved = true;
      await print(buffer);
      fs.writeFileSync(jobPath, JSON.stringify({ digest, status: "sent" }));
      return send(200, { ok: true, printer: config.printerName });
    } catch (error) {
      return send(500, {
        ok: false,
        uncertain: reserved,
        error: reserved
          ? "No se pudo confirmar el envío. Revisá la impresora y su cola antes de autorizar otra copia."
          : error.message,
      });
    }
  });
}
if (require.main === module)
  createServer().listen(config.port, "127.0.0.1", () =>
    console.log("Agente V21 listo en http://127.0.0.1:" + config.port),
  );
module.exports = { createServer };
