import path from "node:path";
import { fileURLToPath } from "node:url";

import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

const directoryName = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    // Modo sin internet (SISTEMA-62): el service worker guarda la app en la PC
    // para que abra sin conexión. Nunca guarda respuestas de la API: los datos
    // sin conexión los maneja la copia local (lib/cache-local.ts). Una versión
    // nueva se ofrece con aviso y nunca recarga sola en medio de una venta.
    VitePWA({
      registerType: "prompt",
      injectRegister: false,
      // Se conserva public/manifest.webmanifest (app instalable, 29/10/2026).
      manifest: false,
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,png,ico,woff,woff2,webmanifest}"],
        // El instalador del agente de impresión (34 MB) se baja aparte.
        globIgnores: ["**/downloads/**"],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        navigateFallback: "/index.html",
        navigateFallbackDenylist: [
          /^\/api\//,
          /^\/preprod\//,
          /^\/downloads\//,
        ],
        cleanupOutdatedCaches: true,
      },
      devOptions: { enabled: false },
    }),
  ],
  // These lazy imports must be optimized at startup: discovering them on the
  // first file selection reloads the page and destroys the in-memory review.
  optimizeDeps: {
    include: ["pdfjs-dist", "tesseract.js"],
  },
  resolve: {
    alias: {
      "@": path.resolve(directoryName, "./src"),
    },
  },
  // Para probar la versión compilada contra la API local: `vite preview` con
  // VITE_API_URL=/api/v1, igual que en Netlify.
  preview: {
    proxy: { "/api/v1": "http://localhost:3000" },
  },
});
