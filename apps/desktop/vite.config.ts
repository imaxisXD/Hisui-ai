import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const THIS_DIR = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react(), tailwindcss()],
  root: resolve(THIS_DIR, "src/renderer"),
  resolve: {
    alias: {
      "@": resolve(THIS_DIR, "src/renderer")
    }
  },
  build: {
    outDir: resolve(THIS_DIR, "dist/renderer"),
    emptyOutDir: true
  },
  server: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: true
  }
});
