import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    tailwindcss(),
    react(),
    VitePWA({
      strategies: "injectManifest",
      registerType: "autoUpdate",
      injectRegister: "auto",
      injectManifest: {
        swSrc: path.resolve(__dirname, "src/sw.js"), // <-- source SW
        swDest: "sw.js", // <-- output SW in build root
      },
      manifest: {
        name: "LostLink",
        short_name: "LostLink",
        description: "LostLink web app",
        theme_color: "#0f172a",
        background_color: "#0f172a",
        display: "standalone",
        start_url: "/",
        icons: [
          { src: "/pwa-192x192.png", sizes: "192x192", type: "image/png" },
          { src: "/pwa-512x512.png", sizes: "512x512", type: "image/png" },
          { src: "/pwa-512x512.png", sizes: "512x512", type: "image/png", purpose: "any maskable" },
        ],
      },
      includeAssets: ["offline.html", "cat.jpeg"],
      devOptions: { enabled: true },
    }),
  ],
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
});