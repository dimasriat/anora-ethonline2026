import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  /* One .env at the repo root serves both apps; without this vite reads only
     apps/web/.env and VITE_* variables silently vanish from the bundle. */
  envDir: "../..",
  build: { outDir: "dist" },
  server: {
    host: "127.0.0.1",
    port: 5173,
    /* Halaman memanggil /api/* relatif. Di produksi API yang menyajikan
       bundelnya, jadi origin-nya sama; saat dev harus diteruskan sendiri. */
    proxy: { "/api": "http://127.0.0.1:3333" },
  },
});
