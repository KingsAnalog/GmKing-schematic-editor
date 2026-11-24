import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build, version as esbuildVersion } from "esbuild";

const version = "4.1.3";
const builder = "0.25.12";
const packages = [
  {
    name: "@mathjax/src",
    archive: `mathjax-src-${version}.tgz`,
    sha512: "rIrWquuBSoJuoMBdC/1qD+AUHTorlccPicoVy6P2xbUgnuDBpCcpbHtOAsB8L3hdCHtNBg92lF8e3Fz+pkcQbw=="
  },
  {
    name: "@mathjax/mathjax-tex-font",
    archive: `mathjax-mathjax-tex-font-${version}.tgz`,
    sha512: "9B78brBEmmAwyumaREIyM1gF2HgDamDIXA36UyeXWxX7XrpLdmoSB5NLIf/c6tEA4L6xNrIdMxfgY6YX/kcSNw=="
  }
];
const [packageDirectory, outputDirectory] = process.argv.slice(2);
if (!packageDirectory) throw new Error("Usage: node scripts/build-web-mathjax.mjs <npm-pack-directory> [output-directory]");
if (esbuildVersion !== builder) throw new Error(`Expected esbuild ${builder}, got ${esbuildVersion}. Run npm ci first.`);

const component = `
import { startup } from "@mathjax/src/components/js/startup/init.js";
import { Loader } from "@mathjax/src/js/components/loader.js";
import "@mathjax/src/components/js/core/core.js";
import "@mathjax/src/components/js/input/tex/tex.js";
import { loadFont } from "@mathjax/src/components/js/output/svg/svg.js";

Loader.preLoaded("loader", "startup", "core", "input/tex", "output/svg");
Loader.saveVersion("schematic-tex-svg");
loadFont(startup, true);
`;

const scratchParent = resolve(tmpdir());
const scratch = await mkdtemp(join(scratchParent, "schematic-mathjax-build-"));
try {
  for (const { name, archive, sha512 } of packages) {
    const source = resolve(packageDirectory, archive);
    const actual = createHash("sha512").update(await readFile(source)).digest("base64");
    if (actual !== sha512) throw new Error(`Registry tarball integrity mismatch for ${archive}`);
    const directory = join(scratch, "node_modules", name);
    await mkdir(directory, { recursive: true });
    execFileSync("tar", ["-xf", source, "-C", directory, "--strip-components=1"], { stdio: "inherit", windowsHide: true });
    const metadata = JSON.parse(await readFile(join(directory, "package.json"), "utf8"));
    if (metadata.name !== name || metadata.version !== version) throw new Error(`Unexpected package metadata for ${archive}`);
  }

  // Use the official output/svg component, replacing its compile-time default
  // font module with the complete SVG data from the pinned mathjax-tex package.
  const result = await build({
    absWorkingDir: scratch,
    stdin: { contents: component, resolveDir: scratch, sourcefile: "schematic-mathjax-component.js" },
    bundle: true,
    minify: true,
    format: "iife",
    platform: "browser",
    target: "es2022",
    legalComments: "eof",
    banner: { js: `/*! MathJax ${version} + MathJax TeX SVG font ${version} | Apache-2.0 | See LICENSE | https://www.mathjax.org/ */` },
    write: false,
    metafile: true,
    plugins: [{
      name: "mathjax-tex-default-svg-font",
      setup(bundler) {
        bundler.onResolve({ filter: /^#default-font\/svg\/default\.js$/ }, () => ({
          path: "default-svg-font", namespace: "schematic-font"
        }));
        bundler.onLoad({ filter: /^default-svg-font$/, namespace: "schematic-font" }, () => ({
          resolveDir: scratch,
          contents: `
import { MathJaxTexFont } from "@mathjax/mathjax-tex-font/js/svg.js";
export const Font = { fontName: "mathjax-tex", DefaultFont: MathJaxTexFont };
`
        }));
      }
    }]
  });
  if (result.outputFiles.length !== 1 || Object.values(result.metafile.outputs).some(output => output.imports.length)) {
    throw new Error("Expected one self-contained JavaScript file");
  }
  const inputs = Object.keys(result.metafile.inputs);
  const excluded = inputs.filter(path =>
    /\/(?:input\/(?:mml|mathml)(?:\/|\.js)|ui\/menu\/|a11y\/util\.js)|mathjax-newcm-font|speech-rule-engine|mj-context-menu/.test(path)
  );
  if (excluded.length) throw new Error(`Unexpected components in the bundle: ${excluded.join(", ")}`);

  const bundle = result.outputFiles[0].contents;
  const digest = createHash("sha256").update(bundle).digest("hex");
  const name = `tex-svg-mathjax-tex-${version}-${digest.slice(0, 12)}.js`;
  const destination = outputDirectory
    ? resolve(outputDirectory)
    : fileURLToPath(new URL("../apps/web/public/vendor/mathjax/", import.meta.url));
  await mkdir(destination, { recursive: true });
  await writeFile(join(destination, name), bundle);
  await writeFile(join(destination, "LICENSE"), await readFile(join(scratch, "node_modules/@mathjax/src/LICENSE")));
  console.log(`${name} (${bundle.byteLength} bytes, sha256 ${digest})`);
} finally {
  if (dirname(scratch) === scratchParent) await rm(scratch, { recursive: true, force: true });
}
