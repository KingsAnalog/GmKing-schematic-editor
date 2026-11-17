import { describe, expect, it } from "vitest";

declare global {
  interface ImportMeta {
    glob<Module>(
      pattern: string,
      options: { eager: true; import: string; query: string }
    ): Record<string, Module>;
  }
}

const sources = import.meta.glob<string>("/src/schematic/notes/*.ts", {
  eager: true,
  import: "default",
  query: "?raw"
});

function source(name: string) {
  const value = sources[`/src/schematic/notes/${name}`];
  if (typeof value !== "string") throw new Error(`Missing raw Note source: ${name}`);
  return value;
}

describe("schematic Note runtime boundary", () => {
  it("keeps the shared layer and portable adapter independent of the Web Markdown stack", () => {
    ["noteLayer.ts", "noteRuntimeAdapter.ts", "rawTextNoteRuntimeAdapter.ts"].forEach((name) => {
      const value = source(name);
      expect(value, name).not.toMatch(/["']\.\/markdownNoteRuntime["']/);
      expect(value, name).not.toMatch(/\b(?:Milkdown|MathJax|ProseMirror)\b/i);
    });
  });

  it("contains the rich Markdown dependency in the explicit Web adapter", () => {
    expect(source("webMarkdownNoteRuntimeAdapter.ts"))
      .toContain('from "./markdownNoteRuntime"');
  });
});
