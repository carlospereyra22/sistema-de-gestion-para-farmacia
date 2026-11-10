// Prueba del modo sin internet en un navegador real (SISTEMA-72).
//
// Simula una PC nueva: Edge con un perfil vacío entra con conexión a la versión
// compilada, espera las precargas, APAGA el servidor y recorre cada pantalla
// sin conexión, carga cada parte que se baja aparte (PDF, Excel, Reportes) y
// cierra la caja (el cierre tiene que quedar en la bandeja de la PC).
// Obligatoria antes de publicar en preprod un cambio del modo sin internet.
//
// Requisitos: API local prendida (puerto 3000, base gestion_dev) y la web
// compilada como preprod, desde PowerShell (Git Bash rompe la ruta):
//   $env:VITE_API_URL = "/api/v1"; pnpm --filter @gestion/web build
// Uso, desde la raíz:  node scripts/probar-sin-conexion.mjs [puerto]
// Resultado y capturas: .cache/prueba-sin-conexion/
import { spawn, execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { randomBytes } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";

const raiz = resolve(import.meta.dirname, "..");
const web = join(raiz, "apps/web");
const salida = join(raiz, ".cache/prueba-sin-conexion");
mkdirSync(salida, { recursive: true });
const puerto = Number(process.argv[2] ?? "4174");
const base = `http://localhost:${puerto}`;
const usuario = await usuarioDePrueba();

/**
 * Usuario de prueba sólo en la base local de desarrollo, con los mismos roles
 * y sucursales que el último usuario que entró. La clave se renueva cada vez.
 */
async function usuarioDePrueba() {
  const api = join(raiz, "apps/api");
  for (const linea of readFileSync(join(api, ".env"), "utf8").split("\n")) {
    const m = /^([A-Z_]+)=(.*)$/.exec(linea.trim());
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, "");
  }
  const url = new URL(process.env.DATABASE_URL ?? "invalid:");
  if (
    !["localhost", "127.0.0.1"].includes(url.hostname) ||
    url.pathname !== "/gestion_dev"
  )
    throw new Error("Sólo contra la base local gestion_dev.");
  const pedir = createRequire(join(api, "package.json"));
  const { PrismaClient } = pedir("@prisma/client");
  const { hash } = pedir("@node-rs/argon2");
  const p = new PrismaClient();
  const email = "prueba-sin-conexion@local.test";
  const clave = `PruebaSinConexion-${randomBytes(6).toString("hex")}`;
  try {
    const sesion = await p.authSession.findFirst({
      where: { revokedAt: null, user: { active: true, email: { not: email } } },
      orderBy: { createdAt: "desc" },
    });
    if (!sesion)
      throw new Error("Entrá una vez a la app local para tomar su farmacia.");
    const membresia = await p.userOrganization.findFirst({
      where: { userId: sesion.userId },
      include: { roles: true },
    });
    const sucursales = await p.userBranch.findMany({
      where: { userId: sesion.userId },
    });
    const user = await p.user.upsert({
      where: { email },
      update: {
        passwordHash: await hash(clave),
        active: true,
        mustChangePassword: false,
      },
      create: { email, passwordHash: await hash(clave) },
    });
    await p.userOrganization.upsert({
      where: {
        userId_organizationId: {
          userId: user.id,
          organizationId: membresia.organizationId,
        },
      },
      update: { active: true },
      create: {
        userId: user.id,
        organizationId: membresia.organizationId,
        displayName: "Prueba sin conexión",
        roles: { create: membresia.roles.map((r) => ({ roleId: r.roleId })) },
      },
    });
    for (const s of sucursales)
      await p.userBranch.upsert({
        where: { userId_branchId: { userId: user.id, branchId: s.branchId } },
        update: {},
        create: { userId: user.id, branchId: s.branchId },
      });
    return { email, clave };
  } finally {
    await p.$disconnect();
  }
}
const perfil = join(salida, `perfil-edge-${Date.now()}`);
const capturas = join(salida, "capturas");
mkdirSync(capturas, { recursive: true });
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
const informe = [];
const anotar = (ok, texto) => {
  informe.push(`${ok ? "OK   " : "FALLA"} ${texto}`);
  console.log(`${ok ? "OK   " : "FALLA"} ${texto}`);
};

function levantarPreview() {
  const proc = spawn(
    process.execPath,
    [
      join(web, "node_modules/vite/bin/vite.js"),
      "preview",
      "--port",
      String(puerto),
      "--strictPort",
    ],
    { cwd: web, stdio: "ignore", windowsHide: true },
  );
  return proc;
}
async function esperarHttp(url, intentos = 60) {
  for (let i = 0; i < intentos; i++) {
    try {
      if ((await fetch(url)).ok) return;
    } catch {}
    await dormir(500);
  }
  throw new Error(`No respondió ${url}`);
}
function cortar(proc) {
  try {
    execFileSync("taskkill", ["/PID", String(proc.pid), "/T", "/F"], {
      stdio: "ignore",
    });
  } catch {}
}
/** Apaga lo que escuche en el puerto (el preview puede quedar en otro proceso). */
function apagarPuerto(p) {
  try {
    execFileSync(
      "powershell.exe",
      [
        "-NoProfile",
        "-Command",
        `Get-NetTCPConnection -LocalPort ${p} -State Listen -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }`,
      ],
      { stdio: "ignore" },
    );
  } catch {}
}

// --- CDP mínimo ---
let ws;
let siguiente = 0;
const pendientes = new Map();
function enviar(method, params = {}) {
  const id = ++siguiente;
  ws.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve, reject) =>
    pendientes.set(id, { resolve, reject }),
  );
}
async function evaluar(expresion) {
  const r = await enviar("Runtime.evaluate", {
    expression: expresion,
    awaitPromise: true,
    returnByValue: true,
  });
  if (r.exceptionDetails)
    throw new Error(
      r.exceptionDetails.exception?.description ?? "error en página",
    );
  return r.result.value;
}
async function esperar(expresion, ms = 20000) {
  const fin = Date.now() + ms;
  while (Date.now() < fin) {
    try {
      if (await evaluar(expresion)) return true;
    } catch {}
    await dormir(300);
  }
  return false;
}
async function ir(url) {
  await enviar("Page.navigate", { url });
  await esperar("document.readyState === 'complete'", 20000);
}
async function capturar(nombre) {
  const { data } = await enviar("Page.captureScreenshot", { format: "png" });
  writeFileSync(join(capturas, `${nombre}.png`), Buffer.from(data, "base64"));
}

const preview = levantarPreview();
await esperarHttp(`${base}/`);
const edge = spawn(
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  [
    "--headless=new",
    `--remote-debugging-port=${puerto + 5000}`,
    `--user-data-dir=${perfil}`,
    "--no-first-run",
    "--window-size=1600,1000",
    "about:blank",
  ],
  { stdio: "ignore" },
);
let objetivo;
for (let i = 0; i < 60 && !objetivo; i++) {
  try {
    const lista = await (
      await fetch(`http://127.0.0.1:${puerto + 5000}/json`)
    ).json();
    objetivo = lista.find((t) => t.type === "page");
  } catch {}
  if (!objetivo) await dormir(500);
}
ws = new WebSocket(objetivo.webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
const pedidos = new Map();
const fallidos = [];
ws.onmessage = (m) => {
  const d = JSON.parse(m.data);
  if (d.method === "Network.requestWillBeSent")
    pedidos.set(
      d.params.requestId,
      `${d.params.request.method} ${d.params.request.url}`,
    );
  if (
    d.method === "Network.loadingFailed" &&
    pedidos.get(d.params.requestId)?.includes("/api/v1/")
  )
    fallidos.push(pedidos.get(d.params.requestId));
  if (d.id && pendientes.has(d.id)) {
    pendientes.get(d.id)[d.error ? "reject" : "resolve"](d.error ?? d.result);
    pendientes.delete(d.id);
  }
};
await enviar("Page.enable");
await enviar("Network.enable");
// Anota cada consulta a la API que hace la app (para cruzarla con la copia local).
await enviar("Page.addScriptToEvaluateOnNewDocument", {
  source: `(() => {
    window.__consultas = [];
    const original = window.fetch.bind(window);
    window.fetch = (input, init) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      const metodo = (init && init.method) || (typeof input === 'object' && 'method' in input ? input.method : 'GET');
      if (url.includes('/api/v1/') && metodo.toUpperCase() === 'GET') {
        const u = new URL(url, location.href);
        window.__consultas.push(u.pathname.slice(u.pathname.indexOf('/api/v1') + 7) + u.search);
      }
      return original(input, init);
    };
  })()`,
});
await enviar("Runtime.enable");
await enviar("Emulation.setDeviceMetricsOverride", {
  width: 1600,
  height: 1000,
  deviceScaleFactor: 1,
  mobile: false,
});

try {
  // 1. Primera visita con conexión: entrar.
  await ir(`${base}/`);
  await esperar("!!document.querySelector('input[type=email]')");
  await dormir(2000);
  console.log(
    "inputs:",
    await evaluar(
      "[...document.querySelectorAll('input')].map(i => i.type + ':' + i.autocomplete + ':' + (i.form ? 'form' : 'sinform')).join(' | ')",
    ),
  );
  await evaluar(`(() => {
    const poner = (el, v) => {
      const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      set.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true }));
    };
    poner(document.querySelector('input[type=email]'), ${JSON.stringify(usuario.email)});
    poner(document.querySelector('input[autocomplete=current-password]'), ${JSON.stringify(usuario.clave)});
    document.querySelector('input[type=email]').form.requestSubmit();
  })()`);
  const entro = await esperar(
    "!document.querySelector('input[type=email]') && document.body.innerText.includes('Ventas')",
    30000,
  );
  anotar(entro, "Entrar con conexión (primera visita, perfil nuevo)");
  if (!entro) {
    const salud = await evaluar(
      "fetch('/api/v1/health').then(r => r.status + ' ' + r.headers.get('content-type')).catch(e => 'error ' + e.message)",
    );
    console.log("health desde la página:", salud);
    console.log(
      "valores:",
      await evaluar(
        "[...document.querySelectorAll('input')].map(i => i.type + '=' + (i.value ? 'lleno' : 'vacío')).join(' | ')",
      ),
    );
    console.log(
      "texto:",
      (await evaluar("document.body.innerText"))
        .split("Correo electrónico")[1]
        ?.slice(0, 400),
    );
    await capturar("00-login-fallido");
    throw new Error("no entró");
  }
  // Pasar por Ventas como haría la cajera y dejar que precargue todo.
  await ir(`${base}/?pagina=ventas`);
  await dormir(25000);
  const controla = await evaluar("!!navigator.serviceWorker.controller");
  anotar(
    controla,
    "El service worker controla la pestaña sin recargar (primera visita)",
  );
  await capturar("00-con-conexion");

  // Lista de archivos de la app, leída con conexión.
  const archivosApp = await evaluar(
    `fetch('/sw.js').then(r => r.text()).then(t => [...t.matchAll(/url:"(assets\\/[^"]+\\.(?:js|mjs))"/g)].map(m => m[1]))`,
  );
  anotar(
    archivosApp.length > 5,
    `El service worker lista ${archivosApp.length} archivos de la app`,
  );

  // 2. Sin internet: se apaga el servidor (app y API).
  cortar(preview);
  apagarPuerto(puerto);
  await dormir(2500);
  let caido = false;
  try {
    await fetch(`${base}/`);
  } catch {
    caido = true;
  }
  anotar(caido, "Servidor apagado: la PC queda sin conexión");
  if (!caido)
    throw new Error("no se pudo cortar la conexión: la prueba no vale");

  // 3. Partes que se bajan aparte, en la misma pestaña (lo que falló en preprod).
  const aparte = await evaluar(`(async () => {
    const urls = ${JSON.stringify(archivosApp)};
    const resultado = {};
    for (const u of urls) {
      if (/^assets\\/(index|workbox)/.test(u)) continue;
      try {
        if (u.includes('worker')) { const x = await fetch('/' + u); resultado[u] = x.ok; }
        else { await import('/' + u); resultado[u] = true; }
      } catch (e) { resultado[u] = String(e.message || e).slice(0, 80); }
    }
    return resultado;
  })()`);
  for (const [u, ok] of Object.entries(aparte))
    anotar(
      ok === true,
      `Sin conexión, carga ${u}${ok === true ? "" : " → " + ok}`,
    );

  // 4. Cada pantalla, recargando sin conexión.
  // Reportes es sólo con conexión (decisión del 09/11/2026). Cuentas por pagar
  // funciona sin conexión desde SISTEMA-73.
  const pantallas = [
    "inicio",
    "ventas",
    "caja",
    "cuentas",
    "clientes",
    "compras",
    "transferencias",
    "inventario",
    "productos",
    "precios",
    "proveedores",
    "pagar",
  ];
  for (const [i, p] of pantallas.entries()) {
    fallidos.length = 0;
    await ir(`${base}/?pagina=${p}`);
    await dormir(5000);
    // Sin conexión toda consulta falla en la red; las que tienen copia en la
    // PC la usan. Se listan para cruzar con las que no tienen copia.
    const faltan = await evaluar(`(async () => {
      const claves = await new Promise((ok) => {
        const r = indexedDB.open('gestion-sin-conexion');
        r.onsuccess = () => {
          const t = r.result.transaction('datos', 'readonly').objectStore('datos').getAllKeys();
          t.onsuccess = () => ok(t.result.map(String));
          t.onerror = () => ok([]);
        };
        r.onerror = () => ok([]);
      });
      const pedidas = [...new Set(window.__consultas || [])];
      return pedidas.filter((c) => !claves.some((k) => k.endsWith('|' + c)));
    })()`);
    const sinCopia = [
      ...new Set(
        faltan.map((f) => f.replace(/[0-9a-f]{8}-[0-9a-f-]{27}/g, ":id")),
      ),
    ];
    if (sinCopia.length)
      console.log(`   sin copia en ${p}: ${sinCopia.join(" , ")}`);
    if (sinCopia.length)
      informe.push(`   sin copia en ${p}: ${sinCopia.join(" , ")}`);
    const texto = await evaluar("document.body.innerText");
    const problemas = [
      "Failed to fetch",
      "sin datos guardados",
      "Algo salió mal",
      "No se pudo cargar",
      "No se pudieron cargar",
      "dynamically imported module",
    ].filter((t) => texto.includes(t));
    const vacia = texto.trim().length < 80;
    anotar(
      !vacia && problemas.length === 0,
      `Sin conexión, pantalla ${p}${problemas.length ? " → " + problemas.join(", ") : ""}${vacia ? " → vacía" : ""}`,
    );
    if (p === "caja") {
      // Escribe el efectivo contado igual que una persona (tecla por tecla).
      const hayCaja = await evaluar(
        `(() => { const i = document.querySelector('form[aria-label="Cerrar caja"] input'); if (!i) return false; i.focus(); i.select && i.select(); return true; })()`,
      );
      if (!hayCaja)
        anotar(
          false,
          "Sin conexión, cerrar caja: no hay caja abierta para probar",
        );
      else {
        for (const tecla of "100")
          await enviar("Input.insertText", { text: tecla });
        await dormir(500);
        const paso1 = await evaluar(`(() => {
          const form = document.querySelector('form[aria-label="Cerrar caja"]');
          const boton = [...form.querySelectorAll('button')].find((b) => /confirmar cierre/i.test(b.textContent));
          if (!boton || boton.disabled) return 'botón deshabilitado con importe escrito';
          // Hay diferencia: motivo.
          const motivo = form.querySelector('textarea, input:not([inputmode]):not([type=hidden])');
          return 'ok';
        })()`);
        // Motivo de la diferencia (si hace falta).
        (await evaluar(`(() => {
          const form = document.querySelector('form[aria-label="Cerrar caja"]');
          const motivo = [...form.querySelectorAll('input, textarea')].find((el) => /motivo|corresponde|diferencia/i.test(el.placeholder || '') && !el.disabled);
          if (motivo) { motivo.focus(); }
          return !!motivo;
        })()`)) &&
          (await enviar("Input.insertText", { text: "prueba sin conexion" }));
        await evaluar(
          `[...document.querySelectorAll('form[aria-label="Cerrar caja"] button')].find((b) => /confirmar cierre/i.test(b.textContent)).click()`,
        );
        await dormir(800);
        // Ventana de confirmación: el botón que confirma.
        await evaluar(
          `(() => { const b = [...document.querySelectorAll('[role=dialog] button, dialog button')].find((x) => /cerrar con diferencia|^\\s*cerrar caja|confirmar/i.test(x.textContent) && !/cancelar|volver/i.test(x.textContent)); if (b) b.click(); return !!b; })()`,
        );
        await dormir(1500);
        const guardado = await evaluar(`(async () => {
          const claves = await new Promise((ok) => { const r = indexedDB.open('gestion-sin-conexion'); r.onsuccess = () => { const t = r.result.transaction('datos','readonly').objectStore('datos').getAll(); t.onsuccess = () => ok(t.result); }; });
          return claves.some((v) => v && v.operacion === 'CAJA' && v.cuerpo && v.cuerpo.tipo === 'CIERRE');
        })()`);
        await capturar("03b-caja-cierre");
        anotar(
          paso1 === "ok" && guardado,
          `Sin conexión, cerrar caja: ${paso1 !== "ok" ? paso1 : guardado ? "el cierre quedó guardado en la PC" : "no se guardó el cierre"}`,
        );
      }
    }
    await capturar(`${String(i + 1).padStart(2, "0")}-${p}`);
  }
} catch (e) {
  anotar(false, `Error del recorrido: ${e.message}`);
} finally {
  writeFileSync(join(salida, "informe.txt"), informe.join("\n"));
  try {
    ws.close();
  } catch {}
  cortar(edge);
  cortar(preview);
  await dormir(1000);
  try {
    rmSync(perfil, { recursive: true, force: true });
  } catch {}
  process.exit(0);
}
