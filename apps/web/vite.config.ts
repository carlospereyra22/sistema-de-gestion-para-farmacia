import path from "node:path";
import { fileURLToPath } from "node:url";

import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

const directoryName = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react(), tailwindcss()],
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
});
