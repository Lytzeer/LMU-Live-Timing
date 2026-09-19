import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    allowedHosts: [".trycloudflare.com"],
    proxy: {
      "/ws": {
        target: "ws://localhost:8765",
        ws: true,
        configure: (proxy) => {
          proxy.on("error", (err) => {
            console.warn("[ws proxy] bridge unavailable:", err.message);
          });
        },
      },
    },
  },
});
