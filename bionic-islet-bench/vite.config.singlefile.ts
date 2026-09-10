import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

/**
 * The single-file preview build.
 *
 * Produces one JavaScript file and one stylesheet with no code splitting and
 * no separate worker, so `scripts/build-single.mjs` can assemble them into a
 * self-contained page. VITE_INLINE_HOST makes the store run the simulation
 * host on the main thread rather than spawning a worker, because a page served
 * under a strict content policy may not be allowed to spawn one at all.
 *
 * The production build in `vite.config.ts` is unaffected and still uses the
 * worker.
 */
export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: "./",
  define: {
    "import.meta.env.VITE_INLINE_HOST": JSON.stringify("1"),
  },
  // Emit escapes rather than raw bytes for anything outside ASCII. The
  // assembled page carries no charset declaration of its own, because the page
  // embedding it supplies one, and a raw UTF-8 middle dot decoded as Latin-1
  // renders as two wrong characters.
  esbuild: { charset: "ascii" },
  build: {
    target: "es2022",
    outDir: "dist-single",
    cssCodeSplit: false,
    // Everything in one chunk, so there is one file to inline.
    assetsInlineLimit: Number.MAX_SAFE_INTEGER,
    rollupOptions: {
      output: {
        inlineDynamicImports: true,
        manualChunks: undefined,
        entryFileNames: "bench.js",
        assetFileNames: "bench[extname]",
      },
    },
  },
});
