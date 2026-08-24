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
        background: "src/background/service-worker.ts",
        contentScript: "src/flow/content-script.ts",
        autoFlowFree: "src/flow/auto-flow-free.js"
      },
      output: {
        entryFileNames: (chunk) => {
          if (chunk.name === "background") return "background.js";
          if (chunk.name === "contentScript") return "content-script.js";
          if (chunk.name === "autoFlowFree") return "auto-flow-free.js";
          return "assets/[name]-[hash].js";
        }
      }
    }
  }
});
