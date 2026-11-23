import { defineConfig } from "vite";
import { copyFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);

export default defineConfig({
  base: "./",
  server: { port: 8001 },
  resolve: {
    alias: [{ find: /^@joint\/core$/, replacement: require.resolve("@joint/core/joint.mjs") }]
  },
  build: {
    rollupOptions: {
      input: {
        editor: fileURLToPath(new URL("./index.html", import.meta.url)),
        manual: fileURLToPath(new URL("./manual.html", import.meta.url))
      },
      output: {
        onlyExplicitManualChunks: true,
        manualChunks(id) {
          // Keep Rollup's CommonJS helper with JointJS so the vendor chunk
          // never imports the editor entry or inherits its content hash.
          if (id === "\0commonjsHelpers.js" || id.replaceAll("\\", "/").includes("/node_modules/@joint/core/")) {
            return "jointjs";
          }
        }
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
