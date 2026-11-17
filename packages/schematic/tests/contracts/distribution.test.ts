import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { build } from "esbuild";
function sources(dir: string): string[] { return readdirSync(dir,{withFileTypes:true}).flatMap(entry=>entry.isDirectory()?sources(resolve(dir,entry.name)):[resolve(dir,entry.name)]); }
describe("independent distribution",()=>{
  it("contains no imports of ADChelper application state or sibling source trees",()=>{
    for(const file of sources(resolve("src")).filter(file=>file.endsWith(".ts"))){
      const text=readFileSync(file,"utf8");
      expect(text,file).not.toMatch(/(?:from|import\s*\()\s*["'][^"']*(?:ADChelper|pipelineAdc|appTabs|timeBudget)[^"']*["']/);
    }
  });
  it("keeps the distributed portable entry independent of browser rendering and Web libraries",async()=>{
    const result=await build({entryPoints:[resolve("dist/schematic/portableEntry.js")],bundle:true,platform:"node",format:"esm",write:false,metafile:true,logLevel:"silent"});
    for(const file of Object.keys(result.metafile!.inputs))expect(file).not.toMatch(/@joint|milkdown|nerdamer|schematicWeb|analysisWorker/);
    expect(readFileSync("dist/schematic/analysis/analysis.worker.js","utf8").includes('self.addEventListener("message"')).toBe(true);
  });
});
