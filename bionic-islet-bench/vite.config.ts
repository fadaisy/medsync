import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: "./",
  worker: { format: "es" },
  build: {
    target: "es2022",
    // The bench is one screen. Splitting the engine out of the shell keeps the
    // first paint small while the worker chunk loads alongside it.
    rollupOptions: {
      output: {
        manualChunks: {
          motion: ["framer-motion"],
        },
      },
    },
  },
});
