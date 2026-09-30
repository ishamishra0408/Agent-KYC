import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Ports chosen to stay clear of the common defaults (5173 / 3001).
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5273,
    strictPort: true,
    proxy: {
      "/api": "http://127.0.0.1:3101",
      "/specimens": "http://127.0.0.1:3101",
    },
  },
});
