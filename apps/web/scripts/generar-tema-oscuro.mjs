// Genera src/tema-oscuro.css: la paleta del modo oscuro (SISTEMA-105).
//
// El modo oscuro no reescribe pantallas: redefine las variables de color
// (`--color-slate-200`, `--color-marca-535`, `--color-white`...) cuando <html>
// tiene la clase `dark`. Cada color claro se convierte con la misma regla, en
// OKLCH: se invierte la luminosidad (fondos claros -> oscuros, textos oscuros ->
// claros) conservando el tono, y los fondos tenues ganan un poco de saturación
// para que los estados (verde, ámbar, rojo) se sigan distinguiendo.
//
// Uso, desde apps/web, después de agregar un token en src/tema.css o empezar a
// usar una familia nueva de Tailwind:
//   node scripts/generar-tema-oscuro.mjs
import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";

const web = resolve(import.meta.dirname, "..");
const src = join(web, "src");
const pedir = createRequire(join(web, "package.json"));
const temaTailwind = readFileSync(
  pedir.resolve("tailwindcss/theme.css"),
  "utf8",
);
const temaPropio = readFileSync(join(src, "tema.css"), "utf8");

/**
 * Tono de las superficies oscuras: azul petróleo profundo (no gris ni negro),
 * de la misma familia que el verde azulado de la marca.
 */
const TONO_SUPERFICIE = 232;
const CROMA_SUPERFICIE = 0.026;

/** Valores elegidos a mano: superficies y velo de diálogos. */
const fijos = {
  // Tarjetas, menús y diálogos (en claro, blanco).
  white: "oklch(25.2% 0.03 232)",
  // Fondo de la aplicación, más oscuro que las tarjetas para que se despeguen.
  fondo: "oklch(20.6% 0.027 234)",
  // Velo detrás de los diálogos: siempre oscuro.
  velo: "oklch(10% 0.02 236)",
};

/** Luminosidad clara -> oscura (pares [claro, oscuro], decreciente). */
const curva = [
  [1, 0.252],
  [0.985, 0.27],
  [0.968, 0.29],
  [0.93, 0.335],
  [0.87, 0.395],
  [0.78, 0.485],
  [0.7, 0.565],
  [0.6, 0.665],
  [0.55, 0.71],
  [0.45, 0.795],
  [0.37, 0.86],
  [0.28, 0.915],
  [0.21, 0.95],
  [0.13, 0.972],
  [0, 0.99],
];
function luminosidadOscura(l) {
  for (let i = 1; i < curva.length; i++) {
    const [l0, o0] = curva[i - 1];
    const [l1, o1] = curva[i];
    if (l <= l0 && l >= l1) return o0 + ((l0 - l) / (l0 - l1)) * (o1 - o0);
  }
  return curva.at(-1)[1];
}

const lineal = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
function hexAOklch(hex) {
  let h = hex.slice(1);
  if (h.length === 3) h = [...h].map((x) => x + x).join("");
  const [r, g, b] = [0, 2, 4].map((i) =>
    lineal(parseInt(h.slice(i, i + 2), 16) / 255),
  );
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  const H = (Math.atan2(B, A) * 180) / Math.PI;
  return {
    L: 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    C: Math.hypot(A, B),
    H: H < 0 ? H + 360 : H,
  };
}
function dentroDeSrgb({ L, C, H }) {
  const a = C * Math.cos((H * Math.PI) / 180);
  const b = C * Math.sin((H * Math.PI) / 180);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const rgb = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
  return rgb.every((v) => v >= -0.0005 && v <= 1.0005);
}

/** Familias neutras: grises; no ganan saturación en oscuro. */
const neutras = new Set([
  "slate",
  "gray",
  "zinc",
  "neutral",
  "stone",
  "mist",
  "niebla",
]);

function oscuro({ L, C, H }, familia) {
  const L2 = luminosidadOscura(L);
  const neutra = neutras.has(familia);
  // Fondos tenues: más saturados, si no en oscuro quedan todos grises.
  let C2 = L > 0.9 && !neutra ? Math.min(C * 2.4, 0.08) : C;
  // Colores de botones, montos y estados: algo más vivos sobre fondo oscuro.
  if (!neutra && L >= 0.4 && L <= 0.75) C2 *= 1.2;
  // Grises que quedan como fondo o borde: toman el tono de las superficies.
  if (neutra && L2 < 0.5) {
    H = TONO_SUPERFICIE;
    C2 = Math.max(C2, CROMA_SUPERFICIE);
  }
  // Textos muy claros: un poco menos saturados, más cómodos de leer.
  if (L2 > 0.85) C2 *= 0.75;
  let lo = 0;
  let hi = C2;
  if (!dentroDeSrgb({ L: L2, C: C2, H })) {
    for (let i = 0; i < 24; i++) {
      const mid = (lo + hi) / 2;
      if (dentroDeSrgb({ L: L2, C: mid, H })) lo = mid;
      else hi = mid;
    }
    C2 = lo;
  }
  // Sin ceros de más, como los deja Prettier.
  const n = (valor, decimales) => String(+valor.toFixed(decimales));
  return `oklch(${n(L2 * 100, 1)}% ${n(C2, 3)} ${n(H, 1)})`;
}

// Familias de Tailwind que usa la web (clases o var(--color-...)).
const familias = new Set();
const recorrer = (dir) => {
  for (const nombre of readdirSync(dir)) {
    const ruta = join(dir, nombre);
    if (statSync(ruta).isDirectory()) recorrer(ruta);
    else if (/\.(tsx?|css)$/.test(nombre))
      for (const m of readFileSync(ruta, "utf8").matchAll(
        /(?:-|--color-)([a-z]+)-(?:50|[1-9]00|950)\b/g,
      ))
        familias.add(m[1]);
  }
};
recorrer(src);

const colores = []; // { nombre, claro, oscuro }
for (const m of temaTailwind.matchAll(
  /--color-([a-z]+)-(\d+): oklch\(([\d.]+)% ([\d.]+) ([\d.]+)\);/g,
)) {
  if (!familias.has(m[1])) continue;
  const o = { L: +m[3] / 100, C: +m[4], H: +m[5] };
  colores.push({
    nombre: `${m[1]}-${m[2]}`,
    claro: `oklch(${m[3]}% ${m[4]} ${m[5]})`,
    oscuro: oscuro(o, m[1]),
  });
}
const bloqueTheme = /@theme[^{]*\{([\s\S]*?)\n\}/.exec(temaPropio)?.[1] ?? "";
if (!bloqueTheme)
  throw new Error("No se encontró el bloque @theme en src/tema.css.");
for (const m of bloqueTheme.matchAll(
  /--color-([a-z0-9-]+):\s*(#[0-9a-fA-F]{3,6});/g,
))
  colores.push({
    nombre: m[1],
    claro: m[2].toLowerCase(),
    oscuro: fijos[m[1]] ?? oscuro(hexAOklch(m[2]), m[1].split("-")[0]),
  });
colores.push({ nombre: "white", claro: "#fff", oscuro: fijos.white });

const lineas = (campo) =>
  colores.map((c) => `    --color-${c.nombre}: ${c[campo]};`).join("\n");
const css = `/*
 * ARCHIVO GENERADO por scripts/generar-tema-oscuro.mjs: no editar a mano.
 * Paleta del modo oscuro (clase \`dark\` en <html>). Ver docs/MODO_OSCURO.md.
 */
@media screen {
  :root.dark {
${lineas("oscuro")}
  }

  /* Zonas que se ven siempre claras (vistas previas de papel, etiquetas). */
  :root.dark .tema-claro {
${lineas("claro")}
  }
}
`;
writeFileSync(join(src, "tema-oscuro.css"), css);
console.log(
  `tema-oscuro.css: ${colores.length} colores (${[...familias].filter((f) => colores.some((c) => c.nombre.startsWith(`${f}-`))).join(", ")}).`,
);
