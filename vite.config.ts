import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// base "./" so the built files work from any folder on the university web server.
export default defineConfig({
  base: "./",
  plugins: [react()],
  test: { environment: "node", include: ["tests/**/*.test.ts"] },
} as never);
