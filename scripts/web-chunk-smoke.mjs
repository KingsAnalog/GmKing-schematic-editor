import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { build } from "vite";

const root = fileURLToPath(new URL("../apps/web/", import.meta.url));
const dist = new URL("../apps/web/dist/", import.meta.url);
const html = await readFile(new URL("index.html", dist), "utf8");
const appPath = html.match(/<script type="module"[^>]*src="\.\/([^"]+)"/)?.[1];
const libraryPath = html.match(/<link rel="modulepreload"[^>]*href="\.\/(assets\/jointjs-[^"]+\.js)"/)?.[1];
assert(appPath && libraryPath, "Editor and JointJS preload must use relative fingerprinted filenames");
assert(!html.includes("vendor/mathjax/"), "MathJax must stay off the startup request path");

const original = await readFile(new URL(libraryPath, dist), "utf8");
const result = await build({
  root,
  logLevel: "error",
  build: { write: false },
  plugins: [{
    name: "test-editor-only-change",
    enforce: "pre",
    transform(source, id) {
      if (id.replaceAll("\\", "/").endsWith("/apps/web/main.ts")) {
        return source + '\ndocument.documentElement.dataset.chunkSmoke = "entry-only-change";';
      }
    }
  }]
});

const chunks = [result].flat().flatMap(build => build.output).filter(file => file.type === "chunk");
const app = chunks.find(chunk => chunk.name === "editor");
const library = chunks.find(chunk => chunk.name === "jointjs");
assert(app && library);
assert.notEqual(app.fileName, appPath);
assert.equal(library.fileName, libraryPath);
assert.equal(library.code, original, "An entry-only change must not mutate the JointJS bytes");
assert(app.imports.includes(library.fileName));
assert.deepEqual(library.imports, [], "JointJS must not import the editor or its helpers");
assert.deepEqual(library.dynamicImports, []);
console.log("JointJS relative preload, dependency direction and content hash passed across two builds.");
