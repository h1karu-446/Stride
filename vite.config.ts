import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    // Agent worktrees live inside the repo; don't pick up their copies of the tests.
    exclude: ["**/node_modules/**", "**/dist/**", ".claude/**", ".codex/**"],
  },
});
