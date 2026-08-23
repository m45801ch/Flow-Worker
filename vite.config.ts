import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import packageJson from "./package.json" with { type: "json" };

export default defineConfig({
  define: { __APP_VERSION__: JSON.stringify(packageJson.version) },
  plugins: [react()],
  build: {
    rollupOptions: {
      input: {
        sidepanel: "sidepanel.html",
        options: "options.html",
        background: "src/background/service-worker.ts"
      },
      output: {
        entryFileNames: (chunk) => chunk.name === "background" ? "background.js" : "assets/[name]-[hash].js"
      }
    }
  }
});
