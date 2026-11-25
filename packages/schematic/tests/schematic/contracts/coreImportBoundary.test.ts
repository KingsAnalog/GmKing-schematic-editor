import { describe, expect, it } from "vitest";

declare global {
  interface ImportMeta {
    glob<Module>(
      pattern: string,
      options: { eager: true; import: string; query: string }
    ): Record<string, Module>;
  }
}

const root = "/src/schematic";
const sources = import.meta.glob<string>("/src/schematic/**/*.ts", {
  eager: true,
  import: "default",
  query: "?raw"
});
const entries = [
  `${root}/portableEntry.ts`,
  `${root}/topology.ts`,
  `${root}/schematicDocumentCodec.ts`,
  `${root}/documentSvgRenderer.ts`,
  `${root}/selection/selectionExport.ts`
];
const bannedFiles = new Set([
  "editor.ts",
  "viewer.ts",
  "schematicDocumentWebAdapter.ts",
  "schematicClipboardWebAdapter.ts",
  "workspaceAdapter.ts",
  "analysisController.ts",
  "analysisWorkerClient.ts"
]);
const interactiveBannedFiles = new Set([
  "schematicTabShell.ts",
  "schematicWebHost.ts",
  "schematicWebEntry.ts",
  "schematicWebEditorHostController.ts",
  "schematicDocumentWebAdapter.ts",
  "schematicClipboardWebAdapter.ts",
  "workspaceAdapter.ts",
  "analysisController.ts",
  "analysisWorkerClient.ts",
  "markdownNoteRuntime.ts",
  "webMarkdownNoteRuntimeAdapter.ts",
]);

describe("schematic core import boundary", () => {
  it("does not pull Web shell, storage, Analysis, JointJS, or browser side effects into core entries", () => {
    const closure = dependencyClosure(entries);
    const relativeFiles = [...closure].map((file) => file.slice(root.length + 1));

    relativeFiles.forEach((file) => expect(bannedFiles.has(file.split("/").at(-1) ?? ""), file).toBe(false));
    closure.forEach((file) => {
      const source = sourceFor(file);
      expect(source, file).not.toMatch(/from\s+["']@joint\/core["']/);
      expect(source, file).not.toMatch(/\b(?:localStorage|sessionStorage|navigator|ClipboardItem|Worker)\b/);
      expect(source, file).not.toMatch(/\b(?:nerdamer|MathJax)\b/i);
      expect(source, file).not.toContain("?raw");
    });
  });

  it("keeps the single-document editor and toolbar controller free of Vite asset imports", () => {
    [`${root}/editor.ts`, `${root}/toolbar.ts`].forEach((file) => {
      const source = sourceFor(file);
      expect(source, file).not.toContain("?raw");
      expect(source, file).not.toMatch(/import\s+["'][^"']+\.css["']/);
    });
  });

  it("keeps the interactive entry independent from Web shell, Analysis, and rich Markdown runtime", () => {
    const closure = dependencyClosure([`${root}/interactiveEntry.ts`]);
    closure.forEach((file) => {
      const basename = file.split("/").at(-1) ?? "";
      expect(interactiveBannedFiles.has(basename), file).toBe(false);
      const source = sourceFor(file);
      expect(source, file).not.toContain("?raw");
      expect(source, file).not.toMatch(/import\s+["'][^"']+\.css["']/);
      expect(source, file).not.toMatch(/\b(?:localStorage|sessionStorage|nerdamer)\b/i);
    });
  });
});

function dependencyClosure(initial: readonly string[]) {
  const visited = new Set<string>();
  const pending = [...initial];
  while (pending.length > 0) {
    const file = pending.pop()!;
    if (visited.has(file)) continue;
    visited.add(file);
    const source = sourceFor(file);
    for (const match of source.matchAll(/(?:from\s+|import\s*\(\s*|import\s*)["'](\.[^"']+)["']/g)) {
      const resolved = resolveImport(file, match[1]);
      if (resolved.startsWith(`${root}/`)) pending.push(resolved);
    }
  }
  return visited;
}

function resolveImport(importer: string, specifier: string) {
  const directory = importer.slice(0, importer.lastIndexOf("/"));
  const candidate = normalizePath(`${directory}/${specifier}`);
  return /\.[^/]+$/.test(candidate) ? candidate : `${candidate}.ts`;
}

function normalizePath(path: string) {
  const segments: string[] = [];
  path.split("/").forEach((segment) => {
    if (!segment || segment === ".") return;
    if (segment === "..") {
      segments.pop();
      return;
    }
    segments.push(segment);
  });
  return `/${segments.join("/")}`;
}

function sourceFor(file: string) {
  const source = sources[file];
  if (typeof source !== "string") throw new Error(`Missing raw source for ${file}`);
  return source;
}
