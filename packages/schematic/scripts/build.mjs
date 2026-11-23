import { readFile, writeFile, readdir, mkdir, rm, copyFile } from "node:fs/promises";
import { resolve, relative, dirname, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { transform, build } from "esbuild";
import { writeDependencyNotices } from "../../../scripts/dependency-notices.mjs";
const root = fileURLToPath(new URL("..", import.meta.url));
const out = resolve(root, "dist");
if (out !== resolve(root, "dist")) throw new Error("Invalid build directory");
await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });
async function walk(dir) { return (await Promise.all((await readdir(dir, { withFileTypes: true })).map(e => e.isDirectory() ? walk(resolve(dir,e.name)) : resolve(dir,e.name)))).flat(); }
const files = await walk(resolve(root,"src"));
for (const file of files.filter(f => f.endsWith(".ts") && !f.endsWith(".d.ts"))) {
  let code = await readFile(file,"utf8");
  for (const match of [...code.matchAll(/import (\w+) from ["']([^"']+\.svg)\?raw["'];/g)]) {
    code = code.replace(match[0], "const " + match[1] + " = " + JSON.stringify(await readFile(resolve(dirname(file),match[2]),"utf8")) + ";");
  }
  code = code.replace(/import ["'][^"']+\.css["'];/g, "");
  code = code.replace('new URL("./analysis.worker.ts", import.meta.url)', 'new URL("./analysis.worker.js", import.meta.url)');
  let result = (await transform(code,{loader:"ts",format:"esm",target:"es2022",sourcefile:relative(root,file)})).code;
  result = result.replace(/((?:from\s*|import\s*\(\s*)["'])(\.[^"']+)(["'])/g, (all,prefix,spec,suffix) => prefix + spec.replace(/\.ts$/,"") + (extname(spec) && !spec.endsWith(".ts") ? "" : ".js") + suffix);
  const dest=resolve(out,relative(resolve(root,"src"),file).replace(/\.ts$/,".js"));
  await mkdir(dirname(dest),{recursive:true});await writeFile(dest,result);
}
await build({entryPoints:[resolve(root,"src/schematic/analysis/analysis.worker.ts")],outfile:resolve(out,"schematic/analysis/analysis.worker.js"),bundle:true,platform:"browser",format:"esm",target:"es2022",legalComments:"eof"});
const require=createRequire(import.meta.url);
const types=spawnSync(process.execPath,[require.resolve("typescript/bin/tsc"),"-p","tsconfig.build.json"],{cwd:root,stdio:"inherit",windowsHide:true});
if(types.status!==0)process.exit(types.status??1);
await mkdir(resolve(out,"styles"),{recursive:true});
await copyFile(resolve(root,"src/schematic/schematicCore.css"),resolve(out,"styles/editor.css"));
const webCss=(await readFile(resolve(root,"src/schematic/schematic.css"),"utf8")).replace('./schematicCore.css','./editor.css');
await writeFile(resolve(out,"styles/web.css"),webCss);
await writeDependencyNotices(out);
console.log("Built independent ESM modules, declarations, styles, analysis Worker and licenses.");
