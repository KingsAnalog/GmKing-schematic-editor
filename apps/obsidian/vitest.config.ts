import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: {
      obsidian: fileURLToPath(new URL("./tests/obsidianMock.ts", import.meta.url)),
      "@codemirror/language": fileURLToPath(new URL("./tests/codemirrorLanguageMock.ts", import.meta.url)),
      "@codemirror/commands": fileURLToPath(new URL("../../node_modules/@codemirror/commands/dist/index.js", import.meta.url)),
      "@codemirror/state": fileURLToPath(new URL("../../node_modules/@codemirror/state/dist/index.js", import.meta.url)),
      "@codemirror/view": fileURLToPath(new URL("../../node_modules/@codemirror/view/dist/index.js", import.meta.url))
    }
  },
  test: {
    environment: "jsdom",
    include: ["tests/**/*.test.ts"]
  }
});
