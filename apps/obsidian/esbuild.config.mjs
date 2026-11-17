import { builtinModules } from "node:module";
import { copyFile, mkdir, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import * as esbuild from "esbuild";

const directory = dirname(fileURLToPath(import.meta.url));
const outputDirectory = resolve(directory, "dist");
const external = [
  "obsidian",
  "electron",
  "@codemirror/*",
  "@lezer/*",
  ...builtinModules,
  ...builtinModules.map((module) => `node:${module}`)
];

export async function buildPlugin({
  write = true,
  production = true
} = {}) {
  // Obsidian installs only main.js, manifest.json and styles.css from a release.
  // Keep our license and dependency source/attribution notices in main.js too.
  const notices = await Promise.all([
    readFile(resolve(directory, "../../LICENSE"), "utf8"),
    readFile(resolve(directory, "THIRD_PARTY_LICENSES.md"), "utf8")
  ]);
  const result = await esbuild.build({
    absWorkingDir: directory,
    entryPoints: {
      main: "src/main.ts",
      styles: "src/styles.css"
    },
    outdir: outputDirectory,
    entryNames: "[name]",
    assetNames: "[name]",
    bundle: true,
    splitting: false,
    format: "cjs",
    platform: "browser",
    target: "es2022",
    external,
    metafile: true,
    minify: production,
    sourcemap: production ? false : "inline",
    legalComments: "eof",
    banner: { js: `/*!\n${notices.join("\n\n").replaceAll("*/", "* / ")}\n*/` },
    logLevel: "silent",
    write
  });
  if (write) {
    await mkdir(outputDirectory, { recursive: true });
    await Promise.all([
      copyFile(resolve(directory, "../../manifest.json"), resolve(outputDirectory, "manifest.json")),
      copyFile(resolve(directory, "../../versions.json"), resolve(outputDirectory, "versions.json")),
      copyFile(resolve(directory, "../../LICENSE"), resolve(outputDirectory, "LICENSE")),
      copyFile(resolve(directory, "THIRD_PARTY_LICENSES.md"), resolve(outputDirectory, "THIRD_PARTY_LICENSES.md"))
    ]);
  }
  return result;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const production = process.argv[2] !== "development";
  await buildPlugin({ write: true, production });
}
