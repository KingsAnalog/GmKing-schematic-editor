import { defineConfig } from "vite";
import { copyFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

export default defineConfig({
  base: "./",
  server: { port: 8001 },
  build: {
    rollupOptions: {
      input: {
        editor: fileURLToPath(new URL("./index.html", import.meta.url)),
        manual: fileURLToPath(new URL("./manual.html", import.meta.url))
      }
    }
  },
  plugins: [{
    name: "distribution-licenses",
    async closeBundle() {
      for (const name of ["LICENSE", "THIRD_PARTY_LICENSES.txt"]) {
        await copyFile(
          fileURLToPath(new URL(`../../packages/schematic/dist/${name}`, import.meta.url)),
          fileURLToPath(new URL(`./dist/${name}`, import.meta.url))
        );
      }
    }
  }]
});
