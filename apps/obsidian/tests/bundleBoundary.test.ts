// @vitest-environment node

import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { buildPlugin } from "../esbuild.config.mjs";

const BANNED_INPUT = /(?:[\\/]analysis[\\/]|[\\/](?:compatibility|migration)[\\/]|analysisWorker|nerdamer|milkdown|prosemirror|mathjax|katex|schematicWeb|schematicTabShell|workspaceAdapter|DocumentWebAdapter|ClipboardWebAdapter|selectionExportWebAdapter|[?]raw)/i;

describe("Obsidian bundle boundary", () => {
  it("ships one CJS bundle without Web, Analysis, rich Markdown, or duplicate CM6", async () => {
    const result = await buildPlugin({ write: false, production: true });
    if (!result.metafile) throw new Error("Obsidian build did not return a metafile.");
    const inputs = Object.keys(result.metafile.inputs).map((input) => input.replace(/\\/g, "/"));
    inputs.forEach((input) => expect(input, input).not.toMatch(BANNED_INPUT));
    inputs.forEach((input) => {
      expect(input, input).not.toMatch(/node_modules\/(?:@codemirror|@lezer)\//);
      expect(input, input).not.toMatch(/node_modules\/obsidian\//);
    });
    expect(inputs.some((input) => input.includes("node_modules/@joint/core/"))).toBe(true);
    expect(inputs.some((input) => input.includes("node_modules/json-stringify-pretty-compact/"))).toBe(true);

    const bundledPackages = [...new Set(inputs.flatMap(packageNameFromInput))].sort();
    expect(bundledPackages).toEqual(["@joint/core", "dompurify", "json-stringify-pretty-compact"]);

    const licenses = await readFile(new URL("../THIRD_PARTY_LICENSES.md", import.meta.url), "utf8");
    expect(licenses).toContain("DOMPurify (`dompurify` 3.4.18)");
    expect(licenses).toContain("@joint/core` 4.2.4");
    expect(licenses).toContain("json-stringify-pretty-compact` 4.0.0");
    expect(licenses).toContain("https://www.npmjs.com/package/@joint/core/v/4.2.4");
    expect(licenses).toContain("Permission is hereby granted, free of charge");

    const outputs = Object.keys(result.metafile.outputs).map((output) => output.replace(/\\/g, "/"));
    expect(outputs.filter((output) => output.endsWith(".js"))).toHaveLength(1);
    expect(outputs.filter((output) => output.endsWith(".css"))).toHaveLength(1);
    expect(outputs.some((output) => /(?:chunk|worker)[^/]*\.js$/i.test(output))).toBe(false);
    const javascript = result.outputFiles?.find((output) => output.path.endsWith(".js"))?.text;
    expect(javascript).toContain("toggle-wire-route");
    expect(javascript).toContain("Toggle wire route mode");
    expect(javascript).toContain("Copy as JSON");
    expect(javascript).not.toMatch(/Schematic (?:V1 JSON|SVG|PNG) copied\.|Schematic reset\./);

    const runtimeImports = result.metafile.outputs["dist/main.js"]?.imports ?? [];
    expect(runtimeImports.every((input) => input.external && input.kind === "require-call")).toBe(true);
    expect([...new Set(runtimeImports.map((input) => input.path))].sort()).toEqual([
      "@codemirror/commands",
      "@codemirror/language",
      "@codemirror/state",
      "@codemirror/view",
      "obsidian"
    ]);

    const css = result.outputFiles?.find((output) => output.path.endsWith(".css"))?.text;
    expect(css).toBeDefined();
    expect(css).toContain(".schematic-editor-root .schematic-paper.is-delete-mode");
    expect(css).toContain(".schematic-editor-root .schematic-note-raw-markdown-content");
    expect(css).toContain(".schematic-editor-root .instance-query-overlay");
    expect(css).toContain(".schematic-editor-root .property-color-control");
    expect(css).toContain(".schematic-editor-root .property-row input:not([type=checkbox])");
    expect(css).not.toContain("520px");
    expect(css).toContain("24vh");
    expect(css).toContain("24dvh");
    expect(css).toContain("100dvh");
    expect(css).toContain("42em");
    expect(css).not.toMatch(/analysis-panel|schematic-document-tabs|schematic-workspace/);
    expect(css).not.toMatch(/milkdown|ProseMirror|schematic-markdown-math/);
  });

  it("keeps release metadata aligned with the plugin package", async () => {
    const manifest = JSON.parse(await readFile(new URL("../../../manifest.json", import.meta.url), "utf8"));
    const versions = JSON.parse(await readFile(new URL("../../../versions.json", import.meta.url), "utf8"));
    const pluginPackage = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
    expect(manifest).toMatchObject({
      id: "schematic-editor",
      name: "GmKing",
      version: pluginPackage.version,
      minAppVersion: "1.13.4",
      author: "RarityBrown",
      isDesktopOnly: true
    });
    expect(versions[manifest.version]).toBe(manifest.minAppVersion);
  });
});

function packageNameFromInput(input: string) {
  const relative = input.split("node_modules/")[1];
  if (!relative) return [];
  const segments = relative.split("/");
  return [segments[0]?.startsWith("@") ? segments.slice(0, 2).join("/") : segments[0]];
}
