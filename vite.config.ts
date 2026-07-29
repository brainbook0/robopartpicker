import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import { cloudflare } from "@cloudflare/vite-plugin";
import path from "path";

const localStatePath = process.env.RPP_LOCAL_STATE_PATH;

export default defineConfig({
  server: {
    host: "127.0.0.1",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [react(), cloudflare({
    remoteBindings: false,
    ...(localStatePath ? { persistState: { path: localStatePath } } : {}),
    ...(localStatePath ? { config: (config) => ({ dev: { ...config.dev, enable_containers: false } }) } : {}),
  })],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    dedupe: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime", "@tanstack/react-query", "@tanstack/query-core"],
  },
});
